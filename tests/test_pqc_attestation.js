'use strict';

/**
 * Step 11 PQC / TPM / CBOR — negative tests first.
 */

const assert = require('assert');
const crypto = require('crypto');

const { encodeCbor } = require('../backend/pqc/cbor_minimal');
const {
  ATTEST_REASON,
  isEmptyTpmQuote,
  issueAttestation,
  verifyAttestationGates,
  encodeClaimsDeterministic,
  buildClaims
} = require('../backend/pqc/attestation');

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log('PASS  ' + name);
  } catch (err) {
    failures += 1;
    console.error('FAIL  ' + name);
    console.error('      ' + (err && err.message ? err.message : err));
  }
}

const realTpm = Buffer.from('TPMS_ATTEST-placeholder-not-empty-but-not-valid');
const nonce = crypto.randomBytes(32).toString('hex');

// ---------------------------------------------------------------------------
// NEGATIVE
// ---------------------------------------------------------------------------
check('empty object tpm_quote is empty', () => {
  assert.strictEqual(isEmptyTpmQuote({}), true);
});

check('null tpm_quote is empty', () => {
  assert.strictEqual(isEmptyTpmQuote(null), true);
});

check('issue with empty tpm_quote → DENY', () => {
  const r = issueAttestation({
    node_id: 'REPMHL-NODE-01',
    nonce,
    tpm_quote: {}
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, ATTEST_REASON.EMPTY_TPM_QUOTE);
  assert.strictEqual(r.threat, true);
});

check('issue missing nonce → DENY', () => {
  const r = issueAttestation({
    node_id: 'REPMHL-NODE-01',
    nonce: 'short',
    tpm_quote: realTpm
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, ATTEST_REASON.MISSING_FIELDS);
});

check('verify with empty signature → DENY', () => {
  const issued = issueAttestation({
    node_id: 'REPMHL-NODE-01',
    nonce,
    tpm_quote: realTpm
  });
  assert.strictEqual(issued.ok, true);
  const v = verifyAttestationGates(issued.token, { tpm_ok: true, mldsa_ok: true });
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.reason, ATTEST_REASON.VERIFY_DENIED);
});

check('verify without tpm_ok → DENY', () => {
  const issued = issueAttestation({
    node_id: 'REPMHL-NODE-01',
    nonce,
    tpm_quote: realTpm,
    signature: Buffer.alloc(64, 1)
  });
  const v = verifyAttestationGates(issued.token, { tpm_ok: false, mldsa_ok: true });
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.reason, ATTEST_REASON.EMPTY_TPM_QUOTE);
});

check('verify without mldsa_ok → DENY', () => {
  const issued = issueAttestation({
    node_id: 'REPMHL-NODE-01',
    nonce,
    tpm_quote: realTpm,
    signature: Buffer.alloc(64, 1)
  });
  const v = verifyAttestationGates(issued.token, { tpm_ok: true, mldsa_ok: false });
  assert.strictEqual(v.valid, false);
  assert.strictEqual(v.reason, ATTEST_REASON.VERIFY_DENIED);
});

// ---------------------------------------------------------------------------
// POSITIVE (structural)
// ---------------------------------------------------------------------------
check('deterministic CBOR: same claims same bytes', () => {
  const c = buildClaims({
    node_id: 'REPMHL-NODE-01',
    nonce,
    tpm_quote: realTpm,
    iat: 1700000000
  });
  assert.strictEqual(c.ok, true);
  const a = encodeClaimsDeterministic(c.claims);
  const b = encodeClaimsDeterministic(c.claims);
  assert.ok(a.equals(b));
});

check('CBOR map key order deterministic', () => {
  const x = encodeCbor({ b: 1, a: 2 });
  const y = encodeCbor({ a: 2, b: 1 });
  assert.ok(x.equals(y));
});

check('issue with non-empty tpm builds COSE_Sign1 shape', () => {
  const r = issueAttestation({
    node_id: 'REPMHL-NODE-01',
    nonce,
    tpm_quote: realTpm
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.token.format, 'COSE_Sign1');
  assert.ok(Buffer.isBuffer(r.token.payload));
  assert.ok(r.token.payload_sha256.length === 64);
});

check('gates pass only with explicit real verify flags', () => {
  const issued = issueAttestation({
    node_id: 'REPMHL-NODE-01',
    nonce,
    tpm_quote: realTpm,
    signature: Buffer.alloc(64, 7)
  });
  const v = verifyAttestationGates(issued.token, { tpm_ok: true, mldsa_ok: true });
  assert.strictEqual(v.valid, true);
});

if (failures > 0) {
  console.error('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll PQC attestation gate tests passed.');
process.exit(0);
