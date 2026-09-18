'use strict';

/**
 * Step 7 Provider Boundary / Quotas — negative tests first.
 */

const assert = require('assert');

const {
  LIMIT_REASON,
  createProviderRateLimiter
} = require('../backend/middleware/providerratelimit');

const {
  createInferenceRouter,
  INFERENCE_REASON
} = require('../backend/inference/router');

const { createXaiAdapter } = require('../backend/inference/xai_adapter');
const { ROUTE } = require('../backend/coordination/devassist_router');

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
// NEGATIVE
// ---------------------------------------------------------------------------
check('Infinity limit construction rejected', () => {
  let threw = false;
  try {
    createProviderRateLimiter({ limits: { owner: Infinity } });
  } catch {
    threw = true;
  }
  assert.strictEqual(threw, true);
});

check('invalid request → INVALID', () => {
  const lim = createProviderRateLimiter({ limits: { owner: 2 } });
  const r = lim.check(null);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, LIMIT_REASON.INVALID);
  assert.strictEqual(r.threat, true);
});

check('external quota exceeded → QUOTA_EXCEEDED, local still available', () => {
  const lim = createProviderRateLimiter({ limits: { owner: 2 }, windowMs: 60_000 });
  const now = 1_000_000;
  assert.strictEqual(lim.check({ role: 'owner', path: 'external', now }).allowed, true);
  assert.strictEqual(lim.check({ role: 'owner', path: 'external', now }).allowed, true);
  const third = lim.check({ role: 'owner', path: 'external', now });
  assert.strictEqual(third.allowed, false);
  assert.strictEqual(third.reason, LIMIT_REASON.QUOTA_EXCEEDED);
  assert.strictEqual(third.local_still_available, true);
  assert.strictEqual(third.threat, false);
});

check('quota does not block local path checks', () => {
  const lim = createProviderRateLimiter({ limits: { owner: 1 }, windowMs: 60_000 });
  const now = 2_000_000;
  assert.strictEqual(lim.check({ role: 'owner', path: 'external', now }).allowed, true);
  assert.strictEqual(lim.check({ role: 'owner', path: 'external', now }).allowed, false);
  const local = lim.check({ role: 'owner', path: 'local', now });
  assert.strictEqual(local.allowed, true);
  assert.strictEqual(local.reason, LIMIT_REASON.NOT_EXTERNAL);
  assert.strictEqual(local.limited, false);
});

check('internal path never limited by provider middleware', () => {
  const lim = createProviderRateLimiter({ limits: { owner: 0 } });
  const r = lim.check({ role: 'owner', path: 'internal' });
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.reason, LIMIT_REASON.NOT_EXTERNAL);
});

check('owner is limited (no unlimited bypass)', () => {
  const lim = createProviderRateLimiter({ limits: { owner: 1 }, windowMs: 60_000 });
  const now = 3_000_000;
  assert.strictEqual(lim.check({ role: 'owner', path: 'external', now }).allowed, true);
  assert.strictEqual(lim.check({ role: 'owner', path: 'external', now }).allowed, false);
});

// ---------------------------------------------------------------------------
// POSITIVE / integration with inference
// ---------------------------------------------------------------------------
check('external quota fail leaves local inference working', () => {
  const lim = createProviderRateLimiter({ limits: { owner: 0 }, windowMs: 60_000 });
  const boundary = lim.check({ role: 'owner', path: 'external', now: 4_000_000 });
  assert.strictEqual(boundary.allowed, false);
  assert.strictEqual(boundary.local_still_available, true);

  const inference = createInferenceRouter({
    xai: createXaiAdapter({ enabled: false })
  });
  const localRoute = {
    allowed: true,
    route: ROUTE.LOCAL,
    action: 'read',
    actor: 'Appel420'
  };
  const r = inference.execute(localRoute, { prompt: 'still works' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.reason, INFERENCE_REASON.LOCAL_OK);
  assert.strictEqual(r.provider_involved, false);
});

check('under quota external check ALLOWED', () => {
  const lim = createProviderRateLimiter({ limits: { developer: 5 }, windowMs: 60_000 });
  const r = lim.check({ role: 'developer', path: 'external', now: 5_000_000 });
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.reason, LIMIT_REASON.ALLOWED);
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.limit, 5);
});

if (failures > 0) {
  console.error('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll provider boundary gate tests passed.');
process.exit(0);
