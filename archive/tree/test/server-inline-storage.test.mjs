import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createInlineStorageHook, functionIds} from '../source/game/server/inline-storage.mjs';

let comparisons = 0;
after(() => console.log(
  `server inline storage oracle comparisons: ${comparisons} total; inline and allocated paths`));

test('small-buffer storage selector matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 121, 20, 42], construct: false});
  const hook = createInlineStorageHook(runtime)[304];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x770000;

  for (const allocated of [0, 1]) {
    for (const count of [0, 1, 10, 30, 31, 40]) {
      memory.set(clean);
      memory[record + 128] = allocated;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(304, record, count);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hook(record, count);
      assert.equal(actual, expected, `${allocated}/${count}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${allocated}/${count}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${allocated}/${count}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 12);
});
