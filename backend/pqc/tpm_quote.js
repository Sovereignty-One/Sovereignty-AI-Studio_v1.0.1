'use strict';

/**
 * Step 15 — Real TPM 2.0 quote bridge.
 *
 * This module never fabricates TPM evidence. It invokes configured tpm2-tools
 * commands and requires non-empty quote, signature, and PCR evidence.
 * Verification is delegated to tpm2_checkquote using the configured AK/public
 * material. Missing tools, keys, or verification failure => DENY.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');

const TPM_REASON = Object.freeze({
  INVALID: 'INVALID',
  TOOL_UNAVAILABLE: 'TOOL_UNAVAILABLE',
  QUOTE_FAILED: 'QUOTE_FAILED',
  EMPTY_QUOTE: 'EMPTY_QUOTE',
  VERIFY_FAILED: 'VERIFY_FAILED',
  VERIFIED: 'VERIFIED'
});

function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    return { ok: false, error: r.error ? r.error.message : (r.stderr || '').trim() };
  }
  return { ok: true, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function requireFile(file) {
  return typeof file === 'string' && file.length > 0 && fs.existsSync(file);
}

/**
 * Generate a quote bound to the supplied nonce.
 * Options:
 *   akContext, pcrs, quoteFile, signatureFile, pcrFile, hash
 */
function generateTpmQuote(nonce, options) {
  if (typeof nonce !== 'string' || nonce.length < 32) {
    return { ok: false, reason: TPM_REASON.INVALID, threat: true };
  }
  const o = options || {};
  if (!o.akContext || !o.quoteFile || !o.signatureFile || !o.pcrFile) {
    return { ok: false, reason: TPM_REASON.INVALID, threat: true };
  }
  const pcrs = o.pcrs || 'sha256:0,1,2,7';
  const hash = o.hash || 'sha256';
  const r = run('tpm2_quote', [
    '-c', o.akContext,
    '-l', pcrs,
    '-q', nonce,
    '-g', hash,
    '-m', o.quoteFile,
    '-s', o.signatureFile,
    '-o', o.pcrFile
  ]);
  if (!r.ok) return { ok: false, reason: TPM_REASON.QUOTE_FAILED, threat: true, detail: r.error };
  if (!fs.existsSync(o.quoteFile) || fs.statSync(o.quoteFile).size === 0 ||
      !fs.existsSync(o.signatureFile) || fs.statSync(o.signatureFile).size === 0 ||
      !fs.existsSync(o.pcrFile) || fs.statSync(o.pcrFile).size === 0) {
    return { ok: false, reason: TPM_REASON.EMPTY_QUOTE, threat: true };
  }
  return {
    ok: true,
    reason: TPM_REASON.VERIFIED,
    threat: false,
    nonce,
    quote_file: o.quoteFile,
    signature_file: o.signatureFile,
    pcr_file: o.pcrFile,
    pcrs,
    hash
  };
}

/**
 * Verify generated evidence with tpm2_checkquote.
 * The TPM tool must independently verify the signature/PCR data and nonce.
 */
function verifyTpmQuote(evidence, options) {
  if (!evidence || typeof evidence !== 'object' || typeof evidence.nonce !== 'string') {
    return { ok: false, reason: TPM_REASON.INVALID, threat: true };
  }
  const o = options || {};
  if (!o.publicKey || !requireFile(evidence.quote_file) || !requireFile(evidence.signature_file) || !requireFile(evidence.pcr_file)) {
    return { ok: false, reason: TPM_REASON.INVALID, threat: true };
  }
  const r = run('tpm2_checkquote', [
    '-u', o.publicKey,
    '-m', evidence.quote_file,
    '-s', evidence.signature_file,
    '-f', evidence.pcr_file,
    '-q', evidence.nonce
  ]);
  if (!r.ok) return { ok: false, reason: TPM_REASON.VERIFY_FAILED, threat: true, detail: r.error };
  return { ok: true, reason: TPM_REASON.VERIFIED, threat: false, nonce: evidence.nonce };
}

module.exports = { TPM_REASON, generateTpmQuote, verifyTpmQuote };
