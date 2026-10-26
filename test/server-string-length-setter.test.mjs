import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringLengthSetterHook, functionIds} from '../source/game/server/string-length-setter.mjs';

let comparisons = 0;
after(() => console.log(
  `server string length setter oracle comparisons: ${comparisons} total; forwarded resize paths`));

test('string length setter matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 387], construct: false});
  const hook = createStringLengthSetterHook(runtime)[23];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const string = 0x800000;

  for (const current of [0, 4, 9, 10]) {
    for (const target of [0, 3, 8, 10]) {
      memory.set(clean);
      for (let index = 0; index < current; index++) memory[string + index] = 97 + index;
      memory[string + 11] = current;
      memory[string + current] = 0;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(23, string, target);
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
