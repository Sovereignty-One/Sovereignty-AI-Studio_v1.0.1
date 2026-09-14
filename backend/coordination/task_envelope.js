'use strict';

/**
 * TaskEnvelope — Step 5
 *
 * Immutable task/scope/policy binding after issuance.
 * Sealed fields cannot be mutated; attempts → REJECT.
 *
 * Overlapping write scopes cannot be held by two agents in parallel.
 */

const crypto = require('crypto');

const SEALED_FIELDS = Object.freeze([
  'task_id',
  'owner',
  'requester',
  'agent',
  'branch',
  'scope',
  'mode',
  'write_policy',
  'policy_hash',
  'state_hash'
]);

const ENVELOPE_REASON = Object.freeze({
  NO_CANONICAL_STATE: 'NO_CANONICAL_STATE',
  INVALID_FIELDS: 'INVALID_FIELDS',
  MUTATION_REJECTED: 'MUTATION_REJECTED',
  SCOPE_CONFLICT: 'SCOPE_CONFLICT',
  NOT_ISSUED: 'NOT_ISSUED',
  ISSUED: 'ISSUED',
  VALID: 'VALID'
});

const ALLOWED_MODES = Object.freeze(['offline', 'hybrid', 'online']);
const ALLOWED_WRITE_POLICIES = Object.freeze(['branch-only', 'read-only']);

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function generateTaskId() {
  return 'task_' + crypto.randomBytes(16).toString('hex');
}

function normalizeScope(scope) {
  if (!Array.isArray(scope)) return null;
  const out = scope
    .filter((s) => typeof s === 'string' && s.length > 0)
    .map((s) => s.replace(/\\/g, '/').replace(/^\/+/, ''));
  return out.length ? Object.freeze([...new Set(out)].sort()) : Object.freeze([]);
}

function scopesOverlap(a, b) {
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      if (x.startsWith(y + '/') || y.startsWith(x + '/')) return true;
    }
  }
  return false;
}

/**
 * Validate provisional (pre-issue) fields.
 */
function validateProvisional(fields) {
  if (!fields || typeof fields !== 'object') return 'fields required';
  if (typeof fields.owner !== 'string' || !fields.owner) return 'owner required';
  if (typeof fields.requester !== 'string' || !fields.requester) return 'requester required';
  if (typeof fields.agent !== 'string' || !fields.agent) return 'agent required';
  if (typeof fields.branch !== 'string' || !fields.branch) return 'branch required';
  if (!ALLOWED_MODES.includes(fields.mode)) return 'mode must be offline|hybrid|online';
  if (!ALLOWED_WRITE_POLICIES.includes(fields.write_policy)) {
    return 'write_policy must be branch-only|read-only';
  }
  const scope = normalizeScope(fields.scope);
  if (scope === null) return 'scope must be an array of paths';
  return null;
}

/**
 * Issue a sealed TaskEnvelope.
 *
 * @param {{ allowed: boolean, state: object|null }} canonicalResult
 * @param {object} fields provisional fields
 * @param {{ policy_hash?: string }} [opts]
 */
function issueTaskEnvelope(canonicalResult, fields, opts) {
  if (!canonicalResult || canonicalResult.allowed !== true || !canonicalResult.state) {
    return {
      ok: false,
      reason: ENVELOPE_REASON.NO_CANONICAL_STATE,
      envelope: null,
      threat: true
    };
  }

  const err = validateProvisional(fields);
  if (err) {
    return {
      ok: false,
      reason: ENVELOPE_REASON.INVALID_FIELDS,
      detail: err,
      envelope: null,
      threat: true
    };
  }

  const scope = normalizeScope(fields.scope);
  const stateHash =
    typeof canonicalResult.state.hash === 'string'
      ? canonicalResult.state.hash
      : sha256Hex(JSON.stringify(canonicalResult.state));
  const policyHash =
    (opts && opts.policy_hash) ||
    sha256Hex('execution_policy:v1');

  const envelope = {
    task_id: generateTaskId(),
    owner: fields.owner,
    requester: fields.requester,
    agent: fields.agent,
    branch: fields.branch,
    scope,
    mode: fields.mode,
    parallel_group: typeof fields.parallel_group === 'string' ? fields.parallel_group : '',
    conflicts_with: Object.freeze([]),
    write_policy: fields.write_policy,
    requires_owner_approval: fields.requires_owner_approval === true,
    policy_hash: policyHash,
    state_hash: stateHash,
    issued_at: Date.now(),
    sealed: true
  };

  return {
    ok: true,
    reason: ENVELOPE_REASON.ISSUED,
    envelope: deepFreeze(envelope),
    threat: false
  };
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) {
      deepFreeze(obj[k]);
    }
  }
  return obj;
}

/**
 * Attempt to mutate a sealed envelope. Always rejects sealed field changes.
 * Returns a new object only for non-sealed metadata if ever extended; sealed fields blocked.
 */
function attemptMutation(envelope, patch) {
  if (!envelope || envelope.sealed !== true) {
    return {
      ok: false,
      reason: ENVELOPE_REASON.NOT_ISSUED,
      envelope: null,
      threat: true
    };
  }
  if (!patch || typeof patch !== 'object') {
    return {
      ok: false,
      reason: ENVELOPE_REASON.INVALID_FIELDS,
      envelope: null,
      threat: true
    };
  }
  for (const key of Object.keys(patch)) {
    if (SEALED_FIELDS.includes(key)) {
      return {
        ok: false,
        reason: ENVELOPE_REASON.MUTATION_REJECTED,
        field: key,
        envelope: null,
        threat: true
      };
    }
  }
  // No non-sealed mutable fields in v1 — any other key also rejected for safety
  return {
    ok: false,
    reason: ENVELOPE_REASON.MUTATION_REJECTED,
    field: Object.keys(patch)[0] || 'unknown',
    envelope: null,
    threat: true
  };
}

/**
 * Registry of active envelopes for scope conflict detection.
 */
function createEnvelopeRegistry() {
  /** @type {Map<string, object>} */
  const active = new Map();

  function add(envelope) {
    if (!envelope || !envelope.task_id || envelope.sealed !== true) {
      return { ok: false, reason: ENVELOPE_REASON.NOT_ISSUED, threat: true };
    }
    if (envelope.write_policy === 'read-only') {
      active.set(envelope.task_id, envelope);
      return { ok: true, reason: ENVELOPE_REASON.VALID, conflicts: [] };
    }
    const conflicts = [];
    for (const other of active.values()) {
      if (other.write_policy === 'read-only') continue;
      if (other.task_id === envelope.task_id) continue;
      if (scopesOverlap(envelope.scope, other.scope)) {
        conflicts.push({
          task_id: other.task_id,
          agent: other.agent,
          scope: other.scope
        });
      }
    }
    if (conflicts.length > 0) {
      return {
        ok: false,
        reason: ENVELOPE_REASON.SCOPE_CONFLICT,
        conflicts: Object.freeze(conflicts),
        threat: false
      };
    }
    active.set(envelope.task_id, envelope);
    return { ok: true, reason: ENVELOPE_REASON.VALID, conflicts: [] };
  }

  function release(taskId) {
    return active.delete(taskId);
  }

  function list() {
    return Array.from(active.values());
  }

  return Object.freeze({ add, release, list });
}

module.exports = {
  SEALED_FIELDS,
  ENVELOPE_REASON,
  ALLOWED_MODES,
  ALLOWED_WRITE_POLICIES,
  issueTaskEnvelope,
  attemptMutation,
  createEnvelopeRegistry,
  scopesOverlap,
  normalizeScope,
  generateTaskId
};
