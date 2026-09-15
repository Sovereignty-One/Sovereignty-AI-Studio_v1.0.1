'use strict';

/**
 * Market Intelligence Normalizer — Step 10
 *
 * Public metadata only. Strips/rejects private fields.
 */

const PRIVATE_KEYS = Object.freeze([
  'prompt',
  'prompts',
  'memory',
  'vault',
  'credential',
  'credentials',
  'api_key',
  'token',
  'secret',
  'telemetry',
  'conversation',
  'conversations',
  'session_key',
  'private'
]);

const NORMALIZE_REASON = Object.freeze({
  INVALID: 'INVALID',
  PRIVATE_FIELD: 'PRIVATE_FIELD',
  OK: 'OK'
});

/**
 * Normalize one upstream record into canonical public model metadata.
 * @param {object} raw
 * @param {string} source
 */
function normalizeRecord(raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: NORMALIZE_REASON.INVALID, record: null };
  }

  for (const key of Object.keys(raw)) {
    const lower = key.toLowerCase();
    if (PRIVATE_KEYS.includes(lower)) {
      return {
        ok: false,
        reason: NORMALIZE_REASON.PRIVATE_FIELD,
        field: key,
        record: null,
        threat: true
      };
    }
  }

  const provider = typeof raw.provider === 'string' ? raw.provider : source || 'unknown';
  const model = typeof raw.model === 'string' ? raw.model : typeof raw.id === 'string' ? raw.id : null;
  if (!model) {
    return { ok: false, reason: NORMALIZE_REASON.INVALID, record: null };
  }

  const record = Object.freeze({
    provider,
    model,
    version: typeof raw.version === 'string' ? raw.version : null,
    released: typeof raw.released === 'string' || typeof raw.released === 'number' ? raw.released : null,
    pricing: raw.pricing && typeof raw.pricing === 'object' ? Object.freeze({ ...raw.pricing }) : null,
    context: typeof raw.context === 'number' ? raw.context : null,
    latency: typeof raw.latency === 'number' ? raw.latency : null,
    license: typeof raw.license === 'string' ? raw.license : null,
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    capabilities: Array.isArray(raw.capabilities)
      ? Object.freeze(raw.capabilities.filter((c) => typeof c === 'string'))
      : Object.freeze([]),
    last_updated: typeof raw.last_updated === 'number' ? raw.last_updated : Date.now(),
    source: typeof source === 'string' ? source : 'unknown',
    classification: 'public'
  });

  return { ok: true, reason: NORMALIZE_REASON.OK, record, threat: false };
}

function normalizeMany(rawList, source) {
  if (!Array.isArray(rawList)) {
    return { ok: false, reason: NORMALIZE_REASON.INVALID, records: [] };
  }
  const records = [];
  for (const raw of rawList) {
    const r = normalizeRecord(raw, source);
    if (!r.ok) {
      return { ok: false, reason: r.reason, field: r.field, records: [], threat: r.threat === true };
    }
    records.push(r.record);
  }
  return { ok: true, reason: NORMALIZE_REASON.OK, records, threat: false };
}

module.exports = {
  PRIVATE_KEYS,
  NORMALIZE_REASON,
  normalizeRecord,
  normalizeMany
};
