import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLogWrapperHooks, functionIds} from '../source/game/client/log-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `client log wrapper oracle comparisons: ${comparisons} total; frame spills`));

test('log wrappers match original memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 927, 749], construct: false});
  const hooks = createLogWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    for (const [kind, value] of [[0, 0], [1, 7]]) {
      memory.set(clean);
      let expectedError = null;
      try {
        runtime.call(id, kind, value);
      } catch (error) {
        expectedError = error;
      }
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      const stack = runtime.stackPointer.value;
      let actualError = null;
      try {
        hooks[id](kind, value);
      } catch (error) {
        actualError = error;
      }
      assert.equal(actualError !== null, expectedError !== null, `${id}/${kind}: trap`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${kind}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${kind}: memory`);
      comparisons++;
    }
  }
  assert.equal(comparisons, functionIds.length * 2);
});
