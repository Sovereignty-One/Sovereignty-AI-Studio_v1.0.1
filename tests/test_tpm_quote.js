'use strict';

const assert = require('assert');
const { generateTpmQuote, verifyTpmQuote } = require('../backend/pqc/tpm_quote');

// Negative tests first: no fabricated evidence is accepted.
let r = generateTpmQuote('', {});
assert.strictEqual(r.ok, false);

r = generateTpmQuote('0123456789abcdef0123456789abcdef', {});
assert.strictEqual(r.ok, false);

r = verifyTpmQuote({}, {});
assert.strictEqual(r.ok, false);

r = verifyTpmQuote({ nonce: '0123456789abcdef0123456789abcdef' }, {});
assert.strictEqual(r.ok, false);

console.log('PASS missing nonce → DENY');
console.log('PASS missing TPM configuration → DENY');
console.log('PASS empty verification evidence → DENY');
console.log('PASS incomplete TPM evidence → DENY');
console.log('PASS no fake TPM success path');
