'use strict';

/**
 * Typed Provider Errors — Step 8
 *
 * Machine-distinguishable failures at the external boundary.
 * Generic "provider failed" is forbidden as a routing input.
 *
 * Fallback is only considered for eligible classes, and only when policy permits.
 */

class ProviderError extends Error {
  /**
   * @param {string} message
   * @param {{ code: string, retryable?: boolean, fallback_candidate?: boolean, details?: object }} meta
   */
  constructor(message, meta) {
    super(message);
    this.name = this.constructor.name;
    this.code = meta.code;
    this.retryable = meta.retryable === true;
    this.fallback_candidate = meta.fallback_candidate === true;
    this.details = meta.details || {};
    this.path = 'external';
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      fallback_candidate: this.fallback_candidate,
      path: this.path,
      details: this.details
    };
  }
}

class ProviderQuotaError extends ProviderError {
  constructor(message, details) {
    super(message || 'Provider quota exceeded', {
      code: 'PROVIDER_QUOTA',
      retryable: true,
      fallback_candidate: true,
      details
    });
  }
}

class ProviderUnavailableError extends ProviderError {
  constructor(message, details) {
    super(message || 'Provider unavailable', {
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      fallback_candidate: true,
      details
    });
  }
}

class ProviderTimeoutError extends ProviderError {
  constructor(message, details) {
    super(message || 'Provider timeout', {
      code: 'PROVIDER_TIMEOUT',
      retryable: true,
      fallback_candidate: true,
      details
    });
  }
}

class ProviderAuthError extends ProviderError {
  constructor(message, details) {
    super(message || 'Provider authentication failed', {
      code: 'PROVIDER_AUTH',
      retryable: false,
      fallback_candidate: false,
      details
    });
  }
}

class ProviderPolicyDeniedError extends ProviderError {
  constructor(message, details) {
    super(message || 'Provider path denied by policy', {
      code: 'PROVIDER_POLICY_DENIED',
      retryable: false,
      fallback_candidate: false,
      details
    });
  }
}

class ProviderNetworkDeniedError extends ProviderError {
  constructor(message, details) {
    super(message || 'Network denied for provider path', {
      code: 'PROVIDER_NETWORK_DENIED',
      retryable: false,
      fallback_candidate: false,
      details
    });
  }
}

const PROVIDER_ERROR_CODES = Object.freeze({
  PROVIDER_QUOTA: 'PROVIDER_QUOTA',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_TIMEOUT: 'PROVIDER_TIMEOUT',
  PROVIDER_AUTH: 'PROVIDER_AUTH',
  PROVIDER_POLICY_DENIED: 'PROVIDER_POLICY_DENIED',
  PROVIDER_NETWORK_DENIED: 'PROVIDER_NETWORK_DENIED',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_CALL_NOT_IMPLEMENTED: 'PROVIDER_CALL_NOT_IMPLEMENTED',
  PROVIDER_UNKNOWN: 'PROVIDER_UNKNOWN'
});

/**
 * Map adapter/limiter reason strings to typed errors.
 * @param {string} reason
 * @param {object} [details]
 * @returns {ProviderError}
 */
function classifyProviderFailure(reason, details) {
  switch (reason) {
    case 'PROVIDER_QUOTA_EXCEEDED':
    case 'PROVIDER_QUOTA':
      return new ProviderQuotaError(undefined, details);
    case 'PROVIDER_UNAVAILABLE':
      return new ProviderUnavailableError(undefined, details);
    case 'PROVIDER_TIMEOUT':
      return new ProviderTimeoutError(undefined, details);
    case 'PROVIDER_AUTH':
    case 'PROVIDER_AUTH_ERROR':
      return new ProviderAuthError(undefined, details);
    case 'PROVIDER_POLICY_DENIED':
      return new ProviderPolicyDeniedError(undefined, details);
    case 'PROVIDER_NETWORK_DENIED':
    case 'NETWORK_DISABLED':
      return new ProviderNetworkDeniedError(undefined, details);
    case 'PROVIDER_NOT_CONFIGURED':
      return new ProviderUnavailableError('Provider not configured', {
        ...details,
        code_detail: PROVIDER_ERROR_CODES.PROVIDER_NOT_CONFIGURED
      });
    case 'CALL_NOT_IMPLEMENTED':
    case 'PROVIDER_CALL_NOT_IMPLEMENTED':
      return new ProviderUnavailableError('Provider call not implemented', {
        ...details,
        code_detail: PROVIDER_ERROR_CODES.PROVIDER_CALL_NOT_IMPLEMENTED
      });
    default:
      return new ProviderUnavailableError('Unclassified provider failure', {
        ...details,
        original_reason: reason,
        code_detail: PROVIDER_ERROR_CODES.PROVIDER_UNKNOWN
      });
  }
}

/**
 * Whether this error class may be considered for local fallback.
 * Policy must still permit the fallback separately (Step 9).
 *
 * @param {ProviderError|Error|object} err
 * @param {{ policy_allows_fallback?: boolean }} [ctx]
 */
function isFallbackCandidate(err, ctx) {
  const policyAllows = !ctx || ctx.policy_allows_fallback !== false;
  if (!policyAllows) return false;
  if (err instanceof ProviderError) {
    return err.fallback_candidate === true;
  }
  if (err && typeof err === 'object' && err.fallback_candidate === true) {
    return true;
  }
  return false;
}

module.exports = {
  ProviderError,
  ProviderQuotaError,
  ProviderUnavailableError,
  ProviderTimeoutError,
  ProviderAuthError,
  ProviderPolicyDeniedError,
  ProviderNetworkDeniedError,
  PROVIDER_ERROR_CODES,
  classifyProviderFailure,
  isFallbackCandidate
};
