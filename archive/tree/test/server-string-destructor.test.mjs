import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringDestructorHook, functionIds} from '../source/game/server/string-destructor.mjs';

let comparisons = 0;
after(() => console.log(
  `server string destructor oracle comparisons: ${comparisons} total; short and long strings`));

test('string destructor matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 269, 355], construct: false});
  const hook = createStringDestructorHook(runtime)[37];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const string = 0x780000;
  const text = 0x781000;

  for (const length of [0, 1, 5, 10, 11, 22, 40]) {
    memory.set(clean);
    for (let index = 0; index < length; index++) memory[text + index] = 97 + (index % 26);
    memory[text + length] = 0;
    if (length <= 10) {
      for (let index = 0; index < length; index++) memory[string + index] = memory[text + index];
      memory[string + 11] = length;
    } else {
      runtime.call(269, string, text, length);
    }
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(37, string);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(string);
    assert.equal(actual, expected, `${length}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${length}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${length}: memory`);
    comparisons++;
  }

  assert.ok(comparisons >= 7);
});
