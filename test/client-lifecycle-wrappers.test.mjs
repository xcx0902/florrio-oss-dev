import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLifecycleWrapperHooks, functionIds} from '../source/game/client/lifecycle-wrappers.mjs';

let comparisons = 0;
after(() => console.log(
  `client lifecycle wrapper oracle comparisons: ${comparisons} total; forwarded calls`));

const dependencies = [1090, 901, 905, 518, 630, 792, 795, 797, 687, 1114, 1, 406];
const argumentsFor = {
  387: [0, 0], 428: [0, 0], 429: [0, 0], 451: [0], 456: [0],
  2383: [], 2387: [], 2556: [], 2560: [], 2567: [], 2611: [], 2690: [],
  398: [], 406: [],
};

test('lifecycle wrappers match original calls and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createLifecycleWrapperHooks(runtime);
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
