import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFrameWrapperHooks, functionIds} from '../source/game/server/frame-wrappers.mjs';

let comparisons = 0;
after(() => console.log(`server frame wrapper oracle comparisons: ${comparisons} total; non-stack memory`));

test('frame wrappers match original result and non-stack memory', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 99, 100], construct: false});
  const hooks = createFrameWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  

  for (const id of functionIds) {
    memory.set(clean);
    const start = runtime.stackPointer.value;
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(id, 0, 0, 0, 0, 0, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    let actual;
    let actualError = null;
    try {
      actual = hooks[id](0, 0, 0, 0, 0, 0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${id}: result`);
    const low = Math.max(0, start - 256);
    const high = Math.min(memory.length, start + 256);
    const actualBytes = Buffer.from(memory);
    assert.ok(actualBytes.subarray(0, low).equals(expectedMemory.subarray(0, low)), `${id}: low memory`);
    assert.ok(actualBytes.subarray(high).equals(expectedMemory.subarray(high)), `${id}: high memory`);
    comparisons++;
  }
  assert.equal(comparisons, 2);
});
