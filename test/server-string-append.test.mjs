import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringAppendHook, functionIds} from '../source/game/server/string-append.mjs';

let comparisons = 0;
after(() => console.log(
  `server string append oracle comparisons: ${comparisons} total; short and long buffers`));

test('string append matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 75, 173], construct: false});
  const hook = createStringAppendHook(runtime)[317];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const string = 0x7b0000;
  const text = 0x7b1000;
  const data = 0x7b2000;

  for (const length of [0, 1, 3, 6]) {
    for (const append of [0, 1, 4]) {
      memory.set(clean);
      for (let index = 0; index < length; index++) memory[string + index] = 65 + (index % 26);
      memory[string + 11] = length;
      for (let index = 0; index < append; index++) memory[data + index] = 97 + (index % 26);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(317, string, data, append);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hook(string, data, append);
      assert.equal(actual, undefined, `${length}/${append}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${length}/${append}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${length}/${append}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 12);
});
