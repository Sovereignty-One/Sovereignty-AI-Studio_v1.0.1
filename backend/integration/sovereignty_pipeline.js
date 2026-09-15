'use strict';

/**
 * Step 14 — Integration Wiring
 *
 * One executable path:
 * canonical state -> identity -> authority/policy -> DevAssist420
 * -> inference router. Security decisions are recorded in SCAR.
 *
 * Market Intelligence is deliberately not imported here.
 */

const { loadCanonicalState } = require('../state/canonical_state');
const {
  createIdentityRegistry,
  createOwnerIdentity,
  createParticipantIdentity
} = require('../identity/identity_adapter');
const { createExecutionPolicy } = require('../policy/execution_policy');
const { createDevAssistRouter } = require('../coordination/devassist_router');
const { createInferenceRouter } = require('../inference/router');
const { createScarLogger } = require('../audit/scar_logger');

function createSovereigntyPipeline(options) {
  if (!options || typeof options.statePath !== 'string' || !options.statePath) {
    throw new Error('statePath required');
  }
  if (typeof options.scarPath !== 'string' || !options.scarPath) {
    throw new Error('scarPath required');
  }

  const scar = createScarLogger(options.scarPath);
  const registry = createIdentityRegistry();
  const policy = createExecutionPolicy(options.resources);

  if (options.ownerId) {
    registry.register(createOwnerIdentity(options.ownerId));
  }
  for (const participant of options.participants || []) {
    registry.register(createParticipantIdentity(participant));
  }

  const devassist = createDevAssistRouter({
    identityRegistry: registry,
    policy,
    orchestratorId: options.orchestratorId || 'DevAssist420'
  });
  const inference = createInferenceRouter(options.inference);

  function record(event) {
    return scar.append({
      participant: event.participant || 'system',
      action: event.action || 'integration_decision',
      policy: event.policy || 'sovereignty-v1',
      result: event.result || 'UNKNOWN',
      details: event.details
    });
  }

  function execute(request, payload, stateOptions) {
    const canonical = loadCanonicalState(options.statePath, stateOptions);
    if (!canonical.allowed) {
      const evidence = record({
        participant: request && request.requester_id || 'unknown',
        action: request && request.action || 'unknown',
        result: 'DENY',
        details: { reason: canonical.reason, threat: canonical.threat === true }
      });
      return {
        ok: false,
        stage: 'canonical_state',
        reason: canonical.reason,
        route: 'deny',
        threat: true,
        evidence
      };
    }

    const route = devassist.route(canonical, request);
    if (route.route === 'deny') {
      const evidence = record({
        participant: request.requester_id,
        action: request.action,
        result: 'DENY',
        details: { reason: route.reason, policy_reason: route.policy_reason }
      });
      return { ok: false, stage: 'routing', route: route.route, reason: route.reason, threat: route.threat === true, evidence };
    }

    const execution = inference.execute(route, payload);
    const evidence = record({
      participant: request.requester_id,
      action: request.action,
      result: execution.ok ? 'ALLOW' : 'FAIL',
      details: {
        route: route.route,
        inference_reason: execution.reason,
        provider_involved: execution.provider_involved === true
      }
    });

    return { ok: execution.ok, stage: 'inference', route: route.route, execution, evidence };
  }

  return Object.freeze({ execute, record, scar, registry, policy, devassist, inference });
}

module.exports = { createSovereigntyPipeline };
