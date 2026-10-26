import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRemPio2Hook, functionIds} from '../source/game/server/rem-pio2.mjs';

let comparisons = 0;
after(() => console.log(
  `server rem_pio2 oracle comparisons: ${comparisons} total; quadrants, medium and Payne-Hanek ranges`));

test('rem_pio2 matches original 283 with native 285', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [283, 285], construct: false});
  const hook = createRemPio2Hook(runtime)[283];
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const out = 0x500000;
  const clean = Buffer.from(memory);
  assert.deepEqual(functionIds, [283]);

  const important = [
    0x0000000000000000n, 0x8000000000000000n, 0x0000000000000001n,
    0x000fffffffffffffn, 0x0010000000000000n, 0x3ff0000000000000n,
    0xbff0000000000000n, 0x3ff921fb54442d18n, 0xc00921fb54442d18n,
    0x4002d97c7f3321d2n, 0x400f6a7a2955385en, 0x4012d97c7f3321d2n,
    0x4015fdbc4b28f5f3n, 0x401921fb54442d18n, 0x401c463aaf99a735n,
    0x413921f9ffffffffn, 0x413921fa00000000n, 0x413921fb54442d18n,
    0x7fefffffffffffffn, 0x7ff0000000000000n, 0xfff0000000000000n,
    0x7ff8000000000000n, 0x7ff7ffffffffffffn, 0x4340000000000000n,
  ];
  const patterns = [...important];
  for (let exponent = 1; exponent < 2047; exponent += 31) {
    for (const sign of [0n, 1n]) {
      patterns.push((sign << 63n) | (BigInt(exponent) << 52n) | 0x123456789abcn);
      patterns.push((sign << 63n) | (BigInt(exponent) << 52n));
    }
  }
  let state = 0x31415926;
  for (let i = 0; i < 480; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const low = (Math.imul(state, 2654435761) >>> 0) | 0;
    patterns.push((BigInt(state) << 32n) | BigInt(low >>> 0));
  }

  for (const bits of patterns) {
    view.setBigUint64(0, bits, true);
    const x = view.getFloat64(0, true);
    memory.set(clean);
    view.setFloat64(out, 0x7ff8deadbeef, true);
    view.setFloat64(out + 8, 0x7ff8deadbeef, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(283, x, out) | 0;
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(x, out) | 0;
    assert.equal(actual, expected, `bits ${bits.toString(16)}: result`);
    assert.equal(runtime.stackPointer.value, stack, `bits ${bits.toString(16)}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `bits ${bits.toString(16)}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 500);
});
