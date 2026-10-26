import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFrexpHook, functionIds} from '../source/game/client/frexp.mjs';

let comparisons = 0;
after(() => console.log(
  `client frexp 922 oracle comparisons: ${comparisons} total (0 trapping); `
  + 'normal, zero, subnormal, infinite and NaN inputs'));

const VALUES = [
  0, -0, 1, -1, 0.5, -0.5, 2, 3.141592653589793, 1e300, -1e300,
  5e-324, 1e-310, 2.2250738585072014e-308, Infinity, -Infinity, NaN,
];

test('frexp 922 matches the original for the full IEEE-754 range', async () => {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createFrexpHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const exponentAddress = 0x100000;
  assert.equal(hooks[922].length, runtime.exports.__fn922.length);
  for (const value of VALUES) {
    bytes.fill(0, exponentAddress, exponentAddress + 16);
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    const expected = runtime.call(922, value, exponentAddress);
    const expectedExponent = view.getInt32(exponentAddress, true);
    const expectedMemory = Buffer.from(bytes);
    bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = hooks[922](value, exponentAddress);
    assert.ok(Object.is(actual, expected) || (Number.isNaN(actual) && Number.isNaN(expected)),
      `${value}: fraction`);
    assert.equal(view.getInt32(exponentAddress, true), expectedExponent, `${value}: exponent`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${value}: complete memory`);
    assert.equal(runtime.stackPointer.value, stack, `${value}: stack`);
    comparisons++;
  }
});
