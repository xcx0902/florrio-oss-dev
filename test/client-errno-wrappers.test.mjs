import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createErrnoWrapperHooks, functionIds} from '../source/game/client/errno-wrappers.mjs';
import {createVectorHelperHooks, functionIds as vectorIds} from '../source/game/client/vector-helpers.mjs';

let comparisons = 0;
after(() => console.log(`client errno/vector oracle comparisons: ${comparisons} total`));

test('errno wrappers and vector accessor match original traps and memory', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, ...vectorIds, 488, 555, 543, 651, 744, 414, 406], construct: false,
  });
  const hooks = {...createErrnoWrapperHooks(runtime), ...createVectorHelperHooks(runtime)};
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of [...functionIds, ...vectorIds]) {
    memory.set(clean);
    const start = runtime.stackPointer.value;
    let expectedError = null;
    try {
      runtime.call(id, 0, 0, 0, 0, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    let actualError = null;
    try {
      hooks[id](0, 0, 0, 0, 0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    const bytes = Buffer.from(memory);
    const low = Math.max(0, start - 256);
    const high = Math.min(bytes.length, start + 256);
    assert.ok(bytes.subarray(0, low).equals(expectedMemory.subarray(0, low)), `${id}: low memory`);
    assert.ok(bytes.subarray(high).equals(expectedMemory.subarray(high)), `${id}: high memory`);
    comparisons++;
  }
  assert.equal(comparisons, 5);
});
