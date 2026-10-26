import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createObjectLifecycleSlotHooks, functionIds} from '../source/game/client/object-lifecycle-slots.mjs';

let comparisons = 0;
after(() => console.log(
  `client object lifecycle slot oracle comparisons: ${comparisons} total; null records`));

const dependencies = [405, 895, 381, 413, 611, 900, 904, 543, 726, 646, 906, 728, 577, 1024, 1026, 460];
const argumentsFor = {2427: [0, 0], 2451: [0, 0], 2694: [0, 0], 901: [0, 0], 905: [0, 0], 923: [0, 0]};

test('object lifecycle slots match original results and memory', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createObjectLifecycleSlotHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    const args = argumentsFor[id] ?? [0];
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
