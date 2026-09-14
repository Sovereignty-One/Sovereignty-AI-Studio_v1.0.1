'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildCanonicalState,
  writeCanonicalState
} = require('../backend/state/canonical_state');
const { createSovereigntyPipeline } = require('../backend/integration/sovereignty_pipeline');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereignty-step14-'));
const statePath = path.join(root, 'state.json');
const scarPath = path.join(root, 'scar.log');

function setup() {
  const now = Date.now();
  const state = buildCanonicalState({
    version: '1.0.0',
    owner_id: 'Appel420',
    created_at: now,
    updated_at: now,
    policy_version: '1.0.0'
  });
  writeCanonicalState(statePath, state);
}

setup();

// Negative tests first.
{
  const pipeline = createSovereigntyPipeline({ statePath, scarPath, ownerId: 'Appel420' });
  fs.writeFileSync(statePath, '{bad json');
  const denied = pipeline.execute({ requester_id: 'Appel420', action: 'read' });
  assert.strictEqual(denied.ok, false);
  assert.strictEqual(denied.route, 'deny');
  assert.strictEqual(denied.threat, true);
  assert.strictEqual(pipeline.scar.verifyChain().ok, true);
}

setup();
{
  const pipeline = createSovereigntyPipeline({ statePath, scarPath, ownerId: 'Appel420' });
  const denied = pipeline.execute({ requester_id: 'unknown', action: 'read' });
  assert.strictEqual(denied.ok, false);
  assert.strictEqual(denied.route, 'deny');
  assert.strictEqual(pipeline.scar.verifyChain().ok, true);
}

setup();
{
  const pipeline = createSovereigntyPipeline({ statePath, scarPath, ownerId: 'Appel420' });
  const denied = pipeline.execute({ requester_id: 'Appel420', action: 'mutate_policy' });
  assert.strictEqual(denied.ok, true, 'owner policy mutation should reach inference path unless a downstream action denies it');
  assert.strictEqual(pipeline.scar.verifyChain().ok, true);
}

console.log('PASS integration fail-closed canonical state');
console.log('PASS integration unknown identity denied');
console.log('PASS integrated security decisions generate verifiable SCAR');
