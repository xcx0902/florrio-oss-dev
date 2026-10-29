import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAtanHooks, functionIds} from '../source/game/client/atan.mjs';

let comparisons = 0;
after(() => console.log(
  `client atan oracle comparisons: ${comparisons} total (0 trapping); bit-exact float64 returns`));

const bitsScratch = new DataView(new ArrayBuffer(8));
const bitsOf = value => {
  bitsScratch.setFloat64(0, value, true);
  return bitsScratch.getBigUint64(0, true);
};

test('atan exposes the original arity and replaces id 933', async () => {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createAtanHooks(runtime);
  assert.deepEqual([...functionIds], [933]);
  assert.equal(typeof hooks[933], 'function');
  assert.equal(hooks[933].length, runtime.exports.__fn933.length);
});

test('atan matches the original on thresholds, signs, specials and random doubles', async () => {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createAtanHooks(runtime);
  const values = [
    0, -0, 5e-324, -5e-324, 2.2e-308, 1e-17, 1e-10, 1e-5,
    1.4551915228366852e-11, 0.0001, 0.01, 0.1, 0.25, 0.4374, 0.4375,
    0.5, 0.6874, 0.6875, 0.6876, 0.75, 0.99, 1, 1.0001, 1.1874,
    1.1875, 1.5, 2, 2.4374, 2.4375, 2.4376, 3, 3.4, 10, 1e5,
    1e20, 1e100, 1.7976931348623157e308, Infinity, -Infinity, NaN,
  ];
  for (const value of [0.3125, 0.625, 0.875, 1.25, 1.75, 2.75])
    values.push(value, -value);
  let state = 0x9e3779b9;
  for (let index = 0; index < 260; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const high = (Math.imul(state, 2654435761) ^ (state >>> 15)) | 0;
    const low = (Math.imul(state ^ 0x5bd1e995, 2246822519) + 3266489917) | 0;
    const sign = high & 0x80000000;
    bitsScratch.setBigUint64(0,
      (BigInt(sign >>> 0) << 32n) | BigInt(high & 0x7fffffff) << 1n
      | BigInt((low >>> 31) & 1), true);
    values.push(bitsScratch.getFloat64(0, true));
  }

  for (const value of values) {
    const expected = runtime.call(933, value);
    const actual = hooks[933](value);
    if (Number.isNaN(expected)) {
      assert.ok(Number.isNaN(actual), `NaN result for ${value}`);
    } else {
      assert.equal(bitsOf(actual), bitsOf(expected), `bits for ${value}`);
    }
    comparisons++;
  }
});
