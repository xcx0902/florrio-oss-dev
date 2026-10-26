import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamWriteCopyHook, functionIds} from '../source/game/server/stream-write-copy.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream write copy oracle comparisons: ${comparisons} total; clamped copies`));

test('buffered copy writer matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createStreamWriteCopyHook(runtime)[647];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const state = 0x9e0000;
  const area = 0x9e1000;
  const source = 0x9e2000;

  for (const count of [0, 3, 8, 12]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(state + 16, area + 8, true);
    view.setUint32(state + 20, area, true);
    for (let index = 0; index < 16; index++) memory[source + index] = 65 + index;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(647, state, source, count);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(state, source, count);
    assert.equal(actual, expected, `${count}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${count}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${count}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
