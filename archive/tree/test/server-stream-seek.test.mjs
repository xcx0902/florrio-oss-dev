import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamSeekHook, functionIds} from '../source/game/server/stream-seek.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream seek oracle comparisons: ${comparisons} total; directions, flags and bounds`));

test('stream seek matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createStreamSeekHook(runtime)[622];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const result = 0x710000;
  const state = 0x711000;
  const string = 0x712000;
  const data = 0x713000;

  for (const current of [0, 5, 10]) {
    for (const direction of [0, 1, 2, 3]) {
      for (const flags of [0, 8, 16, 24]) {
        for (const offset of [-10n, -2n, 0n, 3n, 8n]) {
          memory.set(clean);
          const view = new DataView(runtime.memory.buffer);
          view.setUint32(string, data, true);
          view.setUint32(string + 8, 15 | 0x80000000, true);
          view.setUint32(state + 8, 1, true);
          view.setUint32(state + 12, 1 + current, true);
          view.setUint32(state + 16, 0, true);
          view.setUint32(state + 20, 1, true);
          view.setUint32(state + 24, 1 + current, true);
          view.setUint32(state + 32, data, true);
          view.setUint32(state + 36, 15, true);
          view.setUint32(state + 40, 15 | 0x80000000, true);
          view.setUint32(state + 44, data + current, true);
          const setup = Buffer.from(memory);
          const stack = runtime.stackPointer.value;
          runtime.call(622, result, state, offset, direction, flags);
          const expectedMemory = Buffer.from(memory);
          memory.set(setup);
          runtime.stackPointer.value = stack;
          hook(result, state, offset, direction, flags);
          assert.ok(Buffer.from(memory).equals(expectedMemory),
            `${current}/${direction}/${flags}/${offset}: memory`);
          comparisons++;
        }
      }
    }
  }
  assert.ok(comparisons >= 200);
});
