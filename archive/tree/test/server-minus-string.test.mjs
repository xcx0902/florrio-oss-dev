import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMinusStringHook, functionIds} from '../source/game/server/minus-string.mjs';

let comparisons = 0;
after(() => console.log(
  `server minus string oracle comparisons: ${comparisons} total; short and long sources`));

test('single-character string initializer matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 325], construct: false});
  const hook = createMinusStringHook(runtime)[326];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const string = 0x7c0000;

  for (const length of [0, 1, 5, 10]) {
    memory.set(clean);
    for (let index = 0; index < length; index++) memory[string + index] = 97 + index;
    memory[string + 11] = length;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(326, string, 0);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(string, 0);
    assert.equal(actual, undefined, `${length}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${length}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${length}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
