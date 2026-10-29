import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamFlagUpdateHook, functionIds} from '../source/game/server/stream-flag-update.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream flag update oracle comparisons: ${comparisons} total; flag masks`));

test('stream flag update matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 386], construct: false});
  const hook = createStreamFlagUpdateHook(runtime)[240];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const state = 0x940000;

  for (const [current, incoming] of [[0, 0], [4, 1], [1, 6]]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(state + 16, current, true);
    view.setUint32(state + 20, 0, true);
    view.setUint32(state + 24, 0, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(240, state, incoming);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook(state, incoming);
    assert.equal(runtime.stackPointer.value, stack, `${current}/${incoming}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${current}/${incoming}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
