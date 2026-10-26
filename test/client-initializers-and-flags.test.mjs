import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createInitializerAndFlagHooks, functionIds} from '../source/game/client/initializers-and-flags.mjs';

let comparisons = 0;
after(() => console.log(
  `client initializer/flag oracle comparisons: ${comparisons} total; zero records`));

const dependencies = [377, 899, 902, 406, 909];
const argumentsFor = {559: [0], 862: [0, 0], 898: [0, 0], 1019: [0, 0], 1022: [0]};

test('initializer and flag slots match original results and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createInitializerAndFlagHooks(runtime);
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
