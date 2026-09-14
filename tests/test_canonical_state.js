'use strict';

/**
 * Step 1 Canonical State — negative tests first, then positive.
 *
 * missing / malformed / invalid hash / stale → DENY / FAIL CLOSED
 * valid → ALLOW
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const {
  REASON,
  loadCanonicalState,
  buildCanonicalState,
  writeCanonicalState,
  computeStateHash
} = require('../backend/state/canonical_state');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-state-'));
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

function statePath(name) {
  return path.join(tmpRoot, name);
}

// ---------------------------------------------------------------------------
// NEGATIVE: missing state → DENY / FAIL CLOSED
// ---------------------------------------------------------------------------
check('missing state → DENY / FAIL CLOSED', () => {
  const r = loadCanonicalState(statePath('does-not-exist.json'));
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, REASON.MISSING);
  assert.strictEqual(r.threat, true);
  assert.strictEqual(r.state, null);
});

check('empty path → DENY / FAIL CLOSED', () => {
  const r = loadCanonicalState('');
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, REASON.MISSING);
  assert.strictEqual(r.threat, true);
});

// ---------------------------------------------------------------------------
// NEGATIVE: malformed state → DENY / FAIL CLOSED
// ---------------------------------------------------------------------------
check('malformed JSON → DENY / FAIL CLOSED', () => {
  const p = statePath('malformed.json');
  fs.writeFileSync(p, '{not json');
  const r = loadCanonicalState(p);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, REASON.MALFORMED);
  assert.strictEqual(r.threat, true);
  assert.strictEqual(r.state, null);
});

check('malformed missing required fields → DENY / FAIL CLOSED', () => {
  const p = statePath('incomplete.json');
  fs.writeFileSync(p, JSON.stringify({ version: '1.0.0' }));
  const r = loadCanonicalState(p);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, REASON.MALFORMED);
  assert.strictEqual(r.threat, true);
});

// ---------------------------------------------------------------------------
// NEGATIVE: invalid hash → DENY / FAIL CLOSED
// ---------------------------------------------------------------------------
check('invalid hash → DENY / FAIL CLOSED', () => {
  const body = buildCanonicalState({ owner_id: 'Appel420' });
  body.hash = '0'.repeat(64); // wrong hash
  const p = statePath('bad-hash.json');
  fs.writeFileSync(p, JSON.stringify(body));
  const r = loadCanonicalState(p);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, REASON.INVALID_HASH);
  assert.strictEqual(r.threat, true);
  assert.strictEqual(r.state, null);
});

check('tampered field breaks hash → DENY / FAIL CLOSED', () => {
  const body = buildCanonicalState({ owner_id: 'Appel420' });
  const p = statePath('tampered.json');
  writeCanonicalState(p, body);
  const onDisk = JSON.parse(fs.readFileSync(p, 'utf8'));
  onDisk.owner_id = 'attacker';
  // leave old hash — integrity must fail
  fs.writeFileSync(p, JSON.stringify(onDisk));
  const r = loadCanonicalState(p);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, REASON.INVALID_HASH);
  assert.strictEqual(r.threat, true);
});

check('missing hash field → DENY / FAIL CLOSED', () => {
  const body = buildCanonicalState({ owner_id: 'Appel420' });
  delete body.hash;
  const p = statePath('no-hash.json');
  fs.writeFileSync(p, JSON.stringify(body));
  const r = loadCanonicalState(p);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, REASON.INVALID_HASH);
  assert.strictEqual(r.threat, true);
});

// ---------------------------------------------------------------------------
// NEGATIVE: stale state → DENY / FAIL CLOSED
// ---------------------------------------------------------------------------
check('stale state → DENY / FAIL CLOSED', () => {
  const old = Date.now() - (40 * 24 * 60 * 60 * 1000); // 40 days ago
  const body = buildCanonicalState({
    owner_id: 'Appel420',
    created_at: old,
    updated_at: old
  });
  const p = statePath('stale.json');
  writeCanonicalState(p, body);
  const r = loadCanonicalState(p, { maxAgeMs: 30 * 24 * 60 * 60 * 1000 });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, REASON.STALE);
  assert.strictEqual(r.threat, true);
  assert.strictEqual(r.state, null);
});

// ---------------------------------------------------------------------------
// POSITIVE: valid state → ALLOW
// ---------------------------------------------------------------------------
check('valid state → ALLOW', () => {
  const body = buildCanonicalState({ owner_id: 'Appel420' });
  const p = statePath('valid.json');
  writeCanonicalState(p, body);
  const r = loadCanonicalState(p);
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.reason, REASON.VALID);
  assert.strictEqual(r.threat, false);
  assert.ok(r.state);
  assert.strictEqual(r.state.owner_id, 'Appel420');
  assert.strictEqual(r.state.hash, body.hash);
  assert.strictEqual(r.state.hash.length, 64);
});

check('hash matches computeStateHash', () => {
  const body = buildCanonicalState({ owner_id: 'Appel420', policy_version: '1.0.0' });
  const { hash, ...rest } = body;
  assert.strictEqual(computeStateHash(rest), hash);
});

// ---------------------------------------------------------------------------
// cleanup + exit
// ---------------------------------------------------------------------------
try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  // ignore
}

if (failures > 0) {
  console.error('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nAll canonical state gate tests passed.');
process.exit(0);
