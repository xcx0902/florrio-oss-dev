import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAbiLeafHelperHooks, functionIds} from '../source/game/server/abi-leaf-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `server ABI leaf helper oracle comparisons: ${comparisons} total; constants, accessors and stores`));

const calls = {
  76: [], 108: [0x610000], 175: [], 176: [], 224: [0, 0, 7, 0, 0x610100],
  270: [0x610000], 293: [0, 5], 294: [0, 0, 0, 0, 0x610120, 9, 0, 0x610140],
  298: [], 335: [], 370: [], 429: [], 449: [], 450: [], 453: [0, 11, 22],
  462: [0, 5, 99], 466: [0, 3], 468: [0, 3], 493: [0x610000], 494: [0x610000],
  604: [0x610000], 627: [0x610000], 635: [], 637: [0x610000],
  638: [0x610000, 0, 0n, 0, 0], 639: [0x610000], 729: [], 730: [], 735: [0x610000], 736: [],
};

test('ABI leaf helpers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createAbiLeafHelperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  assert.equal(functionIds.length, 30);

  for (const id of functionIds) {
    for (let trial = 0; trial < 3; trial++) {
      memory.set(clean);
      for (let offset = 0x610000; offset < 0x610200; offset++) {
        memory[offset] = (id * 31 + trial * 17 + offset) & 0xff;
      }
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expectedError = (() => {
        try { return {value: runtime.call(id, ...calls[id]), error: null}; }
        catch (error) { return {value: undefined, error}; }
      })();
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actualError = (() => {
        try { return {value: hooks[id](...calls[id]), error: null}; }
        catch (error) { return {value: undefined, error}; }
      })();
      if (expectedError.error) assert.equal(actualError.error?.constructor, expectedError.error.constructor, `${id}/${trial}: trap`);
      else assert.ok(Object.is(actualError.value, expectedError.value), `${id}/${trial}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${trial}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${trial}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 90);
});
