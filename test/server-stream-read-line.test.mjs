import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamReadLineHook, functionIds} from '../source/game/server/stream-read-line.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream read line oracle comparisons: ${comparisons} total; buffered text`));

test('buffered line read matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 378], construct: false});
  const hook = createStreamReadLineHook(runtime)[613];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const state = 0xa70000;
  const bufferStart = 0xa71000;
  const destination = 0xa72000;

  for (const [text, count] of [['hello', 10], ['hello', 3], ['', 8], ['abcdefgh', 4]]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    for (let index = 0; index < text.length; index++) memory[bufferStart + index] = text.charCodeAt(index);
    memory[bufferStart + text.length] = 0;
    view.setUint32(state + 84, bufferStart, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(613, state, destination, count);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(state, destination, count);
    assert.equal(actual, expected, `${text}/${count}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${text}/${count}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${text}/${count}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
