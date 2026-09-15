'use strict';

/**
 * Step 10 Market Intelligence — negative tests first.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const { normalizeRecord, NORMALIZE_REASON } = require('../backend/market_intelligence/normalizer');
const { createMarketEngine, ENGINE_REASON } = require('../backend/market_intelligence/engine');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'market-'));
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

const cachePath = path.join(tmpRoot, 'market-cache.json');

// ---------------------------------------------------------------------------
// NEGATIVE
// ---------------------------------------------------------------------------
check('private field prompt rejected', () => {
  const r = normalizeRecord({ provider: 'xAI', model: 'grok', prompt: 'secret' }, 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, NORMALIZE_REASON.PRIVATE_FIELD);
  assert.strictEqual(r.threat, true);
});

check('private credentials rejected', () => {
  const r = normalizeRecord({ model: 'x', credentials: { k: 1 } }, 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, NORMALIZE_REASON.PRIVATE_FIELD);
});

check('telemetry field rejected', () => {
  const r = normalizeRecord({ model: 'x', telemetry: {} }, 'test');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.threat, true);
});

check('offline mode rejects remote ingest', () => {
  const eng = createMarketEngine({ cachePath, network_mode: 'offline' });
  const r = eng.ingestPublic([{ provider: 'HF', model: 'bert' }], 'huggingface');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, ENGINE_REASON.INGEST_REJECTED);
});

check('empty cache ticker remains usable signal', () => {
  const eng = createMarketEngine({ cachePath: path.join(tmpRoot, 'empty.json'), network_mode: 'offline' });
  const t = eng.getTicker();
  assert.strictEqual(t.ok, true);
  assert.strictEqual(t.reason, ENGINE_REASON.CACHE_EMPTY);
  assert.ok(t.message.includes('UI must remain usable'));
});

// ---------------------------------------------------------------------------
// POSITIVE
// ---------------------------------------------------------------------------
check('local-import ingest in offline mode', () => {
  const eng = createMarketEngine({ cachePath, network_mode: 'offline' });
  const r = eng.ingestPublic(
    [
      {
        provider: 'xAI',
        model: 'grok-1',
        context: 128000,
        status: 'available',
        capabilities: ['chat']
      }
    ],
    'local-import'
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.reason, ENGINE_REASON.INGEST_OK);
  assert.strictEqual(r.count, 1);
});

check('ticker reads public cache only', () => {
  const eng = createMarketEngine({ cachePath, network_mode: 'offline' });
  const t = eng.getTicker();
  assert.strictEqual(t.ok, true);
  assert.strictEqual(t.count, 1);
  assert.strictEqual(t.records[0].classification, 'public');
  assert.strictEqual(t.records[0].model, 'grok-1');
  assert.strictEqual(t.network_mode, 'offline');
});

check('hybrid allows non-local ingest of public records', () => {
  const p = path.join(tmpRoot, 'hybrid.json');
  const eng = createMarketEngine({ cachePath: p, network_mode: 'hybrid' });
  const r = eng.ingestPublic(
    [{ provider: 'OpenAI', model: 'gpt-test', status: 'available' }],
    'openrouter'
  );
  assert.strictEqual(r.ok, true);
  const t = eng.getTicker();
  assert.strictEqual(t.records[0].source, 'openrouter');
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
console.log('\nAll market intelligence gate tests passed.');
process.exit(0);
