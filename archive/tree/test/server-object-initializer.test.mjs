import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createObjectInitializerHook, functionIds} from '../source/game/server/object-initializer.mjs';

let comparisons = 0;
after(() => console.log(
  `server object initializer oracle comparisons: ${comparisons} total; zeroed headers`));

test('object initializer matches original', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, 121, 239, 242, 259],
    construct: false,
  });
  const hook = createObjectInitializerHook(runtime)[185];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const base = runtime.call(121, 768);
  const record = base + 256;

  for (const fill of [0, 0xff]) {
    memory.set(clean);
    memory.fill(fill, base, base + 768);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    let expected;
    let expectedError = null;
    try {
      expected = runtime.call(185, record);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    let actual;
    let actualError = null;
    try {
      actual = hook(record);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${fill}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${fill}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${fill}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${fill}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
