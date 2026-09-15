'use strict';

const assert = require('assert');
const {
  createParticipantIdentity,
  createOwnerIdentity,
  createIdentityRegistry
} = require('../backend/identity/identity_adapter');
const { createExecutionPolicy } = require('../backend/policy/execution_policy');
const { createDevAssistRouter, ROUTE } = require('../backend/coordination/devassist_router');
const { issueAttestation, verifyAttestationGates } = require('../backend/pqc/attestation');
const { createScarLogger } = require('../backend/audit/scar_logger');
const { buildCanonicalState } = require('../backend/state/canonical_state');
const fs = require('fs');
const os = require('os');
const path = require('path');

const now = Date.now();
const state = buildCanonicalState({
  version: '1.0.0', owner_id: 'Appel420', created_at: now, updated_at: now, policy_version: '1.0.0'
});
const canonical = { allowed: true, state, threat: false };
const registry = createIdentityRegistry();
registry.register(createOwnerIdentity('Appel420'));
registry.register(createParticipantIdentity({
  participant_id: 'part_test', name: 'Test Agent', provider: 'local', role: 'worker', permission_set: ['advise']
}));
const policy = createExecutionPolicy();
const router = createDevAssistRouter({ identityRegistry: registry, policy });

// Authority impersonation.
const ownerSpoof = router.route(canonical, { requester_id: 'unknown-owner', action: 'read' });
assert.strictEqual(ownerSpoof.route, ROUTE.DENY);

// Participant policy mutation/root escalation.
const mutation = router.route(canonical, { requester_id: 'part_test', action: 'mutate_policy' });
assert.strictEqual(mutation.route, ROUTE.DENY);
const rootGrant = router.route(canonical, { requester_id: 'part_test', action: 'grant_root' });
assert.strictEqual(rootGrant.route, ROUTE.DENY);

// Orchestrator cannot claim root.
assert.strictEqual(router.describe().is_root, false);

// Empty/fake attestation cannot verify.
const issued = issueAttestation({
  node_id: 'node-test',
  nonce: '0123456789abcdef0123456789abcdef',
  tpm_quote: Buffer.from('quote'),
  signature: Buffer.alloc(0)
});
assert.strictEqual(issued.ok, true);
assert.strictEqual(verifyAttestationGates(issued.token, { tpm_ok: true, mldsa_ok: true }).valid, false);
assert.strictEqual(issueAttestation({ node_id: 'node-test', nonce: '0123456789abcdef0123456789abcdef', tpm_quote: {} }).ok, false);

// SCAR tamper detection.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sovereignty-step16-'));
const log = path.join(dir, 'scar.log');
const scar = createScarLogger(log);
assert.strictEqual(scar.append({ participant: 'Appel420', action: 'read', policy: 'test', result: 'ALLOW' }).ok, true);
assert.strictEqual(scar.verifyChain().ok, true);
const line = fs.readFileSync(log, 'utf8');
const tampered = line.replace('"result":"ALLOW"', '"result":"DENY"');
fs.writeFileSync(log, tampered);
assert.strictEqual(scar.verifyChain().ok, false);

console.log('PASS owner impersonation denied');
console.log('PASS participant policy/root escalation denied');
console.log('PASS DevAssist420 remains non-root');
console.log('PASS fake/empty attestation cannot verify');
console.log('PASS SCAR tampering breaks chain verification');
