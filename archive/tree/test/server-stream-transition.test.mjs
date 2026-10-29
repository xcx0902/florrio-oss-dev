import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamTransitionHook, functionIds} from '../source/game/server/stream-transition.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream transition oracle comparisons: ${comparisons} total; current/pending combinations`));

test('stream transition matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createStreamTransitionHook(runtime)[221];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = 0x6f0000;

  for (const current of [0, 5, 7]) {
    for (const value of [5, 7, 9]) {
      for (const mode of [0, 1, 2, 3]) {
        memory.set(clean);
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(base + 16, current, true);
        view.setUint32(base + 24, mode, true);
        view.setUint32(base + 36, 4, true);
        view.setUint8(base + 54, 0);
        const setup = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(221, base, value, 8);
        const expectedMemory = Buffer.from(memory);
        memory.set(setup);
        runtime.stackPointer.value = stack;
        const actual = hook(base, value, 8);
        assert.equal(actual, expected, `${current}/${value}/${mode}: result`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `${current}/${value}/${mode}: memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 36);
});
