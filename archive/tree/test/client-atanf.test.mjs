import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAtanfHooks, functionIds} from '../source/game/client/atanf.mjs';

let comparisons = 0, traps = 0;
after(() => console.log(
  `client atanf oracle comparisons: ${comparisons} total (${traps} trapping); bit-exact float32 returns`));

const bitsScratch = new DataView(new ArrayBuffer(4));
const bitsOf = value => {
  bitsScratch.setFloat32(0, value, true);
  return bitsScratch.getUint32(0, true);
};

test('atanf exposes the original arity and replaces id 932', async () => {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createAtanfHooks(runtime);
  assert.deepEqual([...functionIds], [932]);
  assert.equal(typeof hooks[932], 'function');
  assert.equal(hooks[932].length, runtime.exports.__fn932.length);
});

test('atanf matches the original on thresholds, signs, specials and random floats', async () => {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createAtanfHooks(runtime);
  const values = [
    0, -0, 1e-45, -1e-45, 5.9e-39, 5.960464477539063e-8,
    0x39800000 === 0 ? 0 : 6.103515625e-5, 6.103515626e-5,
    0.0001, 0.01, 0.1, 0.25, 0.4374, 0.4375, 0.4376,
    0.5, 0.6874, 0.6875, 0.6876, 0.75, 0.99, 1, 1.0001,
    1.1874, 1.1875, 1.1876, 1.5, 2, 2.4374, 2.4375, 2.4376,
    3, 3.4, 10, 1e5, 1e20, 3.4028234663852886e38,
    Infinity, -Infinity, NaN, -NaN,
  ];
  for (const value of [0.3125, 0.625, 0.875, 1.25, 1.75, 2.75]) values.push(value, -value);
  let state = 0x2545f491;
  for (let index = 0; index < 240; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const exponent = (state >>> 23) & 0xff;
    const mantissa = state & 0x7fffff;
    const sign = state & 0x80000000;
    bitsScratch.setUint32(0, (sign | (exponent << 23) | mantissa) >>> 0, true);
    values.push(bitsScratch.getFloat32(0, true));
  }

  for (const value of values) {
    const expected = runtime.call(932, value);
    const actual = hooks[932](value);
    if (Number.isNaN(expected)) {
      assert.ok(Number.isNaN(actual), `NaN result for ${value}`);
    } else {
      assert.equal(bitsOf(actual), bitsOf(expected), `bits for ${value}`);
    }
    comparisons++;
  }
});
