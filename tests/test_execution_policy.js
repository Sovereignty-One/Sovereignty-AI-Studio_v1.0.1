'use strict';

/**
 * Step 3 Sovereignty Policy — negative tests first.
 * AUTHORIZED ≠ UNLIMITED
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

const {
  POLICY_REASON,
  createExecutionPolicy
} = require('../backend/policy/execution_policy');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-'));
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
assert.strictEqual(canonicalOk.allowed, true);

const registry = createIdentityRegistry();
registry.register(createOwnerIdentity('Appel420'));
const participant = createParticipantIdentity({
  participant_id: generateParticipantId('claude'),
  name: 'Claude',
  provider: 'Anthropic',
  role: 'advisor',
  permission_set: ['advise', 'read_public']
});
registry.register(participant);

const ownerRes = registry.resolve(canonicalOk, 'Appel420');
const partRes = registry.resolve(canonicalOk, participant.identity_id);

// ---------------------------------------------------------------------------
// NEGATIVE
// ---------------------------------------------------------------------------
check('no canonical state → not authorized / threat', () => {
  const policy = createExecutionPolicy();
  const r = policy.evaluate({ allowed: false, state: null }, ownerRes, 'read');
  assert.strictEqual(r.authorized, false);
  assert.strictEqual(r.reason, POLICY_REASON.NO_CANONICAL_STATE);
  assert.strictEqual(r.threat, true);
});

check('no identity → not authorized / threat', () => {
  const policy = createExecutionPolicy();
  const r = policy.evaluate(canonicalOk, { allowed: false, identity: null }, 'read');
  assert.strictEqual(r.authorized, false);
  assert.strictEqual(r.reason, POLICY_REASON.NO_IDENTITY);
  assert.strictEqual(r.threat, true);
});

check('participant mutate_policy → POLICY_MUTATION_DENIED', () => {
  const policy = createExecutionPolicy();
  const r = policy.evaluate(canonicalOk, partRes, 'mutate_policy');
  assert.strictEqual(r.authorized, false);
  assert.strictEqual(r.reason, POLICY_REASON.POLICY_MUTATION_DENIED);
  assert.strictEqual(r.threat, true);
});

check('participant grant_root → denied', () => {
  const policy = createExecutionPolicy();
  const r = policy.evaluate(canonicalOk, partRes, 'grant_root');
  assert.strictEqual(r.authorized, false);
  assert.ok(
    r.reason === POLICY_REASON.POLICY_MUTATION_DENIED ||
      r.reason === POLICY_REASON.AUTHORITY_DENIED
  );
  assert.strictEqual(r.threat, true);
});

check('participant write_vault without permission → ACTION_DENIED', () => {
  const policy = createExecutionPolicy();
  const r = policy.evaluate(canonicalOk, partRes, 'write_vault');
  assert.strictEqual(r.authorized, false);
  assert.strictEqual(r.reason, POLICY_REASON.ACTION_DENIED);
  assert.strictEqual(r.threat, false);
});

check('resource exhaustion does NOT clear authorization', () => {
  const policy = createExecutionPolicy({ cpu_ok: false, memory_ok: true, disk_ok: true });
  const r = policy.evaluate(canonicalOk, ownerRes, 'read');
  assert.strictEqual(r.authorized, true);
  assert.strictEqual(r.reason, POLICY_REASON.RESOURCE_CONSTRAINED);
  assert.strictEqual(r.resource_ok, false);
  assert.strictEqual(r.threat, false);
});

check('participant advice with permission still resource-constrained not unauthorized', () => {
  const policy = createExecutionPolicy({ memory_ok: false });
  const r = policy.evaluate(canonicalOk, partRes, 'advise', {
    required_permission: 'advise'
  });
  assert.strictEqual(r.authorized, true);
  assert.strictEqual(r.reason, POLICY_REASON.RESOURCE_CONSTRAINED);
  assert.strictEqual(r.resource_ok, false);
});

// ---------------------------------------------------------------------------
// POSITIVE
// ---------------------------------------------------------------------------
check('owner mutate_policy → AUTHORIZED', () => {
  const policy = createExecutionPolicy();
  const r = policy.evaluate(canonicalOk, ownerRes, 'mutate_policy');
  assert.strictEqual(r.authorized, true);
  assert.strictEqual(r.reason, POLICY_REASON.AUTHORIZED);
  assert.strictEqual(r.resource_ok, true);
});

check('owner read with resources → AUTHORIZED', () => {
  const policy = createExecutionPolicy();
  const r = policy.evaluate(canonicalOk, ownerRes, 'read');
  assert.strictEqual(r.authorized, true);
  assert.strictEqual(r.reason, POLICY_REASON.AUTHORIZED);
});

check('participant advise with permission → AUTHORIZED', () => {
  const policy = createExecutionPolicy();
  const r = policy.evaluate(canonicalOk, partRes, 'advise', {
    required_permission: 'advise'
  });
  assert.strictEqual(r.authorized, true);
  assert.strictEqual(r.reason, POLICY_REASON.AUTHORIZED);
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
console.log('\nAll execution policy gate tests passed.');
process.exit(0);
