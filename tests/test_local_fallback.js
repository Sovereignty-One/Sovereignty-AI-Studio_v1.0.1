'use strict';

/**
 * Step 9 Policy-approved Local Fallback — negative tests first.
 */

const assert = require('assert');

const {
  ProviderQuotaError,
  ProviderAuthError,
  ProviderPolicyDeniedError,
  ProviderNetworkDeniedError,
  ProviderTimeoutError
} = require('../backend/errors/provider_errors');

const {
  FALLBACK_REASON,
  attemptLocalFallback
} = require('../backend/inference/fallback');

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

const job = { action: 'read', actor: 'Appel420', prompt: 'fallback-me' };

// ---------------------------------------------------------------------------
// NEGATIVE
// ---------------------------------------------------------------------------
check('invalid input → INVALID', () => {
  const r = attemptLocalFallback(null);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.fell_back, false);
  assert.strictEqual(r.reason, FALLBACK_REASON.INVALID);
  assert.strictEqual(r.threat, true);
});

check('auth error never falls back even if policy allows', () => {
  const r = attemptLocalFallback({
    error: new ProviderAuthError(),
    policy_allows_fallback: true,
    job
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.fell_back, false);
  assert.strictEqual(r.reason, FALLBACK_REASON.NOT_CANDIDATE);
});

check('policy-denied error never falls back', () => {
  const r = attemptLocalFallback({
    error: new ProviderPolicyDeniedError(),
    policy_allows_fallback: true,
    job
  });
  assert.strictEqual(r.fell_back, false);
  assert.strictEqual(r.reason, FALLBACK_REASON.NOT_CANDIDATE);
});

check('network-denied error never falls back', () => {
  const r = attemptLocalFallback({
    error: new ProviderNetworkDeniedError(),
    policy_allows_fallback: true,
    job
  });
  assert.strictEqual(r.fell_back, false);
  assert.strictEqual(r.reason, FALLBACK_REASON.NOT_CANDIDATE);
});

check('quota candidate blocked when policy disallows', () => {
  const r = attemptLocalFallback({
    error: new ProviderQuotaError(),
    policy_allows_fallback: false,
    job
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.fell_back, false);
  assert.strictEqual(r.reason, FALLBACK_REASON.POLICY_DISALLOWS);
});

check('missing job on execute path → INVALID', () => {
  const r = attemptLocalFallback({
    error: new ProviderQuotaError(),
    policy_allows_fallback: true,
    job: null
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, FALLBACK_REASON.INVALID);
});

// ---------------------------------------------------------------------------
// POSITIVE
// ---------------------------------------------------------------------------
check('quota + policy allows → local fallback executed', () => {
  const r = attemptLocalFallback({
    error: new ProviderQuotaError(),
    policy_allows_fallback: true,
    job
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fell_back, true);
  assert.strictEqual(r.reason, FALLBACK_REASON.LOCAL_EXECUTED);
  assert.strictEqual(r.local.ok, true);
  assert.strictEqual(r.local.output.network, false);
  assert.strictEqual(r.local.output.echo, 'fallback-me');
});

check('timeout + policy allows → local fallback', () => {
  const r = attemptLocalFallback({
    error: new ProviderTimeoutError(),
    policy_allows_fallback: true,
    job
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fell_back, true);
});

check('string reason classified then fallback when allowed', () => {
  const r = attemptLocalFallback({
    error: 'PROVIDER_QUOTA_EXCEEDED',
    policy_allows_fallback: true,
    job
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.fell_back, true);
});

check('decide-only mode does not execute but reports would_fallback', () => {
  const r = attemptLocalFallback({
    error: new ProviderQuotaError(),
    policy_allows_fallback: true,
    job,
    execute: false
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.would_fallback, true);
  assert.strictEqual(r.fell_back, false);
});

if (failures > 0) {
  console.error('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll local fallback gate tests passed.');
process.exit(0);
