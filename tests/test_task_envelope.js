'use strict';

/**
 * Step 5 TaskEnvelope — negative tests first.
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
  SEALED_FIELDS,
  ENVELOPE_REASON,
  issueTaskEnvelope,
  attemptMutation,
  createEnvelopeRegistry
} = require('../backend/coordination/task_envelope');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'envelope-'));
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

const baseFields = {
  owner: 'Appel420',
  requester: 'owner',
  agent: 'copilot',
  branch: 'copilot',
  scope: ['backend/market_intelligence'],
  mode: 'offline',
  parallel_group: 'market-intelligence-api',
  write_policy: 'branch-only',
  requires_owner_approval: false
};

// ---------------------------------------------------------------------------
// NEGATIVE
// ---------------------------------------------------------------------------
check('issue without canonical state → DENY', () => {
  const r = issueTaskEnvelope({ allowed: false, state: null }, baseFields);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, ENVELOPE_REASON.NO_CANONICAL_STATE);
  assert.strictEqual(r.threat, true);
});

check('issue missing agent → INVALID_FIELDS', () => {
  const r = issueTaskEnvelope(canonicalOk, { ...baseFields, agent: '' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, ENVELOPE_REASON.INVALID_FIELDS);
});

check('issue bad mode → INVALID_FIELDS', () => {
  const r = issueTaskEnvelope(canonicalOk, { ...baseFields, mode: 'cloud' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, ENVELOPE_REASON.INVALID_FIELDS);
});

check('issue then mutate sealed field → MUTATION_REJECTED', () => {
  const issued = issueTaskEnvelope(canonicalOk, baseFields);
  assert.strictEqual(issued.ok, true);
  for (const field of SEALED_FIELDS) {
    const patch = {};
    patch[field] = 'tamper';
    const m = attemptMutation(issued.envelope, patch);
    assert.strictEqual(m.ok, false);
    assert.strictEqual(m.reason, ENVELOPE_REASON.MUTATION_REJECTED);
    assert.strictEqual(m.threat, true);
  }
});

check('overlapping write scopes → SCOPE_CONFLICT', () => {
  const reg = createEnvelopeRegistry();
  const a = issueTaskEnvelope(canonicalOk, {
    ...baseFields,
    agent: 'copilot',
    branch: 'copilot',
    scope: ['backend/market_intelligence']
  });
  assert.strictEqual(a.ok, true);
  const addA = reg.add(a.envelope);
  assert.strictEqual(addA.ok, true);

  const b = issueTaskEnvelope(canonicalOk, {
    ...baseFields,
    agent: 'claude',
    branch: 'claude',
    scope: ['backend/market_intelligence/adapters']
  });
  assert.strictEqual(b.ok, true);
  const addB = reg.add(b.envelope);
  assert.strictEqual(addB.ok, false);
  assert.strictEqual(addB.reason, ENVELOPE_REASON.SCOPE_CONFLICT);
  assert.ok(addB.conflicts.length >= 1);
});

check('direct main write_policy not allowed at issue', () => {
  const r = issueTaskEnvelope(canonicalOk, {
    ...baseFields,
    write_policy: 'main'
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, ENVELOPE_REASON.INVALID_FIELDS);
});

// ---------------------------------------------------------------------------
// POSITIVE
// ---------------------------------------------------------------------------
check('valid issue seals state_hash and policy_hash', () => {
  const r = issueTaskEnvelope(canonicalOk, baseFields);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.reason, ENVELOPE_REASON.ISSUED);
  assert.strictEqual(r.envelope.sealed, true);
  assert.strictEqual(r.envelope.owner, 'Appel420');
  assert.strictEqual(r.envelope.state_hash, canonicalOk.state.hash);
  assert.strictEqual(typeof r.envelope.policy_hash, 'string');
  assert.strictEqual(r.envelope.policy_hash.length, 64);
  assert.ok(r.envelope.task_id.startsWith('task_'));
  assert.ok(Object.isFrozen(r.envelope));
});

check('non-overlapping scopes can run in parallel', () => {
  const reg = createEnvelopeRegistry();
  const a = issueTaskEnvelope(canonicalOk, {
    ...baseFields,
    agent: 'copilot',
    branch: 'copilot',
    scope: ['backend/market_intelligence']
  });
  const b = issueTaskEnvelope(canonicalOk, {
    ...baseFields,
    agent: 'claude',
    branch: 'claude',
    scope: ['backend/pqc']
  });
  assert.strictEqual(reg.add(a.envelope).ok, true);
  assert.strictEqual(reg.add(b.envelope).ok, true);
});

check('read-only does not conflict with write scope', () => {
  const reg = createEnvelopeRegistry();
  const writer = issueTaskEnvelope(canonicalOk, {
    ...baseFields,
    scope: ['backend/market_intelligence'],
    write_policy: 'branch-only'
  });
  const reader = issueTaskEnvelope(canonicalOk, {
    ...baseFields,
    agent: 'reviewer',
    branch: 'review',
    scope: ['backend/market_intelligence'],
    write_policy: 'read-only'
  });
  assert.strictEqual(reg.add(writer.envelope).ok, true);
  assert.strictEqual(reg.add(reader.envelope).ok, true);
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
console.log('\nAll TaskEnvelope gate tests passed.');
process.exit(0);
