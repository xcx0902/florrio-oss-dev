import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createErrnoCategoryHook, functionIds} from '../source/game/server/errno-category.mjs';

let comparisons = 0;
after(() => console.log(
  `server errno category oracle comparisons: ${comparisons} total; errno values`));

test('errno category query matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 82], construct: false});
  const hook = createErrnoCategoryHook(runtime)[295];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const value of [0, 5, -1]) {
    memory.set(clean);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(295, value);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(value);
    assert.equal(actual, expected, `${value}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${value}: stack`);
    const low = Math.max(0, stack - 32);
    assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${value}: below stack`);
    assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)), `${value}: above stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
