'use strict';

/**
 * Minimal deterministic CBOR encoder (definite lengths only).
 * Supports: null, bool, int (uint/nint modest range), bstr, tstr, arrays, maps.
 * Map keys sorted as UTF-8 byte order for determinism.
 */

function encodeUnsigned(n) {
  if (n < 0) throw new Error('unsigned required');
  if (n < 24) return Buffer.from([n]);
  if (n < 256) return Buffer.from([24, n]);
  if (n < 65536) {
    const b = Buffer.alloc(3);
    b[0] = 25;
    b.writeUInt16BE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = 26;
  b.writeUInt32BE(n, 1);
  return b;
}

function encodeTypeAndLength(major, length) {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 256) return Buffer.from([(major << 5) | 24, length]);
  if (length < 65536) {
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(length, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(length, 1);
  return b;
}

function encodeCbor(value) {
  if (value === null || value === undefined) {
    return Buffer.from([0xf6]); // null
  }
  if (value === true) return Buffer.from([0xf5]);
  if (value === false) return Buffer.from([0xf4]);
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value >= 0) {
      if (value < 24) return Buffer.from([value]);
      return Buffer.concat([Buffer.from([0x00]), encodeUnsigned(value)]).subarray
        ? (() => {
            if (value < 24) return Buffer.from([value]);
            if (value < 256) return Buffer.from([24, value]);
            if (value < 65536) {
              const b = Buffer.alloc(3);
              b[0] = 25;
              b.writeUInt16BE(value, 1);
              return b;
            }
            const b = Buffer.alloc(5);
            b[0] = 26;
            b.writeUInt32BE(value, 1);
            return b;
          })()
        : Buffer.from([value]);
    }
    const n = -1 - value;
    if (n < 24) return Buffer.from([0x20 | n]);
    if (n < 256) return Buffer.from([0x38, n]);
    if (n < 65536) {
      const b = Buffer.alloc(3);
      b[0] = 0x39;
      b.writeUInt16BE(n, 1);
      return b;
    }
    const b = Buffer.alloc(5);
    b[0] = 0x3a;
    b.writeUInt32BE(n, 1);
    return b;
  }
  if (typeof value === 'string') {
    const body = Buffer.from(value, 'utf8');
    return Buffer.concat([encodeTypeAndLength(3, body.length), body]);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([encodeTypeAndLength(2, value.length), value]);
  }
  if (Array.isArray(value)) {
    const parts = value.map(encodeCbor);
    return Buffer.concat([encodeTypeAndLength(4, value.length), ...parts]);
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => {
      const ba = Buffer.from(a, 'utf8');
      const bb = Buffer.from(b, 'utf8');
      return ba.compare(bb);
    });
    const parts = [];
    for (const k of keys) {
      parts.push(encodeCbor(k));
      parts.push(encodeCbor(value[k]));
    }
    return Buffer.concat([encodeTypeAndLength(5, keys.length), ...parts]);
  }
  throw new Error('unsupported CBOR type');
}

// Fix integer encoding cleanly
function encodeCborFixed(value) {
  if (value === null || value === undefined) return Buffer.from([0xf6]);
  if (value === true) return Buffer.from([0xf5]);
  if (value === false) return Buffer.from([0xf4]);
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value >= 0) {
      if (value < 24) return Buffer.from([value]);
      if (value < 256) return Buffer.from([24, value]);
      if (value < 65536) {
        const b = Buffer.alloc(3);
        b[0] = 25;
        b.writeUInt16BE(value, 1);
        return b;
      }
      const b = Buffer.alloc(5);
      b[0] = 26;
      b.writeUInt32BE(value >>> 0, 1);
      return b;
    }
    const n = -1 - value;
    if (n < 24) return Buffer.from([0x20 | n]);
    if (n < 256) return Buffer.from([0x38, n]);
    if (n < 65536) {
      const b = Buffer.alloc(3);
      b[0] = 0x39;
      b.writeUInt16BE(n, 1);
      return b;
    }
    const b = Buffer.alloc(5);
    b[0] = 0x3a;
    b.writeUInt32BE(n >>> 0, 1);
    return b;
  }
  if (typeof value === 'string') {
    const body = Buffer.from(value, 'utf8');
    return Buffer.concat([encodeTypeAndLength(3, body.length), body]);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([encodeTypeAndLength(2, value.length), value]);
  }
  if (Array.isArray(value)) {
    const parts = value.map(encodeCborFixed);
    return Buffer.concat([encodeTypeAndLength(4, value.length), ...parts]);
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) =>
      Buffer.from(a, 'utf8').compare(Buffer.from(b, 'utf8'))
    );
    const parts = [];
    for (const k of keys) {
      parts.push(encodeCborFixed(k));
      parts.push(encodeCborFixed(value[k]));
    }
    return Buffer.concat([encodeTypeAndLength(5, keys.length), ...parts]);
  }
  throw new Error('unsupported CBOR type: ' + typeof value);
}

module.exports = {
  encodeCbor: encodeCborFixed
};
