import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createWideMultiplyHook, functionIds} from '../source/game/server/wide-multiply.mjs';

let comparisons = 0;
after(() => console.log(
  `server 128-bit multiply oracle comparisons: ${comparisons} total; `
  + 'fixed and random limb pairs'));

test('128-bit multiply 50 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createWideMultiplyHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const base = 0x3d0000;
  assert.equal(hook[50].length, runtime.exports.__fn50.length);
  const pairs = [
    [0n, 0n, 0n, 0n],
    [1n, 0n, 1n, 0n],
    [0xffffffffffffffffn, 0n, 0xffffffffffffffffn, 0n],
    [0xffffffffffffffffn, 0xffffffffffffffffn, 0xffffffffffffffffn, 0xffffffffffffffffn],
    [0x0123456789abcdefn, 0xfedcba9876543210n, 0x1111111111111111n, 0x2222222222222222n],
    [0n, 1n, 0n, 1n],
    [0x8000000000000000n, 0n, 2n, 0n],
  ];
  let state = 0x12345678;
  for (let i = 0; i < 100; i++) {
    const limbs = [];
    for (let j = 0; j < 4; j++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      limbs.push((BigInt(state) << 32n) | BigInt((state = (Math.imul(state, 1664525) + 1013904223) >>> 0)));
    }
    pairs.push(limbs);
  }
  for (const [aLow, aHigh, bLow, bHigh] of pairs) {
    memory.fill(0x44, base, base + 64);
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(50, base + 16, aLow, aHigh, bLow, bHigh);
    const expected = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    hook[50](base + 16, aLow, aHigh, bLow, bHigh);
    assert.ok(Buffer.from(memory).equals(expected), `${aLow}/${aHigh}/${bLow}/${bHigh}`);
    assert.equal(runtime.stackPointer.value, stack, 'stack');
    comparisons++;
  }
});
