import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringResizeHook, functionIds} from '../source/game/server/string-resize.mjs';

let comparisons = 0;
after(() => console.log(
  `server string resize oracle comparisons: ${comparisons} total; grow, shrink and unchanged`));

test('string resize matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 325], construct: false});
  const hook = createStringResizeHook(runtime)[387];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const string = 0x7f0000;

  for (const current of [0, 3, 7, 10]) {
    for (const target of [0, 2, 5, 10]) {
      memory.set(clean);
      for (let index = 0; index < current; index++) memory[string + index] = 65 + index;
      memory[string + 11] = current;
      memory[string + current] = 0;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(387, string, target);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hook(string, target);
      assert.equal(runtime.stackPointer.value, stack, `${current}/${target}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${current}/${target}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 16);
});
