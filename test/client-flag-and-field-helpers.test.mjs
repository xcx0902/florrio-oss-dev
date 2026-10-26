import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFlagAndFieldHelperHooks, functionIds} from '../source/game/client/flag-and-field-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `client flag/field helper oracle comparisons: ${comparisons} total; zero fixtures`));

const dependencies = [820, 899, 517, 383, 364];
const argumentsFor = {435: [0, 0, 0], 856: [0, 0], 1992: [0, 0, 0], 2023: [0, 0], 2031: [0]};

test('flag and field helpers match original results and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createFlagAndFieldHelperHooks(runtime);
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
