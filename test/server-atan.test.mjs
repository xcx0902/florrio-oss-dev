import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAtanHook} from '../source/game/server/atan.mjs';

let exactComparisons = 0;
let fuzzComparisons = 0;
after(() => console.log(
  `server atan oracle comparisons: ${exactComparisons} exact + ${fuzzComparisons} fuzz; `
  + 'reduction boundaries, specials and 50k random bit patterns'));

function bitsOf(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false);
}

function bitsToDouble(bits) {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt.asUintN(64, bits), false);
  return view.getFloat64(0, false);
}

test('atan 383 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [383], construct: false});
  const hook = createAtanHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  assert.equal(hook[383].length, runtime.exports.__fn383.length);

  const values = [
    0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, 1e-320, -1e-320,
    0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    -0.1, -0.2, -0.3, -0.4, -0.5, -0.6, -0.7, -0.8, -0.9,
    1, -1, 1.5, -1.5, 2, -2, 3, -3, 10, -10, 1e6, -1e6,
    Math.PI, -Math.PI, Infinity, -Infinity, NaN,
  ];
  for (const threshold of [0x3e400000, 0x3fdc0000, 0x3fe60000, 0x3ff30000, 0x40038000, 0x44100000]) {
    for (const delta of [-1, 0, 1]) {
      for (const low of [0, 0xffffffff]) {
        const bits = ((BigInt(threshold + delta) & 0x7fffffffn) << 32n) | BigInt(low >>> 0);
        values.push(bitsToDouble(bits), bitsToDouble(bits | (1n << 63n)));
      }
    }
  }
  values.push(bitsToDouble(0x7ff8000000000001n), bitsToDouble(0xfff8000000000001n));

  for (const value of values) {
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(383, value);
    const expectedMemory = Buffer.from(memory);
    assert.equal(runtime.stackPointer.value, stack, `native ${value}: stack`);
    const actual = hook[383](value);
    assert.equal(bitsOf(actual), bitsOf(expected), `${value}: ${actual} !== ${expected}`);
    assert.equal(runtime.stackPointer.value, stack, `${value}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${value}: memory`);
    exactComparisons++;
  }

  let state = 0x12345678n;
  const random = new DataView(new ArrayBuffer(8));
  for (let index = 0; index < 50000; index++) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    random.setBigUint64(0, state, false);
    const value = random.getFloat64(0, false);
    const expected = runtime.call(383, value);
    assert.equal(bitsOf(hook[383](value)), bitsOf(expected), `fuzz ${index}: ${value}`);
    fuzzComparisons++;
  }
});
