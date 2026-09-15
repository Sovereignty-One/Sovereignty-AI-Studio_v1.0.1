'use strict';

/**
 * Step 8 Typed Provider Errors — negative tests first.
 */

const assert = require('assert');

const {
  ProviderError,
  ProviderQuotaError,
  ProviderUnavailableError,
  ProviderTimeoutError,
  ProviderAuthError,
  ProviderPolicyDeniedError,
  ProviderNetworkDeniedError,
  PROVIDER_ERROR_CODES,
  classifyProviderFailure,
  isFallbackCandidate
} = require('../backend/errors/provider_errors');

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

// ---------------------------------------------------------------------------
// NEGATIVE / classification
// ---------------------------------------------------------------------------
check('auth error is not fallback candidate', () => {
  const e = new ProviderAuthError();
  assert.strictEqual(e.fallback_candidate, false);
  assert.strictEqual(e.retryable, false);
  assert.strictEqual(isFallbackCandidate(e, { policy_allows_fallback: true }), false);
});

check('policy denied is not fallback candidate', () => {
  const e = new ProviderPolicyDeniedError();
  assert.strictEqual(e.fallback_candidate, false);
  assert.strictEqual(isFallbackCandidate(e), false);
});

check('network denied is not fallback candidate', () => {
  const e = new ProviderNetworkDeniedError();
  assert.strictEqual(e.fallback_candidate, false);
  assert.strictEqual(isFallbackCandidate(e, { policy_allows_fallback: true }), false);
});

check('quota is fallback candidate only when policy allows', () => {
  const e = new ProviderQuotaError();
  assert.strictEqual(e.fallback_candidate, true);
  assert.strictEqual(isFallbackCandidate(e, { policy_allows_fallback: true }), true);
  assert.strictEqual(isFallbackCandidate(e, { policy_allows_fallback: false }), false);
});

check('generic object without fallback_candidate is not eligible', () => {
  assert.strictEqual(isFallbackCandidate({ message: 'failed' }), false);
  assert.strictEqual(isFallbackCandidate(new Error('failed')), false);
});

check('classify quota reason → ProviderQuotaError', () => {
  const e = classifyProviderFailure('PROVIDER_QUOTA_EXCEEDED');
  assert.ok(e instanceof ProviderQuotaError);
  assert.strictEqual(e.code, PROVIDER_ERROR_CODES.PROVIDER_QUOTA);
  assert.strictEqual(e.fallback_candidate, true);
});

check('classify auth → ProviderAuthError', () => {
  const e = classifyProviderFailure('PROVIDER_AUTH');
  assert.ok(e instanceof ProviderAuthError);
  assert.strictEqual(e.fallback_candidate, false);
});

check('classify network denied → ProviderNetworkDeniedError', () => {
  const e = classifyProviderFailure('NETWORK_DISABLED');
  assert.ok(e instanceof ProviderNetworkDeniedError);
});

check('unknown reason still typed, not silent null', () => {
  const e = classifyProviderFailure('SOMETHING_WEIRD');
  assert.ok(e instanceof ProviderUnavailableError);
  assert.strictEqual(e.details.code_detail, PROVIDER_ERROR_CODES.PROVIDER_UNKNOWN);
  assert.ok(e instanceof ProviderError);
});

check('toJSON is machine readable', () => {
  const e = new ProviderTimeoutError('slow', { ms: 30000 });
  const j = e.toJSON();
  assert.strictEqual(j.code, PROVIDER_ERROR_CODES.PROVIDER_TIMEOUT);
  assert.strictEqual(j.fallback_candidate, true);
  assert.strictEqual(j.path, 'external');
  assert.strictEqual(j.details.ms, 30000);
});

check('timeout and unavailable are fallback candidates', () => {
  assert.strictEqual(new ProviderTimeoutError().fallback_candidate, true);
  assert.strictEqual(new ProviderUnavailableError().fallback_candidate, true);
});

if (failures > 0) {
  console.error('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll typed provider error gate tests passed.');
process.exit(0);
