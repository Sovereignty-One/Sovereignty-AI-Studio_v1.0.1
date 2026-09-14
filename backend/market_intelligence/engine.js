'use strict';

/**
 * Market Intelligence Engine — Step 10
 *
 * Public feeds → normalize → local cache → ticker.
 * Independent of inference authorization path.
 * Offline: serve cache only. Never uploads user data.
 */

const { normalizeMany, NORMALIZE_REASON } = require('./normalizer');
const { createMarketCache } = require('./cache');

const ENGINE_REASON = Object.freeze({
  OFFLINE_CACHE: 'OFFLINE_CACHE',
  CACHE_EMPTY: 'CACHE_EMPTY',
  INGEST_OK: 'INGEST_OK',
  INGEST_REJECTED: 'INGEST_REJECTED',
  INVALID: 'INVALID'
});

/**
 * @param {{ cachePath: string, network_mode?: 'offline'|'hybrid'|'online' }} opts
 */
function createMarketEngine(opts) {
  if (!opts || typeof opts.cachePath !== 'string') {
    throw new Error('cachePath required');
  }
  const cache = createMarketCache(opts.cachePath);
  let networkMode = opts.network_mode || 'offline';

  function setNetworkMode(mode) {
    if (mode === 'offline' || mode === 'hybrid' || mode === 'online') {
      networkMode = mode;
    }
  }

  /**
   * Ingest public records from an adapter payload (already fetched or fixture).
   * Does not perform network I/O itself — adapters supply public arrays.
   */
  function ingestPublic(rawList, source) {
    if (networkMode === 'offline') {
      // Offline mode: refuse new network-origin ingest; cache remains source of truth
      // Allow explicit local import only when source is 'local-import'
      if (source !== 'local-import') {
        return {
          ok: false,
          reason: ENGINE_REASON.INGEST_REJECTED,
          detail: 'offline mode rejects non-local ingest',
          threat: false
        };
      }
    }
    const normalized = normalizeMany(rawList, source || 'unknown');
    if (!normalized.ok) {
      return {
        ok: false,
        reason: ENGINE_REASON.INGEST_REJECTED,
        normalize_reason: normalized.reason,
        field: normalized.field,
        threat: normalized.threat === true
      };
    }
    const written = cache.write(normalized.records);
    if (!written.ok) {
      return { ok: false, reason: ENGINE_REASON.INGEST_REJECTED, threat: written.threat === true };
    }
    return {
      ok: true,
      reason: ENGINE_REASON.INGEST_OK,
      count: written.count,
      last_sync: written.last_sync
    };
  }

  /**
   * Ticker / dashboard read path — always local cache.
   */
  function getTicker() {
    const snap = cache.read();
    if (!snap.ok) {
      return {
        ok: false,
        reason: ENGINE_REASON.INVALID,
        records: [],
        last_sync: null,
        network_mode: networkMode
      };
    }
    if (!snap.records.length) {
      return {
        ok: true,
        reason: ENGINE_REASON.CACHE_EMPTY,
        records: [],
        last_sync: snap.last_sync,
        network_mode: networkMode,
        message: 'No feed connected. Cache empty. UI must remain usable.'
      };
    }
    return {
      ok: true,
      reason: ENGINE_REASON.OFFLINE_CACHE,
      records: snap.records,
      last_sync: snap.last_sync,
      network_mode: networkMode,
      count: snap.records.length
    };
  }

  return Object.freeze({
    ingestPublic,
    getTicker,
    setNetworkMode,
    ENGINE_REASON,
    NORMALIZE_REASON
  });
}

module.exports = {
  ENGINE_REASON,
  createMarketEngine
};
