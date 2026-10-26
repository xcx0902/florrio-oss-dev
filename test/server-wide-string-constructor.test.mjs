import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createWideStringConstructorHook, functionIds} from '../source/game/server/wide-string-constructor.mjs';

let comparisons = 0;
after(() => console.log(
  `server wide-string constructor oracle comparisons: ${comparisons} total; inline and heap`));

test('wide-string C-string constructor matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 354, 121, 112, 58], construct: false});
  const hook = createWideStringConstructorHook(runtime)[131];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x6e0000;
  const text = 0x6e2000;

  for (const length of [0, 1, 2, 3, 5, 10, 20, 40]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    for (let index = 0; index < length; index++) view.setUint32(text + index * 4, 0x1f600 + index, true);
    view.setUint32(text + length * 4, 0, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(131, destination, text);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(destination, text);
    assert.equal(actual, expected, `${length}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${length}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${length}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 8);
});
