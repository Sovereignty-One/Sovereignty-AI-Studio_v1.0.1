'use strict';

/**
 * PQC Attestation gates — Step 11
 *
 * - Empty/missing tpm_quote ⇒ unconditional DENY
 * - Deterministic CBOR claims (not JSON-wrapped-in-CBOR)
 * - COSE_Sign1-shaped structure
 * - No fake ML-DSA or TPM success (wire-up to liboqs/TPM is explicit fail-closed until present)
 */

const crypto = require('crypto');
const { encodeCbor } = require('./cbor_minimal');

const ATTEST_REASON = Object.freeze({
  EMPTY_TPM_QUOTE: 'EMPTY_TPM_QUOTE',
  MISSING_FIELDS: 'MISSING_FIELDS',
  NON_DETERMINISTIC: 'NON_DETERMINISTIC',
  TOKEN_BUILT: 'TOKEN_BUILT',
  VERIFY_DENIED: 'VERIFY_DENIED',
  INVALID: 'INVALID'
});

function isEmptyTpmQuote(tpmQuote) {
  if (tpmQuote == null) return true;
  if (Buffer.isBuffer(tpmQuote) && tpmQuote.length === 0) return true;
  if (typeof tpmQuote === 'object' && !Buffer.isBuffer(tpmQuote) && Object.keys(tpmQuote).length === 0) {
    return true;
  }
  if (typeof tpmQuote === 'string' && tpmQuote.length === 0) return true;
  return false;
}

/**
 * Build canonical attestation claims (EAT/CWT-oriented field names as strings for v1).
 */
function buildClaims(input) {
  if (!input || typeof input.node_id !== 'string' || !input.node_id) {
    return { ok: false, reason: ATTEST_REASON.MISSING_FIELDS, claims: null };
  }
  if (typeof input.nonce !== 'string' || input.nonce.length < 32) {
    return { ok: false, reason: ATTEST_REASON.MISSING_FIELDS, claims: null };
  }
  if (isEmptyTpmQuote(input.tpm_quote)) {
    return { ok: false, reason: ATTEST_REASON.EMPTY_TPM_QUOTE, claims: null, threat: true };
  }
  const claims = {
    node_id: input.node_id,
    iat: typeof input.iat === 'number' ? input.iat : Math.floor(Date.now() / 1000),
    nonce: input.nonce,
    alg: 'ML-DSA-87',
    tpm_quote: Buffer.isBuffer(input.tpm_quote)
      ? input.tpm_quote
      : Buffer.from(
          typeof input.tpm_quote === 'string'
            ? input.tpm_quote
            : JSON.stringify(input.tpm_quote),
          'utf8'
        )
  };
  return { ok: true, claims };
}

/**
 * Deterministic CBOR encoding of claims. Same claims ⇒ same bytes.
 */
function encodeClaimsDeterministic(claims) {
  // Encode tpm_quote as bstr; ensure pure data object
  const forCbor = {
    alg: claims.alg,
    iat: claims.iat,
    node_id: claims.node_id,
    nonce: claims.nonce,
    tpm_quote: claims.tpm_quote
  };
  return encodeCbor(forCbor);
}

/**
 * Build COSE_Sign1-shaped token structure (array: protected, unprotected, payload, signature).
 * Signature is empty until real ML-DSA is applied — verify must DENY empty sig.
 */
function buildCoseSign1Token(claims, signatureBytes) {
  const payload = encodeClaimsDeterministic(claims);
  const protectedHeaders = encodeCbor({ alg: 'ML-DSA-87' });
  const unprotected = {};
  const sig =
    Buffer.isBuffer(signatureBytes) && signatureBytes.length > 0
      ? signatureBytes
      : Buffer.alloc(0);

  return {
    format: 'COSE_Sign1',
    protected: protectedHeaders,
    unprotected,
    payload,
    signature: sig,
    payload_sha256: crypto.createHash('sha256').update(payload).digest('hex')
  };
}

/**
 * Issue attestation token. Fails closed on empty TPM.
 * Does not invent ML-DSA signatures.
 */
function issueAttestation(input) {
  const built = buildClaims(input);
  if (!built.ok) {
    return {
      ok: false,
      reason: built.reason,
      threat: built.threat === true,
      token: null
    };
  }
  const a = encodeClaimsDeterministic(built.claims);
  const b = encodeClaimsDeterministic(built.claims);
  if (!a.equals(b)) {
    return { ok: false, reason: ATTEST_REASON.NON_DETERMINISTIC, threat: true, token: null };
  }
  const token = buildCoseSign1Token(built.claims, input.signature);
  return {
    ok: true,
    reason: ATTEST_REASON.TOKEN_BUILT,
    threat: false,
    token,
    note: 'Signature must be real ML-DSA-87; empty signature will fail verify'
  };
}

/**
 * Verify gates (structural). Empty TPM / empty signature ⇒ DENY.
 * Full ML-DSA verify is delegated to Python oqs path / future binding.
 */
function verifyAttestationGates(token, opts) {
  if (!token || token.format !== 'COSE_Sign1') {
    return { valid: false, reason: ATTEST_REASON.INVALID, threat: true };
  }
  if (!Buffer.isBuffer(token.payload) || token.payload.length === 0) {
    return { valid: false, reason: ATTEST_REASON.INVALID, threat: true };
  }
  if (!Buffer.isBuffer(token.signature) || token.signature.length === 0) {
    return { valid: false, reason: ATTEST_REASON.VERIFY_DENIED, detail: 'empty_signature', threat: true };
  }
  // TPM presence was required at issue; re-check cannot parse full CBOR here without decoder.
  // Require explicit tpm_ok from caller until full CBOR decode is available.
  if (!opts || opts.tpm_ok !== true) {
    return {
      valid: false,
      reason: ATTEST_REASON.EMPTY_TPM_QUOTE,
      detail: 'tpm_ok required true after real TPM validation',
      threat: true
    };
  }
  if (opts.mldsa_ok !== true) {
    return {
      valid: false,
      reason: ATTEST_REASON.VERIFY_DENIED,
      detail: 'mldsa_ok required true after real ML-DSA-87 verify',
      threat: true
    };
  }
  return { valid: true, reason: 'GATES_PASSED', threat: false };
}

module.exports = {
  ATTEST_REASON,
  isEmptyTpmQuote,
  buildClaims,
  encodeClaimsDeterministic,
  buildCoseSign1Token,
  issueAttestation,
  verifyAttestationGates
};
