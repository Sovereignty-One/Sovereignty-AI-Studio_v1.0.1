'use strict';

/**
 * Step 12 SCAR Evidence — negative tests first.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const { createScarLogger, SCAR_REASON } = require('../backend/audit/scar_logger');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scar-'));
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

const logPath = path.join(tmpRoot, 'scar.log');

// ---------------------------------------------------------------------------
// NEGATIVE
// ---------------------------------------------------------------------------
check('append missing participant → INVALID', () => {
  const scar = createScarLogger(logPath);
  const r = scar.append({
    action: 'test',
    policy: 'p1',
    result: 'DENY'
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, SCAR_REASON.INVALID);
  assert.strictEqual(r.threat, true);
});

check('append missing action → INVALID', () => {
  const scar = createScarLogger(path.join(tmpRoot, 'scar2.log'));
  const r = scar.append({
    participant: 'Appel420',
    policy: 'p1',
    result: 'ALLOW'
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, SCAR_REASON.INVALID);
});

check('public API has no truncate/delete/overwrite', () => {
  const scar = createScarLogger(path.join(tmpRoot, 'scar3.log'));
  assert.strictEqual(typeof scar.append, 'function');
  assert.strictEqual(typeof scar.readAll, 'function');
  assert.strictEqual(typeof scar.verifyChain, 'function');
  assert.strictEqual(scar.truncate, undefined);
  assert.strictEqual(scar.delete, undefined);
  assert.strictEqual(scar.overwrite, undefined);
  assert.strictEqual(scar.clear, undefined);
});

check('tampered entry breaks chain verification', () => {
  const p = path.join(tmpRoot, 'scar-tamper.log');
  const scar = createScarLogger(p);
  assert.strictEqual(
    scar.append({
      participant: 'Appel420',
      action: 'route',
      policy: 'execution_policy',
      result: 'ALLOW'
    }).ok,
    true
  );
  // Tamper file
  const raw = fs.readFileSync(p, 'utf8');
  const entry = JSON.parse(raw.trim());
  entry.result = 'TAMPERED';
  fs.writeFileSync(p, JSON.stringify(entry) + '\n');
  const v = scar.verifyChain();
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.reason, SCAR_REASON.CHAIN_BROKEN);
  assert.strictEqual(v.threat, true);
});

// ---------------------------------------------------------------------------
// POSITIVE
// ---------------------------------------------------------------------------
check('append security event and verify chain', () => {
  const p = path.join(tmpRoot, 'scar-ok.log');
  const scar = createScarLogger(p);
  const a = scar.append({
    participant: 'Appel420',
    action: 'canonical_state_load',
    policy: 'R-013',
    result: 'ALLOW'
  });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.reason, SCAR_REASON.APPENDED);
  assert.strictEqual(a.hash.length, 64);

  const b = scar.append({
    participant: 'DevAssist420',
    action: 'route',
    policy: 'execution_policy',
    result: 'LOCAL',
    details: { path: 'local' }
  });
  assert.strictEqual(b.ok, true);
  assert.strictEqual(b.prev_hash, a.hash);

  const v = scar.verifyChain();
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.reason, SCAR_REASON.CHAIN_OK);
  assert.strictEqual(v.count, 2);
});

check('readAll returns append order', () => {
  const p = path.join(tmpRoot, 'scar-order.log');
  const scar = createScarLogger(p);
  scar.append({
    participant: 'A',
    action: 'a1',
    policy: 'p',
    result: 'DENY'
  });
  scar.append({
    participant: 'B',
    action: 'a2',
    policy: 'p',
    result: 'ALLOW'
  });
  const all = scar.readAll();
  assert.strictEqual(all.entries.length, 2);
  assert.strictEqual(all.entries[0].participant, 'A');
  assert.strictEqual(all.entries[1].participant, 'B');
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
console.log('\nAll SCAR evidence gate tests passed.');
process.exit(0);
