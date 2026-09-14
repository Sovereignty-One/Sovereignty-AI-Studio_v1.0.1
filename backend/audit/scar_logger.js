'use strict';

/**
 * SCAR Evidence Logger — Step 12
 *
 * Append-only local ledger for security-relevant decisions.
 * Each entry: timestamp, participant, action, policy, result, integrity hash, prev_hash.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCAR_REASON = Object.freeze({
  INVALID: 'INVALID',
  APPENDED: 'APPENDED',
  READ: 'READ',
  CHAIN_OK: 'CHAIN_OK',
  CHAIN_BROKEN: 'CHAIN_BROKEN'
});

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function canonicalEntryBody(entry) {
  const body = {
    action: entry.action,
    participant: entry.participant,
    policy: entry.policy,
    prev_hash: entry.prev_hash,
    result: entry.result,
    timestamp: entry.timestamp
  };
  if (entry.details !== undefined) body.details = entry.details;
  return JSON.stringify(body);
}

/**
 * @param {string} logPath
 */
function createScarLogger(logPath) {
  if (typeof logPath !== 'string' || !logPath) {
    throw new Error('logPath required');
  }

  function ensureDir() {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }

  function lastHash() {
    if (!fs.existsSync(logPath)) return '0'.repeat(64);
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    if (!lines.length) return '0'.repeat(64);
    try {
      const last = JSON.parse(lines[lines.length - 1]);
      return typeof last.hash === 'string' ? last.hash : '0'.repeat(64);
    } catch {
      return '0'.repeat(64);
    }
  }

  /**
   * Append one evidence entry. No update/delete.
   *
   * @param {{ participant: string, action: string, policy: string, result: string, details?: object }} ev
   */
  function append(ev) {
    if (!ev || typeof ev !== 'object') {
      return { ok: false, reason: SCAR_REASON.INVALID, threat: true };
    }
    if (typeof ev.participant !== 'string' || !ev.participant) {
      return { ok: false, reason: SCAR_REASON.INVALID, threat: true };
    }
    if (typeof ev.action !== 'string' || !ev.action) {
      return { ok: false, reason: SCAR_REASON.INVALID, threat: true };
    }
    if (typeof ev.policy !== 'string' || !ev.policy) {
      return { ok: false, reason: SCAR_REASON.INVALID, threat: true };
    }
    if (typeof ev.result !== 'string' || !ev.result) {
      return { ok: false, reason: SCAR_REASON.INVALID, threat: true };
    }

    ensureDir();
    const prev_hash = lastHash();
    const entry = {
      timestamp: Date.now(),
      participant: ev.participant,
      action: ev.action,
      policy: ev.policy,
      result: ev.result,
      prev_hash,
      details: ev.details && typeof ev.details === 'object' ? ev.details : undefined
    };
    entry.hash = sha256Hex(canonicalEntryBody(entry));

    // Append-only: open with flag 'a'
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', { mode: 0o600 });
    return {
      ok: true,
      reason: SCAR_REASON.APPENDED,
      hash: entry.hash,
      prev_hash,
      threat: false
    };
  }

  function readAll() {
    if (!fs.existsSync(logPath)) {
      return { ok: true, reason: SCAR_REASON.READ, entries: [] };
    }
    const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        return { ok: false, reason: SCAR_REASON.CHAIN_BROKEN, entries: [], threat: true };
      }
    }
    return { ok: true, reason: SCAR_REASON.READ, entries };
  }

  function verifyChain() {
    const snap = readAll();
    if (!snap.ok) return snap;
    let prev = '0'.repeat(64);
    for (const entry of snap.entries) {
      if (entry.prev_hash !== prev) {
        return { ok: false, reason: SCAR_REASON.CHAIN_BROKEN, threat: true };
      }
      const { hash, ...rest } = entry;
      const expected = sha256Hex(canonicalEntryBody(rest));
      if (hash !== expected) {
        return { ok: false, reason: SCAR_REASON.CHAIN_BROKEN, threat: true };
      }
      prev = hash;
    }
    return { ok: true, reason: SCAR_REASON.CHAIN_OK, count: snap.entries.length, threat: false };
  }

  // Explicitly no truncate / rewrite / delete methods on the public API.

  return Object.freeze({
    append,
    readAll,
    verifyChain,
    path: logPath,
    SCAR_REASON
  });
}

module.exports = {
  SCAR_REASON,
  createScarLogger
};
