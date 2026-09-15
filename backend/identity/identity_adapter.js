'use strict';

/**
 * Identity Adapter — Step 2
 *
 * Owner and AI participant identities are device-local, immutable IDs.
 * Identity does NOT depend on provider APIs.
 * Resolution requires a prior ALLOW from Canonical State (Step 1).
 */

const crypto = require('crypto');

const IDENTITY_KIND = Object.freeze({
  OWNER: 'owner',
  PARTICIPANT: 'participant'
});

const IDENTITY_REASON = Object.freeze({
  NO_CANONICAL_STATE: 'NO_CANONICAL_STATE',
  MISSING_IDENTITY: 'MISSING_IDENTITY',
  MALFORMED_IDENTITY: 'MALFORMED_IDENTITY',
  UNKNOWN_IDENTITY: 'UNKNOWN_IDENTITY',
  VALID: 'VALID'
});

/**
 * Create an immutable owner identity record.
 * owner_id must match canonical state.owner_id.
 */
function createOwnerIdentity(ownerId, meta) {
  if (typeof ownerId !== 'string' || ownerId.length === 0) {
    throw new Error('owner_id required');
  }
  const id = {
    kind: IDENTITY_KIND.OWNER,
    identity_id: ownerId,
    display_name: (meta && meta.display_name) || ownerId,
    created_at: (meta && meta.created_at) || Date.now(),
    immutable: true
  };
  return Object.freeze(id);
}

/**
 * Create an immutable AI participant identity.
 * Participants are never Root Authority.
 */
function createParticipantIdentity(fields) {
  if (!fields || typeof fields.participant_id !== 'string' || fields.participant_id.length === 0) {
    throw new Error('participant_id required');
  }
  if (typeof fields.name !== 'string' || fields.name.length === 0) {
    throw new Error('name required');
  }
  if (typeof fields.provider !== 'string' || fields.provider.length === 0) {
    throw new Error('provider required');
  }
  if (typeof fields.role !== 'string' || fields.role.length === 0) {
    throw new Error('role required');
  }
  const id = {
    kind: IDENTITY_KIND.PARTICIPANT,
    identity_id: fields.participant_id,
    name: fields.name,
    provider: fields.provider,
    version: fields.version || 'unknown',
    role: fields.role,
    permission_set: Object.freeze([...(fields.permission_set || [])]),
    audit_identity: fields.audit_identity || fields.participant_id,
    created_at: fields.created_at || Date.now(),
    immutable: true,
    is_human: false,
    is_root: false
  };
  return Object.freeze(id);
}

/**
 * Stable local participant id (not provider-dependent).
 */
function generateParticipantId(seed) {
  const h = crypto.createHash('sha256');
  h.update(String(seed || crypto.randomBytes(16).toString('hex')));
  h.update('|sovereignty-participant-v1');
  return 'part_' + h.digest('hex').slice(0, 32);
}

/**
 * In-memory registry for this process. Device-local; not a cloud directory.
 */
function createIdentityRegistry() {
  /** @type {Map<string, object>} */
  const byId = new Map();

  function register(identity) {
    if (!identity || !identity.identity_id) {
      throw new Error('identity required');
    }
    if (byId.has(identity.identity_id)) {
      throw new Error('identity already registered: ' + identity.identity_id);
    }
    byId.set(identity.identity_id, identity);
    return identity;
  }

  function get(identityId) {
    return byId.get(identityId) || null;
  }

  function list() {
    return Array.from(byId.values());
  }

  /**
   * Resolve identity only if canonical state already ALLOWED.
   * @param {{ allowed: boolean, state: object|null }} canonicalResult
   * @param {string} identityId
   */
  function resolve(canonicalResult, identityId) {
    if (!canonicalResult || canonicalResult.allowed !== true || !canonicalResult.state) {
      return {
        allowed: false,
        reason: IDENTITY_REASON.NO_CANONICAL_STATE,
        identity: null,
        threat: true
      };
    }
    if (typeof identityId !== 'string' || identityId.length === 0) {
      return {
        allowed: false,
        reason: IDENTITY_REASON.MISSING_IDENTITY,
        identity: null,
        threat: true
      };
    }
    const found = byId.get(identityId);
    if (!found) {
      return {
        allowed: false,
        reason: IDENTITY_REASON.UNKNOWN_IDENTITY,
        identity: null,
        threat: true
      };
    }
    // Owner identity must match canonical state owner_id
    if (found.kind === IDENTITY_KIND.OWNER) {
      if (found.identity_id !== canonicalResult.state.owner_id) {
        return {
          allowed: false,
          reason: IDENTITY_REASON.MALFORMED_IDENTITY,
          identity: null,
          threat: true
        };
      }
    }
    return {
      allowed: true,
      reason: IDENTITY_REASON.VALID,
      identity: found,
      threat: false
    };
  }

  return Object.freeze({ register, get, list, resolve });
}

module.exports = {
  IDENTITY_KIND,
  IDENTITY_REASON,
  createOwnerIdentity,
  createParticipantIdentity,
  generateParticipantId,
  createIdentityRegistry
};
