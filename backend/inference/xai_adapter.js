'use strict';

/**
 * xAI / external provider adapter — Step 6 boundary
 *
 * External path only. Fail closed when not configured.
 * Does not invent successful model responses.
 * Provider quota handling is Step 7; typed errors are Step 8.
 */

const PROVIDER_REASON = Object.freeze({
  NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  INVALID_INPUT: 'INVALID_INPUT',
  NETWORK_DISABLED: 'NETWORK_DISABLED',
  // Reserved for later steps — do not fake success
  CALL_NOT_IMPLEMENTED: 'CALL_NOT_IMPLEMENTED'
});

/**
 * @param {{ api_key?: string, base_url?: string, enabled?: boolean }} config
 */
function createXaiAdapter(config) {
  const cfg = config || {};
  const enabled = cfg.enabled === true;
  const apiKey = typeof cfg.api_key === 'string' ? cfg.api_key : '';
  const baseUrl = typeof cfg.base_url === 'string' ? cfg.base_url : '';

  function isConfigured() {
    return enabled && apiKey.length > 0 && baseUrl.length > 0;
  }

  /**
   * Attempt external call.
   * First build: refuse to fabricate responses. Configured path still
   * returns CALL_NOT_IMPLEMENTED until real HTTP client is wired under policy.
   */
  function call(job) {
    if (!job || typeof job.action !== 'string') {
      return {
        ok: false,
        reason: PROVIDER_REASON.INVALID_INPUT,
        threat: true,
        output: null
      };
    }
    if (!isConfigured()) {
      return {
        ok: false,
        reason: PROVIDER_REASON.NOT_CONFIGURED,
        threat: false,
        output: null,
        path: 'external'
      };
    }
    // Real outbound HTTP is intentionally not implemented in this step.
    // Zero-tolerance: no fake success payload.
    return {
      ok: false,
      reason: PROVIDER_REASON.CALL_NOT_IMPLEMENTED,
      threat: false,
      output: null,
      path: 'external',
      note: 'Adapter configured but live provider HTTP deferred; fail closed'
    };
  }

  return Object.freeze({
    call,
    isConfigured,
    PROVIDER_REASON
  });
}

module.exports = {
  PROVIDER_REASON,
  createXaiAdapter
};
