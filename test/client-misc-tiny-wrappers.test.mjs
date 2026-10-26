import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMiscTinyWrapperHooks, functionIds} from '../source/game/client/misc-tiny-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `client misc tiny wrapper oracle comparisons: ${comparisons} total; fixtures`));

const dependencies = [423, 730, 912, 405, 664, 981, 675, 362, 585, 1];
const argumentsFor = {
  396: [0, 0], 725: [0, 0, 0], 844: [0], 892: [0, 0, 0], 912: [0, 0, 0],
  1974: [0], 2216: [0], 2217: [0], 2218: [0], 2219: [0],
  2291: [0, 0, 0, 0], 2292: [0, 0, 0, 0], 2486: [0], 2584: [],
  2614: [], 3245: [],
};

test('misc tiny wrappers match original results and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createMiscTinyWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    for (const flag of id === 2614 ? [0, 1] : [0]) {
      memory.set(clean);
      if (id === 2614) memory[379560] = flag;
      const args = argumentsFor[id];
      let expected;
      let expectedError = null;
      try {
        expected = runtime.call(id, ...args);
      } catch (error) {
        expectedError = error;
      }
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      if (id === 2614) memory[379560] = flag;
      const stack = runtime.stackPointer.value;
      let actual;
      let actualError = null;
      try {
        actual = hooks[id](...args);
      } catch (error) {
        actualError = error;
      }
      assert.equal(actualError !== null, expectedError !== null, `${id}/${flag}: trap`);
      if (actualError === null) assert.equal(actual, expected, `${id}/${flag}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${flag}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${flag}: memory`);
      comparisons++;
    }
  }
  assert.equal(comparisons, functionIds.length + 1);
});
