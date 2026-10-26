import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamGetCharHook, functionIds} from '../source/game/server/stream-get-char.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream get char oracle comparisons: ${comparisons} total; peeked bytes`));

test('character fetch matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createStreamGetCharHook(runtime)[633];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const state = 0x9c0000;
  const vtable = 0x9c1000;
  const area = 0x9c2000;

  for (const value of [0, 65, 255]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(state, vtable, true);
    view.setUint32(state + 8, 65, true);
    view.setUint32(state + 12, area, true);
    view.setUint32(vtable + 36, 315, true);
    memory[area] = value;
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(633, state);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(state);
    assert.equal(actual, expected, `${value}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${value}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${value}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
