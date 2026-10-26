import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRandomStateHook, functionIds, RANDOM_ENABLED} from '../source/game/server/random-state.mjs';

let comparisons = 0;
after(() => console.log(
  `server random-state oracle comparisons: ${comparisons} total; `
  + 'enabled/disabled draws across the circular state'));

test('312-word random generator 203 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createRandomStateHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const state = 0x400000;
  assert.equal(hook[203].length, runtime.exports.__fn203.length);
  let seed = 0x12345678;
  for (let index = 0; index < 312; index++) {
    view.setBigUint64(state + index * 8, BigInt((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0)) << 32n | BigInt(index), true);
  }
  for (const enabled of [0, 1]) {
    view.setUint8(RANDOM_ENABLED, enabled);
    for (const index of [0, 1, 2, 155, 156, 157, 310, 311]) {
      view.setUint32(state + 2496, index, true);
      const before = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(203, state);
      const expectedMemory = Buffer.from(memory);
      memory.set(before);
      runtime.stackPointer.value = stack;
      const actual = hook[203](state);
      assert.equal(actual, expected, `${enabled}/${index}: result`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${enabled}/${index}: memory`);
      assert.equal(runtime.stackPointer.value, stack, `${index}: stack`);
      comparisons++;
    }
  }
});
