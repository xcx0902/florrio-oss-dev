import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createWideShiftHook, functionIds} from '../source/game/server/wide-shift.mjs';

let comparisons = 0;
after(() => console.log(
  `server 128-bit shift oracle comparisons: ${comparisons} total (0 trapping); `
  + 'left/right shifts 0..130 across low/high word boundaries'));

const PAIRS = [
  [0x0123456789abcdefn, 0xfedcba9876543210n],
  [0xffffffffffffffffn, 0xffffffffffffffffn],
  [0n, 0x8000000000000000n],
  [0x8000000000000000n, 0n],
  [0xdeadbeefcafebaben, 0x1122334455667788n],
];

test('128-bit shifts 55/122 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createWideShiftHook(runtime);
  const view = new DataView(runtime.memory.buffer);
  const output = 0x320000;
  assert.equal(hook[55].length, runtime.exports.__fn55.length);
  assert.equal(hook[122].length, runtime.exports.__fn122.length);
  for (const [low, high] of PAIRS) {
    for (const count of [0, 1, 7, 31, 32, 63, 64, 65, 96, 127, 128, 130]) {
      view.setBigUint64(output, 0x1111111111111111n, true);
      view.setBigUint64(output + 8, 0x2222222222222222n, true);
      const before = Buffer.from(new Uint8Array(runtime.memory.buffer));
      const stack = runtime.stackPointer.value;
      runtime.call(55, output, low, high, count);
      const expectedMemory = Buffer.from(new Uint8Array(runtime.memory.buffer));
      new Uint8Array(runtime.memory.buffer).set(before);
      runtime.stackPointer.value = stack;
      hook[55](output, low, high, count);
      assert.ok(Buffer.from(new Uint8Array(runtime.memory.buffer)).equals(expectedMemory),
        `${low}/${high}/${count}: complete memory`);
      assert.equal(runtime.stackPointer.value, stack, `${count}: stack`);
      runtime.call(122, output, low, high, count);
      const rightExpected = Buffer.from(new Uint8Array(runtime.memory.buffer));
      new Uint8Array(runtime.memory.buffer).set(before);
      runtime.stackPointer.value = stack;
      hook[122](output, low, high, count);
      assert.ok(Buffer.from(new Uint8Array(runtime.memory.buffer)).equals(rightExpected),
        `${low}/${high}/${count}: right complete memory`);
      assert.equal(runtime.stackPointer.value, stack, `${count}: right stack`);
      comparisons += 2;
    }
  }
});
