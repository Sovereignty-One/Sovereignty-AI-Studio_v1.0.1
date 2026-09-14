'use strict';

/**
 * DevAssist420 Router — Step 4
 *
 * Single orchestration path.
 * Orchestrator only — NEVER Root Authority.
 *
 * Flow:
 *   Owner/Participant request
 *     → require canonical state (Step 1)
 *     → resolve identity (Step 2)
 *     → evaluate policy (Step 3)
 *     → route decision: local | external | deny | resource_wait
 *
 * Does not execute inference (Step 6).
 * Does not apply provider quotas (Step 7).
 * Does not issue TaskEnvelope immutability seals (Step 5) — accepts provisional requests.
 */

const { IDENTITY_KIND } = require('../identity/identity_adapter');
const { createExecutionPolicy, POLICY_REASON } = require('../policy/execution_policy');

const ROUTE = Object.freeze({
  LOCAL: 'local',
  EXTERNAL: 'external',
  DENY: 'deny',
  RESOURCE_WAIT: 'resource_wait'
});

const ROUTER_REASON = Object.freeze({
  NO_CANONICAL_STATE: 'NO_CANONICAL_STATE',
  NO_IDENTITY: 'NO_IDENTITY',
  POLICY_DENIED: 'POLICY_DENIED',
  ORCHESTRATOR_NOT_ROOT: 'ORCHESTRATOR_NOT_ROOT',
  INVALID_REQUEST: 'INVALID_REQUEST',
  ROUTED_LOCAL: 'ROUTED_LOCAL',
  ROUTED_EXTERNAL: 'ROUTED_EXTERNAL',
  ROUTED_RESOURCE_WAIT: 'ROUTED_RESOURCE_WAIT'
});

/** Actions that imply external provider path */
const EXTERNAL_ACTIONS = Object.freeze([
  'provider_call',
  'network_hybrid',
  'network_online'
]);

/**
 * @param {object} deps
 * @param {object} deps.identityRegistry — from createIdentityRegistry()
 * @param {object} [deps.policy] — createExecutionPolicy() instance
 * @param {string} [deps.orchestratorId] — DevAssist420 identity id (participant, never root)
 */
function createDevAssistRouter(deps) {
  if (!deps || !deps.identityRegistry) {
    throw new Error('identityRegistry required');
  }
  const registry = deps.identityRegistry;
  const policy = deps.policy || createExecutionPolicy();
  const orchestratorId = deps.orchestratorId || 'DevAssist420';

  /**
   * Orchestrate one request.
   *
   * @param {{ allowed: boolean, state: object|null }} canonicalResult
   * @param {{ requester_id: string, action: string, prefer?: 'local'|'external', required_permission?: string }} request
   */
  function route(canonicalResult, request) {
    // Hard rule: this component is not Root Authority
    const orchestratorClaim = {
      kind: IDENTITY_KIND.PARTICIPANT,
      identity_id: orchestratorId,
      is_root: false,
      role: 'orchestrator'
    };
    if (orchestratorClaim.is_root === true) {
      return {
        allowed: false,
        route: ROUTE.DENY,
        reason: ROUTER_REASON.ORCHESTRATOR_NOT_ROOT,
        threat: true
      };
    }

    if (!canonicalResult || canonicalResult.allowed !== true || !canonicalResult.state) {
      return {
        allowed: false,
        route: ROUTE.DENY,
        reason: ROUTER_REASON.NO_CANONICAL_STATE,
        threat: true
      };
    }

    if (!request || typeof request.requester_id !== 'string' || typeof request.action !== 'string') {
      return {
        allowed: false,
        route: ROUTE.DENY,
        reason: ROUTER_REASON.INVALID_REQUEST,
        threat: true
      };
    }

    const identityResult = registry.resolve(canonicalResult, request.requester_id);
    if (!identityResult.allowed) {
      return {
        allowed: false,
        route: ROUTE.DENY,
        reason: ROUTER_REASON.NO_IDENTITY,
        threat: identityResult.threat === true,
        identity_reason: identityResult.reason
      };
    }

    const policyResult = policy.evaluate(canonicalResult, identityResult, request.action, {
      required_permission: request.required_permission
    });

    if (!policyResult.authorized) {
      return {
        allowed: false,
        route: ROUTE.DENY,
        reason: ROUTER_REASON.POLICY_DENIED,
        threat: policyResult.threat === true,
        policy_reason: policyResult.reason,
        actor: request.requester_id
      };
    }

    // Authorized but resources insufficient → wait, still not deny-as-unauthorized
    if (policyResult.reason === POLICY_REASON.RESOURCE_CONSTRAINED || policyResult.resource_ok === false) {
      return {
        allowed: true,
        route: ROUTE.RESOURCE_WAIT,
        reason: ROUTER_REASON.ROUTED_RESOURCE_WAIT,
        threat: false,
        actor: request.requester_id,
        action: request.action,
        orchestrator: orchestratorId,
        authorized: true,
        resource_ok: false
      };
    }

    const wantsExternal =
      request.prefer === 'external' || EXTERNAL_ACTIONS.includes(request.action);

    if (wantsExternal) {
      return {
        allowed: true,
        route: ROUTE.EXTERNAL,
        reason: ROUTER_REASON.ROUTED_EXTERNAL,
        threat: false,
        actor: request.requester_id,
        action: request.action,
        orchestrator: orchestratorId,
        authorized: true,
        resource_ok: true,
        note: 'External path selected; provider boundary applies in Step 6–7'
      };
    }

    return {
      allowed: true,
      route: ROUTE.LOCAL,
      reason: ROUTER_REASON.ROUTED_LOCAL,
      threat: false,
      actor: request.requester_id,
      action: request.action,
      orchestrator: orchestratorId,
      authorized: true,
      resource_ok: true
    };
  }

  function describe() {
    return Object.freeze({
      name: 'DevAssist420',
      role: 'orchestrator',
      is_root: false,
      orchestrator_id: orchestratorId
    });
  }

  return Object.freeze({ route, describe, ROUTE, ROUTER_REASON });
}

module.exports = {
  ROUTE,
  ROUTER_REASON,
  EXTERNAL_ACTIONS,
  createDevAssistRouter
};
