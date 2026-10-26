import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRangeCopyHook, functionIds} from '../source/game/server/range-copy.mjs';

let comparisons = 0;
after(() => console.log(
  `server range copy oracle comparisons: ${comparisons} total; lengths`));

test('range copy matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 261], construct: false});
  const hook = createRangeCopyHook(runtime)[174];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const start = 0xa60000;
  const destination = 0xa61000;

  for (const length of [0, 1, 5, 16]) {
    memory.set(clean);
    for (let index = 0; index < 32; index++) memory[start + index] = index + 1;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(174, start, start + length, destination);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(start, start + length, destination);
    assert.equal(actual, expected, `${length}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${length}: stack`);
    const low = Math.max(0, stack - 64);
    assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${length}: memory below stack`);
    assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)), `${length}: memory above stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
