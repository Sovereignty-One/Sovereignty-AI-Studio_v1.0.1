'use strict';

/**
 * Sovereignty Execution Policy — Step 3
 *
 * AUTHORIZED ≠ UNLIMITED
 *
 * - Policy decides whether an action is authorized.
 * - Local resource governor decides whether resources may be consumed.
 * - Resource exhaustion must not rewrite authorization to "unauthorized".
 * - Provider quotas never appear here (external boundary only — Step 7).
 *
 * Requires: valid canonical state + resolved identity + authority check path.
 */

const { IDENTITY_KIND } = require('../identity/identity_adapter');
const { checkAuthority, AUTHORITY_REASON } = require('../authority/authority_gate');

const POLICY_REASON = Object.freeze({
  NO_CANONICAL_STATE: 'NO_CANONICAL_STATE',
  NO_IDENTITY: 'NO_IDENTITY',
  AUTHORITY_DENIED: 'AUTHORITY_DENIED',
  ACTION_DENIED: 'ACTION_DENIED',
  POLICY_MUTATION_DENIED: 'POLICY_MUTATION_DENIED',
  RESOURCE_CONSTRAINED: 'RESOURCE_CONSTRAINED',
  AUTHORIZED: 'AUTHORIZED'
});

/** Default deny action set for participants unless listed in permission_set */
const SENSITIVE_ACTIONS = Object.freeze([
  'write_vault',
  'export_private',
  'mutate_policy',
  'network_online',
  'network_hybrid',
  'provider_call'
]);

/**
 * Create a policy engine bound to an optional local resource snapshot.
 * resourceSnapshot: { cpu_ok?: boolean, memory_ok?: boolean, disk_ok?: boolean }
 */
function createExecutionPolicy(resourceSnapshot) {
  const resources = {
    cpu_ok: resourceSnapshot && resourceSnapshot.cpu_ok === false ? false : true,
    memory_ok: resourceSnapshot && resourceSnapshot.memory_ok === false ? false : true,
    disk_ok: resourceSnapshot && resourceSnapshot.disk_ok === false ? false : true
  };

  function resourcesAvailable() {
    return resources.cpu_ok && resources.memory_ok && resources.disk_ok;
  }

  /**
   * Evaluate authorization for (identity, action).
   * Does not call external providers. Does not mutate state.
   *
   * @param {{ allowed: boolean, state: object|null }} canonicalResult
   * @param {{ allowed: boolean, identity: object|null }} identityResult
   * @param {string} action
   * @param {{ required_permission?: string }} [opts]
   */
  function evaluate(canonicalResult, identityResult, action, opts) {
    if (!canonicalResult || canonicalResult.allowed !== true || !canonicalResult.state) {
      return {
        authorized: false,
        reason: POLICY_REASON.NO_CANONICAL_STATE,
        threat: true,
        resource_ok: resourcesAvailable()
      };
    }
    if (!identityResult || identityResult.allowed !== true || !identityResult.identity) {
      return {
        authorized: false,
        reason: POLICY_REASON.NO_IDENTITY,
        threat: true,
        resource_ok: resourcesAvailable()
      };
    }

    const auth = checkAuthority(canonicalResult, identityResult, action, opts);
    if (!auth.allowed) {
      return {
        authorized: false,
        reason:
          auth.reason === AUTHORITY_REASON.ESCALATION_DENIED ||
          auth.reason === AUTHORITY_REASON.AI_ROOT_FORBIDDEN
            ? POLICY_REASON.POLICY_MUTATION_DENIED
            : auth.reason === AUTHORITY_REASON.PERMISSION_DENIED
              ? POLICY_REASON.ACTION_DENIED
              : POLICY_REASON.AUTHORITY_DENIED,
        threat: auth.threat === true,
        authority_reason: auth.reason,
        resource_ok: resourcesAvailable()
      };
    }

    const identity = identityResult.identity;

    // Explicit: only owner may mutate policy
    if (action === 'mutate_policy') {
      if (identity.kind !== IDENTITY_KIND.OWNER) {
        return {
          authorized: false,
          reason: POLICY_REASON.POLICY_MUTATION_DENIED,
          threat: true,
          resource_ok: resourcesAvailable()
        };
      }
    }

    // Participant sensitive actions need matching permission
    if (identity.kind === IDENTITY_KIND.PARTICIPANT && SENSITIVE_ACTIONS.includes(action)) {
      const perms = identity.permission_set || [];
      if (!perms.includes(action) && !perms.includes('*')) {
        return {
          authorized: false,
          reason: POLICY_REASON.ACTION_DENIED,
          threat: false,
          resource_ok: resourcesAvailable()
        };
      }
    }

    // AUTHORIZED path — resource constraint is separate signal
    if (!resourcesAvailable()) {
      return {
        authorized: true,
        reason: POLICY_REASON.RESOURCE_CONSTRAINED,
        threat: false,
        resource_ok: false,
        actor: identity.identity_id,
        kind: identity.kind,
        note: 'AUTHORIZED but local resources insufficient; do not treat as unauthorized'
      };
    }

    return {
      authorized: true,
      reason: POLICY_REASON.AUTHORIZED,
      threat: false,
      resource_ok: true,
      actor: identity.identity_id,
      kind: identity.kind
    };
  }

  function setResourceSnapshot(next) {
    if (next && typeof next === 'object') {
      if (typeof next.cpu_ok === 'boolean') resources.cpu_ok = next.cpu_ok;
      if (typeof next.memory_ok === 'boolean') resources.memory_ok = next.memory_ok;
      if (typeof next.disk_ok === 'boolean') resources.disk_ok = next.disk_ok;
    }
  }

  return Object.freeze({
    evaluate,
    setResourceSnapshot,
    resourcesAvailable: () => resourcesAvailable()
  });
}

module.exports = {
  POLICY_REASON,
  SENSITIVE_ACTIONS,
  createExecutionPolicy
};
