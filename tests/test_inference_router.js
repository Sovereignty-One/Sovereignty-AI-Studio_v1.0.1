'use strict';

/**
 * Step 6 Inference Router — negative tests first.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const {
  loadCanonicalState,
  buildCanonicalState,
  writeCanonicalState
} = require('../backend/state/canonical_state');

const {
  createOwnerIdentity,
  createIdentityRegistry
} = require('../backend/identity/identity_adapter');

const { createExecutionPolicy } = require('../backend/policy/execution_policy');
const { createDevAssistRouter, ROUTE } = require('../backend/coordination/devassist_router');
const { createXaiAdapter, PROVIDER_REASON } = require('../backend/inference/xai_adapter');
const { createInferenceRouter, INFERENCE_REASON } = require('../backend/inference/router');
const { executeLocal, LOCAL_REASON } = require('../backend/inference/local_runtime');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'infer-'));
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

const stateFile = path.join(tmpRoot, 'state.json');
writeCanonicalState(stateFile, buildCanonicalState({ owner_id: 'Appel420' }));
const canonicalOk = loadCanonicalState(stateFile);

const registry = createIdentityRegistry();
registry.register(createOwnerIdentity('Appel420'));

const da = createDevAssistRouter({
  identityRegistry: registry,
  policy: createExecutionPolicy()
});

const inference = createInferenceRouter({
  xai: createXaiAdapter({ enabled: false })
});

// ---------------------------------------------------------------------------
// NEGATIVE
// ---------------------------------------------------------------------------
check('no route object → DENY', () => {
  const r = inference.execute(null);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, INFERENCE_REASON.NO_ROUTE);
  assert.strictEqual(r.threat, true);
});

check('policy deny route → not executed', () => {
  const route = da.route(canonicalOk, {
    requester_id: 'ghost',
    action: 'read'
  });
  assert.strictEqual(route.allowed, false);
  const r = inference.execute(route);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, INFERENCE_REASON.DENIED);
});

check('resource wait → no execution, still authorized signal', () => {
  const tightDa = createDevAssistRouter({
    identityRegistry: registry,
    policy: createExecutionPolicy({ disk_ok: false })
  });
  const route = tightDa.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'read'
  });
  assert.strictEqual(route.route, ROUTE.RESOURCE_WAIT);
  const r = inference.execute(route);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, INFERENCE_REASON.RESOURCE_WAIT);
  assert.strictEqual(r.authorized, true);
});

check('external path without config → EXTERNAL_FAIL fail closed', () => {
  const route = da.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'provider_call'
  });
  assert.strictEqual(route.route, ROUTE.EXTERNAL);
  const r = inference.execute(route);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, INFERENCE_REASON.EXTERNAL_FAIL);
  assert.strictEqual(r.result.reason, PROVIDER_REASON.NOT_CONFIGURED);
  assert.strictEqual(r.local_still_available, true);
});

check('configured adapter still does not fake success', () => {
  const configured = createInferenceRouter({
    xai: createXaiAdapter({
      enabled: true,
      api_key: 'test-key',
      base_url: 'https://api.example.invalid'
    })
  });
  const route = da.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'provider_call'
  });
  const r = configured.execute(route);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.result.reason, PROVIDER_REASON.CALL_NOT_IMPLEMENTED);
});

check('local runtime rejects invalid job', () => {
  const r = executeLocal({});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, LOCAL_REASON.INVALID_INPUT);
});

// ---------------------------------------------------------------------------
// POSITIVE
// ---------------------------------------------------------------------------
check('local route executes locally without network', () => {
  const route = da.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'read'
  });
  assert.strictEqual(route.route, ROUTE.LOCAL);
  const r = inference.execute(route, { prompt: 'hello' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.reason, INFERENCE_REASON.LOCAL_OK);
  assert.strictEqual(r.provider_involved, false);
  assert.strictEqual(r.result.output.network, false);
  assert.strictEqual(r.result.output.echo, 'hello');
});

check('provider failure does not block subsequent local execution', () => {
  const extRoute = da.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'provider_call'
  });
  const ext = inference.execute(extRoute);
  assert.strictEqual(ext.ok, false);
  assert.strictEqual(ext.local_still_available, true);

  const localRoute = da.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'read'
  });
  const loc = inference.execute(localRoute);
  assert.strictEqual(loc.ok, true);
  assert.strictEqual(loc.reason, INFERENCE_REASON.LOCAL_OK);
});

try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  // ignore
}

if (failures > 0) {
  console.error('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll inference router gate tests passed.');
process.exit(0);
