import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFloatFieldSetterHooks, functionIds} from '../source/game/client/float-field-setters.mjs';

let comparisons = 0;
after(() => console.log(
  `client float field setter oracle comparisons: ${comparisons} total; default, parsed and joined values`));

test('float field setters match original result and memory', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 810, 984, 731], construct: false});
  const hooks = createFloatFieldSetterHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0xca0000;
  const text = 0xca1000;

  for (const id of [2306, 2307]) {
    for (const value of [null, '1.5']) {
      memory.set(clean);
      let pointer = 0;
      if (value !== null) {
        pointer = text;
        memory.set(Buffer.from(`${value}\0`), text);
      }
      runtime.call(id, record, 0, 0, pointer);
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      if (value !== null) memory.set(Buffer.from(`${value}\0`), text);
      hooks[id](record, 0, 0, pointer);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${value}: memory`);
      comparisons++;
    }
  }

  for (const [high, low] of [[0x3ff00000, 0], [0x40000000, 0]]) {
    memory.set(clean);
    const cursor = 0xca2000;
    new DataView(runtime.memory.buffer).setUint32(cursor, 3, true);
    new DataView(runtime.memory.buffer).setUint32(cursor + 16, high, true);
    new DataView(runtime.memory.buffer).setUint32(cursor + 20, low, true);
    runtime.call(1982, record, cursor);
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    new DataView(runtime.memory.buffer).setUint32(cursor, 3, true);
    new DataView(runtime.memory.buffer).setUint32(cursor + 16, high, true);
    new DataView(runtime.memory.buffer).setUint32(cursor + 20, low, true);
    hooks[1982](record, cursor);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `1982/${high}: memory`);
    comparisons++;
  }

  memory.set(clean);
  let expected;
  let expectedError = null;
  try {
    expected = runtime.call(772, 0, 0);
  } catch (error) {
    expectedError = error;
  }
  const expectedFrame = Buffer.from(memory.subarray(runtime.stackPointer.value - 16, runtime.stackPointer.value));
  memory.set(clean);
  const stack = runtime.stackPointer.value;
  let actual;
  let actualError = null;
  try {
    actual = hooks[772](0, 0);
  } catch (error) {
    actualError = error;
  }
  assert.equal(actualError !== null, expectedError !== null, '772: trap');
  if (actualError === null) assert.equal(actual, expected, '772: value');
  assert.equal(runtime.stackPointer.value, stack, '772: stack');
  assert.ok(Buffer.from(memory.subarray(stack - 16, stack))
    .equals(expectedFrame), '772: frame');
  comparisons++;
  assert.equal(comparisons, 7);
});
