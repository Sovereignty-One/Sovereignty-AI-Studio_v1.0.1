'use strict';

/**
 * Local Runtime — Step 6
 *
 * Device-local execution path. No network. No provider quota.
 */

const LOCAL_REASON = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  EXECUTED: 'EXECUTED'
});

/**
 * Execute a local inference-style job.
 * First build: deterministic local handler (no model weights required).
 * Does not call external APIs.
 *
 * @param {{ action: string, prompt?: string, actor: string }} job
 */
function executeLocal(job) {
  if (!job || typeof job.action !== 'string' || typeof job.actor !== 'string') {
    return {
      ok: false,
      reason: LOCAL_REASON.INVALID_INPUT,
      threat: true,
      output: null
    };
  }

  return {
    ok: true,
    reason: LOCAL_REASON.EXECUTED,
    threat: false,
    path: 'local',
    actor: job.actor,
    action: job.action,
    output: {
      type: 'local_runtime',
      message: 'local execution complete',
      echo: typeof job.prompt === 'string' ? job.prompt.slice(0, 512) : null,
      network: false
    }
  };
}

module.exports = {
  LOCAL_REASON,
  executeLocal
};
