import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createClientSmallAccessorHooks, functionIds} from '../source/game/client/small-accessors.mjs';

let comparisons = 0;
after(() => console.log(
  `client small accessor oracle comparisons: ${comparisons} total; zero records`));

const dependencies = [899, 903, 901, 905, 518, 1019, 772, 726, 646, 1091, 383];
const argumentsFor = {
  424: [0], 425: [0], 445: [0, 0], 446: [0, 0], 567: [0], 569: [0],
  854: [0], 855: [0], 859: [0], 860: [0], 910: [0], 984: [0],
  1947: [0], 1948: [0], 2051: [0], 2068: [0, 0],
};

test('small accessors match original results and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createClientSmallAccessorHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
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
    const stack = runtime.stackPointer.value;
    let actual;
    let actualError = null;
    try {
      actual = hooks[id](...args);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, functionIds.length);
});
