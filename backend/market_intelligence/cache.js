'use strict';

/**
 * Market Intelligence local cache — Step 10
 *
 * Device-local only. Survives offline.
 */

const fs = require('fs');
const path = require('path');

const CACHE_REASON = Object.freeze({
  EMPTY: 'EMPTY',
  LOADED: 'LOADED',
  WRITTEN: 'WRITTEN',
  INVALID: 'INVALID'
});

function createMarketCache(cachePath) {
  if (typeof cachePath !== 'string' || !cachePath) {
    throw new Error('cachePath required');
  }

  function read() {
    try {
      if (!fs.existsSync(cachePath)) {
        return { ok: true, reason: CACHE_REASON.EMPTY, records: [], last_sync: null };
      }
      const raw = fs.readFileSync(cachePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.records)) {
        return { ok: false, reason: CACHE_REASON.INVALID, records: [], last_sync: null };
      }
      // Ensure no private classification slipped in
      for (const rec of parsed.records) {
        if (rec && rec.classification && rec.classification !== 'public') {
          return { ok: false, reason: CACHE_REASON.INVALID, records: [], last_sync: null, threat: true };
        }
      }
      return {
        ok: true,
        reason: CACHE_REASON.LOADED,
        records: parsed.records,
        last_sync: parsed.last_sync || null
      };
    } catch {
      return { ok: false, reason: CACHE_REASON.INVALID, records: [], last_sync: null };
    }
  }

  function write(records) {
    if (!Array.isArray(records)) {
      return { ok: false, reason: CACHE_REASON.INVALID };
    }
    for (const rec of records) {
      if (!rec || rec.classification !== 'public') {
        return { ok: false, reason: CACHE_REASON.INVALID, threat: true };
      }
    }
    const dir = path.dirname(cachePath);
    fs.mkdirSync(dir, { recursive: true });
    const payload = {
      last_sync: Date.now(),
      records
    };
    const tmp = cachePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, cachePath);
    return { ok: true, reason: CACHE_REASON.WRITTEN, last_sync: payload.last_sync, count: records.length };
  }

  return Object.freeze({ read, write, CACHE_REASON });
}

module.exports = {
  CACHE_REASON,
  createMarketCache
};
