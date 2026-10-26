import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createCleanupAndConfigHooks, functionIds} from '../source/game/client/cleanup-and-config.mjs';

let comparisons = 0;
after(() => console.log(
  `client cleanup/config oracle comparisons: ${comparisons} total; registries and descriptors`));

test('cleanup and configuration helpers match original memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 400, 416, 364, 92], construct: false});
  const hooks = createCleanupAndConfigHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const descriptor = 0xd30000;

  for (const id of functionIds) {
    memory.set(clean);
    let expected;
    let expectedError = null;
    try {
      expected = id === 2040 ? runtime.call(id, 0, 0, descriptor) : runtime.call(id, 0, 0, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    const stack = runtime.stackPointer.value;
    let actual;
    let actualError = null;
    try {
      actual = id === 2040 ? hooks[id](0, 0, descriptor) : hooks[id](0, 0, 0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 5);
});
