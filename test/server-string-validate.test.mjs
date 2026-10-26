import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringValidateHook, functionIds} from '../source/game/server/string-validate.mjs';

let comparisons = 0;
after(() => console.log(
  `server string validation oracle comparisons: ${comparisons} total; null and text`));

test('string validation wrapper matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 295], construct: false});
  const hook = createStringValidateHook(runtime)[475];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x8f0000;
  const text = 0x8f1000;

  for (const length of [-1, 0, 3, 5]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(record + 8, length < 0 ? 0 : text, true);
    for (let index = 0; index < Math.max(length, 0); index++) memory[text + index] = 65 + index;
    if (length >= 0) memory[text + length] = 0;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(475, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(record);
    assert.equal(actual, expected, `${length}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${length}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${length}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
