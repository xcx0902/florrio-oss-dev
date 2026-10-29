import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRemPio2fHook, functionIds} from '../source/game/server/rem-pio2f.mjs';

let comparisons = 0;
after(() => console.log(
  `server rem_pio2f oracle comparisons: ${comparisons} total; fast, Inf/NaN and Payne-Hanek ranges`));

test('rem_pio2f matches original 284 with native 285', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [284, 285], construct: false});
  const hook = createRemPio2fHook(runtime)[284];
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const out = 0x500000;
  const clean = Buffer.from(memory);
  assert.deepEqual(functionIds, [284]);

  const important = [
    0x00000000, 0x80000000, 0x00000001, 0x007fffff, 0x00800000, 0x3f800000,
    0xbf800000, 0x3fc90fdb, 0x40490fdb, 0x4dc90f1a, 0x4dc90f1b, 0x4e000000,
    0x5f000000, 0x7f000000, 0x7f7fffff, 0x7f800000, 0xff800000,
    0x7fc00000, 0x7fbfffff, 0x7fffffff, 0x4b000000, 0x4b800000,
  ];
  const patterns = [...important];
  for (let exponent = 1; exponent < 255; exponent += 7) {
    for (const sign of [0, 1]) {
      patterns.push((sign << 31 | exponent << 23 | 0x12345) >>> 0);
      patterns.push((sign << 31 | exponent << 23) >>> 0);
    }
  }
  let state = 0x27182818;
  for (let i = 0; i < 420; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    patterns.push(state);
  }

  for (const bits of patterns) {
    view.setUint32(0, bits >>> 0, true);
    const x = view.getFloat32(0, true);
    memory.set(clean);
    view.setFloat64(out, 0x7ff8deadbeef, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(284, x, out) | 0;
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
