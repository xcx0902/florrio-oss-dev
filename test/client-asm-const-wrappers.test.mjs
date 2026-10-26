import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAsmConstWrapperHooks, functionIds} from '../source/game/client/asm-const-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `client asm-const wrapper oracle comparisons: ${comparisons} total; live and disabled slots`));

test('asm-const wrappers match original memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds], construct: false});
  const hooks = createAsmConstWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const addresses = {
    2396: 386800, 2489: 7910248, 2586: 7919340, 2593: 7922284,
    2594: 7922276, 2672: 440004, 3863: 7932276, 4142: 7932284,
    4175: 7932292, 4240: 7932268, 4451: 7932300, 4524: 7932308,
    2495: 7932344, 2496: 7932324,
  };
  const enableFlags = {2495: 7932348, 2496: 7932328};

  for (const id of functionIds) {
    for (const value of [0, 7, 0xffffffff]) {
      memory.set(clean);
      new DataView(runtime.memory.buffer).setUint32(addresses[id], value, true);
      if (enableFlags[id] !== undefined) new DataView(runtime.memory.buffer).setUint8(enableFlags[id], 1);
      let expectedError = null;
      try {
        runtime.call(id, 0);
      } catch (error) {
        expectedError = error;
      }
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      new DataView(runtime.memory.buffer).setUint32(addresses[id], value, true);
      if (enableFlags[id] !== undefined) new DataView(runtime.memory.buffer).setUint8(enableFlags[id], 1);
      let actualError = null;
      try {
        hooks[id](0);
      } catch (error) {
        actualError = error;
      }
      assert.equal(actualError !== null, expectedError !== null, `${id}/${value}: trap`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${value}: memory`);
      comparisons++;
    }
  }
  assert.equal(comparisons, functionIds.length * 3);
});
