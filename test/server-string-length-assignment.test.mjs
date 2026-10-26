import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringLengthAssignmentHook, functionIds} from '../source/game/server/string-length-assignment.mjs';

let comparisons = 0;
after(() => console.log(
  `server string length assignment oracle comparisons: ${comparisons} total; inline and heap`));

test('string assignment from bytes matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 20, 75], construct: false});
  const hook = createStringLengthAssignmentHook(runtime)[269];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x6d0000;
  const text = 0x6d2000;

  for (const length of [0, 1, 5, 9, 10, 11, 16, 17, 22, 31, 32, 40, 80]) {
    memory.set(clean);
    for (let index = 0; index < length; index++) memory[text + index] = 97 + (index % 26);
    memory[text + length] = 0;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(269, destination, text, length);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(destination, text, length);
    assert.equal(actual, expected, `${length}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${length}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${length}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 13);
});
