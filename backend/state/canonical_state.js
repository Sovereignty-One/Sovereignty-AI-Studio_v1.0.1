'use strict';

/**
 * Canonical Persistent State — Step 1 gate
 *
 * Missing, malformed, invalid hash, or stale state => FAIL CLOSED.
 * Valid state => ALLOW.
 *
 * No network. No provider. No council. Device-local only.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const REASON = Object.freeze({
  MISSING: 'MISSING_STATE',
  MALFORMED: 'MALFORMED_STATE',
  INVALID_HASH: 'INVALID_HASH',
  STALE: 'STALE_STATE',
  VALID: 'VALID'
});

/**
 * Deterministic JSON: sorted object keys, no whitespace variance.
 * Arrays preserve order. Used for integrity hashing only.
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k]));
  return '{' + parts.join(',') + '}';
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Compute integrity hash of a state body (everything except the hash field).
 */
function computeStateHash(stateWithoutHash) {
  return sha256Hex(canonicalJson(stateWithoutHash));
}

/**
 * Validate structure of a parsed state object (before hash check).
 * Required fields: version, owner_id, created_at, updated_at, policy_version
 */
function isWellFormed(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return false;
  }
  if (typeof state.version !== 'string' || state.version.length === 0) {
    return false;
  }
  if (typeof state.owner_id !== 'string' || state.owner_id.length === 0) {
    return false;
  }
  if (typeof state.created_at !== 'number' || !Number.isFinite(state.created_at)) {
    return false;
  }
  if (typeof state.updated_at !== 'number' || !Number.isFinite(state.updated_at)) {
    return false;
  }
  if (typeof state.policy_version !== 'string' || state.policy_version.length === 0) {
    return false;
  }
  if (state.hash !== undefined && typeof state.hash !== 'string') {
    return false;
  }
  return true;
}

/**
 * Result shape for all gate outcomes.
 * @typedef {{ allowed: boolean, reason: string, state: object|null, threat: boolean }}
 */

/**
 * Load and verify canonical state from disk.
 *
 * @param {string} statePath absolute or relative path to state file
 * @param {{ maxAgeMs?: number, now?: number }} [opts]
 * @returns {{ allowed: boolean, reason: string, state: object|null, threat: boolean }}
 */
function loadCanonicalState(statePath, opts) {
  const maxAgeMs = (opts && opts.maxAgeMs != null) ? opts.maxAgeMs : DEFAULT_MAX_AGE_MS;
  const now = (opts && opts.now != null) ? opts.now : Date.now();

  if (!statePath || typeof statePath !== 'string') {
    return { allowed: false, reason: REASON.MISSING, state: null, threat: true };
  }

  let raw;
  try {
    if (!fs.existsSync(statePath)) {
      return { allowed: false, reason: REASON.MISSING, state: null, threat: true };
    }
    raw = fs.readFileSync(statePath, 'utf8');
  } catch {
    return { allowed: false, reason: REASON.MISSING, state: null, threat: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { allowed: false, reason: REASON.MALFORMED, state: null, threat: true };
  }

  if (!isWellFormed(parsed)) {
    return { allowed: false, reason: REASON.MALFORMED, state: null, threat: true };
  }

  const recordedHash = parsed.hash;
  if (typeof recordedHash !== 'string' || recordedHash.length !== 64) {
    return { allowed: false, reason: REASON.INVALID_HASH, state: null, threat: true };
  }

  const { hash: _omit, ...body } = parsed;
  const expected = computeStateHash(body);
  if (expected !== recordedHash.toLowerCase()) {
    return { allowed: false, reason: REASON.INVALID_HASH, state: null, threat: true };
  }

  if (parsed.updated_at > now + 60_000) {
    // future timestamp beyond 1 minute skew => treat as invalid/stale class
    return { allowed: false, reason: REASON.STALE, state: null, threat: true };
  }
  if (now - parsed.updated_at > maxAgeMs) {
    return { allowed: false, reason: REASON.STALE, state: null, threat: true };
  }

  return {
    allowed: true,
    reason: REASON.VALID,
    state: Object.freeze({ ...parsed }),
    threat: false
  };
}

/**
 * Build a new canonical state object with correct hash.
 * Does not write to disk — caller persists.
 */
function buildCanonicalState(fields) {
  const now = Date.now();
  const body = {
    version: fields.version || '1.0.0',
    owner_id: fields.owner_id,
    created_at: fields.created_at != null ? fields.created_at : now,
    updated_at: fields.updated_at != null ? fields.updated_at : now,
    policy_version: fields.policy_version || '1.0.0',
    authority: fields.authority || { root: 'human', orchestrator: 'DevAssist420' },
    mode_default: fields.mode_default || 'offline'
  };
  if (!body.owner_id || typeof body.owner_id !== 'string') {
    throw new Error('owner_id required');
  }
  const hash = computeStateHash(body);
  return { ...body, hash };
}

/**
 * Persist state atomically (write temp + rename).
 */
function writeCanonicalState(statePath, state) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = statePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, statePath);
  try {
    fs.chmodSync(statePath, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
}

module.exports = {
  REASON,
  DEFAULT_MAX_AGE_MS,
  canonicalJson,
  computeStateHash,
  loadCanonicalState,
  buildCanonicalState,
  writeCanonicalState,
  isWellFormed
};
