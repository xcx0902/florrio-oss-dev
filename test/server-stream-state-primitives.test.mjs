import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamStatePrimitiveHooks, functionIds} from '../source/game/server/stream-state-primitives.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream state primitive oracle comparisons: ${comparisons} total; reset and peek`));

test('stream state primitives match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createStreamStatePrimitiveHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const state = 0x850000;
  const area = 0x851000;

  for (const flags of [0, 8, 15]) {
    for (const value of [0, 1, 5, 255]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(state, flags, true);
      view.setUint8(state + 74, value);
      view.setUint32(state + 44, area, true);
      view.setUint32(state + 48, 16, true);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(430, state);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[430](state);
      assert.equal(actual, expected, `430/${flags}/${value}: result`);
      assert.equal(runtime.stackPointer.value, stack, `430/${flags}/${value}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `430/${flags}/${value}: memory`);
      comparisons++;
    }
  }

  for (const flags of [0, 8]) {
    for (const put of [0, 8, 20]) {
      for (const read of [-4, 0, 4, 8]) {
        memory.set(clean);
        const view = new DataView(runtime.memory.buffer);
        view.setUint8(state + 48, flags);
        view.setUint32(state + 44, area + put, true);
        view.setUint32(state + 24, area + 2, true);
        view.setUint32(state + 12, area + 8, true);
        view.setUint32(state + 16, area + read >>> 0, true);
        memory[area + 9] = 0x5a;
        const setup = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(625, state);
        const expectedMemory = Buffer.from(memory);
        memory.set(setup);
        runtime.stackPointer.value = stack;
        const actual = hooks[625](state);
        assert.equal(actual, expected, `625/${flags}/${put}/${read}: result`);
        assert.equal(runtime.stackPointer.value, stack, `625/${flags}/${put}/${read}: stack`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `625/${flags}/${put}/${read}: memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 24);
});
