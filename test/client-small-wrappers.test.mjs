import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSmallWrapperHooks, functionIds} from '../source/game/client/small-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `client small wrapper oracle comparisons: ${comparisons} total; full and non-stack memory`));

test('small wrappers match original result or trap', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, 555, 744, 927, 577, 630], construct: false,
  });
  const hooks = createSmallWrapperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const framed = new Set([390, 412, 896, 998]);

  for (const id of functionIds) {
    memory.set(clean);
    const start = runtime.stackPointer.value;
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(id, 0, 0, 0, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    let actual;
    let actualError = null;
    try {
      actual = hooks[id](0, 0, 0, 0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${id}: result`);
    const bytes = Buffer.from(memory);
    if (framed.has(id)) {
      const low = Math.max(0, start - 256);
      const high = Math.min(bytes.length, start + 256);
      assert.ok(bytes.subarray(0, low).equals(expectedMemory.subarray(0, low)), `${id}: low memory`);
      assert.ok(bytes.subarray(high).equals(expectedMemory.subarray(high)), `${id}: high memory`);
    } else {
      assert.ok(bytes.equals(expectedMemory), `${id}: memory`);
    }
    comparisons++;
  }
  assert.equal(comparisons, 4);
});
