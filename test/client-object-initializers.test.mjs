import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createObjectInitializerHooks, functionIds} from '../source/game/client/object-initializers.mjs';

let comparisons = 0;
after(() => console.log(
  `client object initializer oracle comparisons: ${comparisons} total; parsers and descriptors`));

test('object initializers match original memory and traps', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, 909, 415, 983, 996, 402], construct: false,
  });
  const hooks = createObjectInitializerHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0xd10000;

  memory.set(clean);
  const expected1990 = runtime.call(1990);
  const expectedMemory1990 = Buffer.from(memory);
  memory.set(clean);
  const stack1990 = runtime.stackPointer.value;
  assert.equal(hooks[1990](), expected1990, '1990: result');
  assert.equal(runtime.stackPointer.value, stack1990, '1990: stack');
  assert.ok(Buffer.from(memory).equals(expectedMemory1990), '1990: memory');
  comparisons++;

  for (const id of functionIds) {
    if (id === 1990) continue;
    memory.set(clean);
    let expected;
    let expectedError = null;
    try {
      expected = id === 1023 ? runtime.call(id, record, 0) : runtime.call(id, record, 0, 0, 0);
    } catch (error) {
      expectedError = error;
    }
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    const stack = runtime.stackPointer.value;
    let actual;
    let actualError = null;
    try {
      actual = id === 1023 ? hooks[id](record, 0) : hooks[id](record, 0, 0, 0);
    } catch (error) {
      actualError = error;
    }
    assert.equal(actualError !== null, expectedError !== null, `${id}: trap`);
    if (actualError === null) assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 4);
});
