'use strict';

/**
 * Provider rate limit — Step 7
 *
 * Applies ONLY at the external provider boundary.
 * Never gates local runtime or internal orchestration.
 *
 * AUTHORIZED ≠ UNLIMITED: limits are finite for all roles including owner.
 * Quota hit ⇒ deny this provider request only; local platform stays up.
 */

const LIMIT_REASON = Object.freeze({
  INVALID: 'INVALID',
  NOT_EXTERNAL: 'NOT_EXTERNAL',
  ALLOWED: 'PROVIDER_ALLOWED',
  QUOTA_EXCEEDED: 'PROVIDER_QUOTA_EXCEEDED'
});

/** Finite defaults — no Infinity bypass */
const DEFAULT_LIMITS = Object.freeze({
  owner: 1000,
  developer: 500,
  internal: 200,
  participant: 100,
  customer: 50,
  anonymous: 10
});

/**
 * @param {{ limits?: Record<string, number>, windowMs?: number }} [opts]
 */
function createProviderRateLimiter(opts) {
  const limits = { ...DEFAULT_LIMITS, ...(opts && opts.limits) };
  // Enforce finite positive integers only
  for (const k of Object.keys(limits)) {
    const n = limits[k];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
      throw new Error('limit must be finite non-negative number: ' + k);
    }
    if (n === Infinity || n === -Infinity) {
      throw new Error('Infinity limits forbidden: ' + k);
    }
  }

  const windowMs = (opts && opts.windowMs) || 60_000;
  /** @type {Map<string, { count: number, windowStart: number }>} */
  const buckets = new Map();

  function roleKey(role) {
    if (typeof role === 'string' && limits[role] != null) return role;
    return 'anonymous';
  }

  function limitFor(role) {
    return limits[roleKey(role)];
  }

  /**
   * Check and optionally consume one external provider unit.
   *
   * @param {{ role: string, path: 'external'|'local'|'internal', consume?: boolean, now?: number }} req
   */
  function check(req) {
    if (!req || typeof req.path !== 'string') {
      return {
        allowed: false,
        reason: LIMIT_REASON.INVALID,
        threat: true
      };
    }

    // Local / internal paths are never limited by this middleware
    if (req.path !== 'external') {
      return {
        allowed: true,
        reason: LIMIT_REASON.NOT_EXTERNAL,
        limited: false,
        note: 'Provider limiter does not apply to non-external paths'
      };
    }

    const role = roleKey(req.role);
    const max = limitFor(role);
    const now = req.now != null ? req.now : Date.now();
    const key = role;

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(key, bucket);
    }

    if (bucket.count >= max) {
      return {
        allowed: false,
        reason: LIMIT_REASON.QUOTA_EXCEEDED,
        threat: false,
        role,
        limit: max,
        count: bucket.count,
        path: 'external',
        local_still_available: true
      };
    }

    if (req.consume !== false) {
      bucket.count += 1;
    }

    return {
      allowed: true,
      reason: LIMIT_REASON.ALLOWED,
      threat: false,
      role,
      limit: max,
      count: bucket.count,
      path: 'external',
      local_still_available: true
    };
  }

  function reset() {
    buckets.clear();
  }

  function snapshot() {
    const out = {};
    for (const [k, v] of buckets.entries()) {
      out[k] = { count: v.count, windowStart: v.windowStart, limit: limitFor(k) };
    }
    return out;
  }

  return Object.freeze({
    check,
    reset,
    snapshot,
    limitFor,
    LIMIT_REASON,
    DEFAULT_LIMITS: { ...limits }
  });
}

module.exports = {
  LIMIT_REASON,
  DEFAULT_LIMITS,
  createProviderRateLimiter
};
