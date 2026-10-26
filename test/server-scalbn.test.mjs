import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createScalbnHook, functionIds} from '../source/game/server/scalbn.mjs';

let comparisons = 0;
after(() => console.log(
  `server scalbn oracle comparisons: ${comparisons} total; `
  + 'normal, subnormal, overflow and special values'));

test('scalbn 107 matches the original bit for bit', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createScalbnHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const bits = new DataView(new ArrayBuffer(8));
  const values = [0, -0, 1, -1, 2, 0.5, 1e-300, 1e300, Number.MIN_VALUE, Number.MAX_VALUE,
    Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, 1.0000000000000002];
  assert.equal(hook[107].length, runtime.exports.__fn107.length);
  const before = Buffer.from(memory);
  for (const value of values) {
    for (let exponent = -4100; exponent <= 4100; exponent += 137) {
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(107, value, exponent);
      bits.setFloat64(0, expected, true);
      const expectedBits = bits.getBigUint64(0, true);
      const actual = hook[107](value, exponent);
      bits.setFloat64(0, actual, true);
      assert.equal(bits.getBigUint64(0, true), expectedBits, `${value}/${exponent}`);
      assert.equal(runtime.stackPointer.value, stack, `${exponent}: stack`);
      comparisons++;
    }
    for (const exponent of [1023, 1024, 2046, 2047, 3068, 3069, -1022, -1023, -2044, -2045, -3065, -3066]) {
      const expected = runtime.call(107, value, exponent);
      bits.setFloat64(0, expected, true);
      const expectedBits = bits.getBigUint64(0, true);
      const actual = hook[107](value, exponent);
      bits.setFloat64(0, actual, true);
      assert.equal(bits.getBigUint64(0, true), expectedBits, `${value}/${exponent}: boundary`);
      comparisons++;
    }
  }
  assert.ok(Buffer.from(memory).equals(before), 'scalbn is read-only');
});
