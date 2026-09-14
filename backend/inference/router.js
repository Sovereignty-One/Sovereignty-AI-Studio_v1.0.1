'use strict';

/**
 * Inference Router — Step 6
 *
 * Consumes DevAssist420 route decisions.
 * LOCAL → local runtime (never blocked by provider state).
 * EXTERNAL → provider adapter boundary.
 * DENY / RESOURCE_WAIT → no execution.
 *
 * Provider failure must not deny local platform capability.
 */

const { ROUTE } = require('../coordination/devassist_router');
const { executeLocal } = require('./local_runtime');
const { createXaiAdapter } = require('./xai_adapter');

const INFERENCE_REASON = Object.freeze({
  NO_ROUTE: 'NO_ROUTE',
  DENIED: 'DENIED',
  RESOURCE_WAIT: 'RESOURCE_WAIT',
  LOCAL_OK: 'LOCAL_OK',
  LOCAL_FAIL: 'LOCAL_FAIL',
  EXTERNAL_FAIL: 'EXTERNAL_FAIL',
  EXTERNAL_OK: 'EXTERNAL_OK',
  INVALID: 'INVALID'
});

/**
 * @param {{ xai?: object }} [deps]
 */
function createInferenceRouter(deps) {
  const xai = (deps && deps.xai) || createXaiAdapter({ enabled: false });

  /**
   * @param {object} routeResult — from DevAssist420.route()
   * @param {{ prompt?: string }} [payload]
   */
  function execute(routeResult, payload) {
    if (!routeResult || typeof routeResult.route !== 'string') {
      return {
        ok: false,
        reason: INFERENCE_REASON.NO_ROUTE,
        threat: true,
        result: null
      };
    }

    if (routeResult.route === ROUTE.DENY || routeResult.allowed === false) {
      return {
        ok: false,
        reason: INFERENCE_REASON.DENIED,
        threat: routeResult.threat === true,
        result: null,
        route: ROUTE.DENY
      };
    }

    if (routeResult.route === ROUTE.RESOURCE_WAIT) {
      return {
        ok: false,
        reason: INFERENCE_REASON.RESOURCE_WAIT,
        threat: false,
        result: null,
        route: ROUTE.RESOURCE_WAIT,
        authorized: true,
        note: 'Authorized but resources constrained; not a provider denial'
      };
    }

    const job = {
      action: routeResult.action || 'infer',
      actor: routeResult.actor || 'unknown',
      prompt: payload && payload.prompt
    };

    if (routeResult.route === ROUTE.LOCAL) {
      const local = executeLocal(job);
      return {
        ok: local.ok,
        reason: local.ok ? INFERENCE_REASON.LOCAL_OK : INFERENCE_REASON.LOCAL_FAIL,
        threat: local.threat === true,
        result: local,
        route: ROUTE.LOCAL,
        provider_involved: false
      };
    }

    if (routeResult.route === ROUTE.EXTERNAL) {
      const ext = xai.call(job);
      // External failure is external only — does not imply local platform denial
      return {
        ok: ext.ok,
        reason: ext.ok ? INFERENCE_REASON.EXTERNAL_OK : INFERENCE_REASON.EXTERNAL_FAIL,
        threat: ext.threat === true,
        result: ext,
        route: ROUTE.EXTERNAL,
        provider_involved: true,
        local_still_available: true
      };
    }

    return {
      ok: false,
      reason: INFERENCE_REASON.INVALID,
      threat: true,
      result: null
    };
  }

  return Object.freeze({ execute, INFERENCE_REASON });
}

module.exports = {
  INFERENCE_REASON,
  createInferenceRouter
};
