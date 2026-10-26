import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAllocateZeroedArrayHook, functionIds, dependencyIds} from '../source/game/client/allocate-zeroed-array.mjs';

let comparisons = 0;
after(() => console.log(
  `client allocateZeroedArray 1764 oracle comparisons: ${comparisons} total (0 trapping); `
  + 'zero counts, truncation threshold, 64-bit overflow and zero-fill'));

const CASES = [
  [0, 0], [0, 64], [1, 1], [3, 17], [64, 512], [4096, 8],
  [65535, 1], [65536, 1], [1, 65536], [65536, 65536],
  [0xffffffff, 0xffffffff], [0x100000, 2],
];

test('allocateZeroedArray 1764 matches the original', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, ...dependencyIds], construct: false});
  const hooks = createAllocateZeroedArrayHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  assert.equal(hooks[1764].length, runtime.exports.__fn1764.length);
  for (const [count, elementSize] of CASES) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    const expected = runtime.call(1764, count, elementSize);
    const expectedMemory = Buffer.from(bytes);
    bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = hooks[1764](count, elementSize);
    assert.equal(actual >>> 0, expected >>> 0, `${count}x${elementSize}: block`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${count}x${elementSize}: complete memory`);
    assert.equal(runtime.stackPointer.value, stack, `${count}x${elementSize}: stack`);
    comparisons++;
  }
});
