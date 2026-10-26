import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createGrowthFactorHook, functionIds} from '../source/game/server/growth-factor.mjs';

let comparisons = 0;
after(() => console.log(
  `server growth-factor oracle comparisons: ${comparisons} total (0 trapping); `
  + 'negative, zero, positive and large integer exponents'));

test('growthFactor 262 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createGrowthFactorHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const before = Buffer.from(bytes);
  assert.equal(hook[262].length, runtime.exports.__fn262.length);
  for (const exponent of [-64, -20, -7, -3, -2, -1, 0, 1, 2, 3, 4, 7, 20, 64, 255, 1024]) {
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(262, exponent);
    const actual = hook[262](exponent);
    assert.ok(Object.is(actual, expected), `${exponent}: ${actual} !== ${expected}`);
    assert.equal(runtime.stackPointer.value, stack, `${exponent}: stack`);
    comparisons++;
  }
  assert.ok(Buffer.from(bytes).equals(before), 'growth factor is read-only');
});
