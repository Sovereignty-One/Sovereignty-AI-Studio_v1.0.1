'use strict';

/**
 * Policy-approved Local Fallback — Step 9
 *
 * External failure → local only when:
 *   1) error is a typed fallback candidate
 *   2) policy explicitly allows fallback
 *
 * Never: auth / policy-denied / network-denied auto-fallback.
 * Never: treat fallback as privilege escalation.
 */

const { isFallbackCandidate, classifyProviderFailure } = require('../errors/provider_errors');
const { executeLocal } = require('./local_runtime');

const FALLBACK_REASON = Object.freeze({
  NO_ERROR: 'NO_ERROR',
  NOT_CANDIDATE: 'NOT_CANDIDATE',
  POLICY_DISALLOWS: 'POLICY_DISALLOWS',
  LOCAL_EXECUTED: 'LOCAL_FALLBACK_EXECUTED',
  LOCAL_FAILED: 'LOCAL_FALLBACK_FAILED',
  INVALID: 'INVALID'
});

/**
 * Decide and optionally execute local fallback after an external failure.
 *
 * @param {object} input
 * @param {Error|object|string} input.error — typed error, classifier reason, or error-like
 * @param {boolean} input.policy_allows_fallback — from execution policy / owner setting
 * @param {{ action: string, actor: string, prompt?: string }} input.job
 * @param {boolean} [input.execute=true] — if false, only decide
 */
function attemptLocalFallback(input) {
  if (!input || typeof input !== 'object') {
    return {
      ok: false,
      fell_back: false,
      reason: FALLBACK_REASON.INVALID,
      threat: true
    };
  }

  const policyAllows = input.policy_allows_fallback === true;
  let err = input.error;

  if (typeof err === 'string') {
    err = classifyProviderFailure(err);
  }

  if (!err) {
    return {
      ok: false,
      fell_back: false,
      reason: FALLBACK_REASON.NO_ERROR,
      threat: false
    };
  }

  if (!isFallbackCandidate(err, { policy_allows_fallback: policyAllows })) {
    // Distinguish policy block vs class block
    if (!policyAllows && (err.fallback_candidate === true || isFallbackCandidate(err, { policy_allows_fallback: true }))) {
      return {
        ok: false,
        fell_back: false,
        reason: FALLBACK_REASON.POLICY_DISALLOWS,
        threat: false,
        error: err && err.toJSON ? err.toJSON() : err
      };
    }
    return {
      ok: false,
      fell_back: false,
      reason: FALLBACK_REASON.NOT_CANDIDATE,
      threat: false,
      error: err && err.toJSON ? err.toJSON() : err
    };
  }

  if (input.execute === false) {
    return {
      ok: true,
      fell_back: false,
      would_fallback: true,
      reason: FALLBACK_REASON.LOCAL_EXECUTED,
      threat: false,
      error: err && err.toJSON ? err.toJSON() : err
    };
  }

  const job = input.job;
  if (!job || typeof job.action !== 'string' || typeof job.actor !== 'string') {
    return {
      ok: false,
      fell_back: false,
      reason: FALLBACK_REASON.INVALID,
      threat: true
    };
  }

  const local = executeLocal(job);
  if (!local.ok) {
    return {
      ok: false,
      fell_back: true,
      reason: FALLBACK_REASON.LOCAL_FAILED,
      threat: local.threat === true,
      local,
      error: err && err.toJSON ? err.toJSON() : err
    };
  }

  return {
    ok: true,
    fell_back: true,
    reason: FALLBACK_REASON.LOCAL_EXECUTED,
    threat: false,
    local,
    error: err && err.toJSON ? err.toJSON() : err,
    note: 'External failure recovered via policy-approved local path only'
  };
}

module.exports = {
  FALLBACK_REASON,
  attemptLocalFallback
};
