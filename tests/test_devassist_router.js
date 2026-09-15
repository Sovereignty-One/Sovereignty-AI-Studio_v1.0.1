'use strict';

/**
 * Step 4 DevAssist420 Router — negative tests first.
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
  createParticipantIdentity,
  generateParticipantId,
  createIdentityRegistry
} = require('../backend/identity/identity_adapter');

const { createExecutionPolicy } = require('../backend/policy/execution_policy');
const {
  ROUTE,
  ROUTER_REASON,
  createDevAssistRouter
} = require('../backend/coordination/devassist_router');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'router-'));
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
const participant = createParticipantIdentity({
  participant_id: generateParticipantId('copilot'),
  name: 'Copilot',
  provider: 'GitHub',
  role: 'coder',
  permission_set: ['advise', 'read_public']
});
registry.register(participant);

const router = createDevAssistRouter({
  identityRegistry: registry,
  policy: createExecutionPolicy(),
  orchestratorId: 'DevAssist420'
});

// ---------------------------------------------------------------------------
// NEGATIVE
// ---------------------------------------------------------------------------
check('no canonical state → DENY / threat', () => {
  const r = router.route({ allowed: false, state: null }, {
    requester_id: 'Appel420',
    action: 'read'
  });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.route, ROUTE.DENY);
  assert.strictEqual(r.reason, ROUTER_REASON.NO_CANONICAL_STATE);
  assert.strictEqual(r.threat, true);
});

check('invalid request → DENY', () => {
  const r = router.route(canonicalOk, { requester_id: 'Appel420' });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, ROUTER_REASON.INVALID_REQUEST);
  assert.strictEqual(r.threat, true);
});

check('unknown requester → DENY', () => {
  const r = router.route(canonicalOk, {
    requester_id: 'ghost',
    action: 'read'
  });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, ROUTER_REASON.NO_IDENTITY);
  assert.strictEqual(r.threat, true);
});

check('participant mutate_policy → POLICY_DENIED', () => {
  const r = router.route(canonicalOk, {
    requester_id: participant.identity_id,
    action: 'mutate_policy'
  });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.route, ROUTE.DENY);
  assert.strictEqual(r.reason, ROUTER_REASON.POLICY_DENIED);
  assert.strictEqual(r.threat, true);
});

check('participant grant_root → POLICY_DENIED', () => {
  const r = router.route(canonicalOk, {
    requester_id: participant.identity_id,
    action: 'grant_root'
  });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.route, ROUTE.DENY);
  assert.strictEqual(r.threat, true);
});

check('orchestrator describe is never root', () => {
  const d = router.describe();
  assert.strictEqual(d.is_root, false);
  assert.strictEqual(d.role, 'orchestrator');
  assert.strictEqual(d.name, 'DevAssist420');
});

check('resource constrained → RESOURCE_WAIT not unauthorized deny', () => {
  const tight = createDevAssistRouter({
    identityRegistry: registry,
    policy: createExecutionPolicy({ cpu_ok: false }),
    orchestratorId: 'DevAssist420'
  });
  const r = tight.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'read'
  });
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.route, ROUTE.RESOURCE_WAIT);
  assert.strictEqual(r.authorized, true);
  assert.strictEqual(r.resource_ok, false);
  assert.strictEqual(r.threat, false);
});

// ---------------------------------------------------------------------------
// POSITIVE
// ---------------------------------------------------------------------------
check('owner read → LOCAL', () => {
  const r = router.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'read'
  });
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.route, ROUTE.LOCAL);
  assert.strictEqual(r.reason, ROUTER_REASON.ROUTED_LOCAL);
  assert.strictEqual(r.orchestrator, 'DevAssist420');
});

check('owner prefer external → EXTERNAL', () => {
  const r = router.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'read',
    prefer: 'external'
  });
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.route, ROUTE.EXTERNAL);
  assert.strictEqual(r.reason, ROUTER_REASON.ROUTED_EXTERNAL);
});

check('owner provider_call action → EXTERNAL', () => {
  const r = router.route(canonicalOk, {
    requester_id: 'Appel420',
    action: 'provider_call'
  });
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.route, ROUTE.EXTERNAL);
});

check('participant advise → LOCAL', () => {
  const r = router.route(canonicalOk, {
    requester_id: participant.identity_id,
    action: 'advise',
    required_permission: 'advise'
  });
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.route, ROUTE.LOCAL);
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
console.log('\nAll DevAssist420 router gate tests passed.');
process.exit(0);
