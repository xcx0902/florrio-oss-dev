import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createArrayAndVtableDestructorHooks, functionIds} from '../source/game/client/array-and-vtable-destructors.mjs';

let comparisons = 0;
after(() => console.log(
  `client array/vtable destructor oracle comparisons: ${comparisons} total; counts and handles`));

test('array and vtable destructors match original memory and traps', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, 620, 550, 362], construct: false,
  });
  const hooks = createArrayAndVtableDestructorHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const counts = {2570: 7891808, 2601: 7910640, 2562: 7791368};

  for (const id of functionIds) {
    const fixtures = counts[id] === undefined || counts[id] === 7791368 ? [0] : [0, 1];
    for (const count of fixtures) {
      memory.set(clean);
      if (counts[id] !== undefined) memory[counts[id]] = count;
      let expected;
      let expectedError = null;
      try {
        expected = runtime.call(id, 0);
      } catch (error) {
        expectedError = error;
      }
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      if (counts[id] !== undefined) memory[counts[id]] = count;
      const stack = runtime.stackPointer.value;
      let actual;
      let actualError = null;
      try {
        actual = hooks[id](0);
      } catch (error) {
        actualError = error;
      }
      assert.equal(actualError !== null, expectedError !== null, `${id}/${count}: trap`);
      if (actualError === null) assert.equal(actual, expected, `${id}/${count}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${count}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${count}: memory`);
      comparisons++;
    }
  }
  assert.equal(comparisons, 9);
});
