import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createClientStringUtilityHooks, functionIds} from '../source/game/client/string-utils.mjs';

let comparisons = 0;
after(() => console.log(
  `client string utility oracle comparisons: ${comparisons} total; inline and long storage`));

const dependencies = [727, 673, 470, 472, 371, 398];

test('string utilities match original results and memory', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createClientStringUtilityHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0xc60000;
  const source = 0xc61000;

  memory.set(clean);
  let expected;
  let expectedError = null;
  try {
    expected = runtime.call(646, 0);
  } catch (error) {
    expectedError = error;
  }
  const expectedMemory = Buffer.from(memory);
  memory.set(clean);
  const stack = runtime.stackPointer.value;
  let actual;
  let actualError = null;
  try {
    actual = hooks[646](0);
  } catch (error) {
    actualError = error;
  }
  assert.equal(actualError !== null, expectedError !== null, '646: trap');
  if (actualError === null) assert.equal(actual, expected, '646: result');
  assert.equal(runtime.stackPointer.value, stack, '646: stack');
  assert.ok(Buffer.from(memory).equals(expectedMemory), '646: memory');
  comparisons++;

  for (const length of [0, 5, 10]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    for (let index = 0; index < 8; index++) memory[source + index] = 97 + index;
    view.setUint32(source + 8, 0x11223344, true);
    memory[source + 11] = length;
    runtime.call(718, destination, source);
    const nativeMemory = Buffer.from(memory);
    memory.set(clean);
    for (let index = 0; index < 8; index++) memory[source + index] = 97 + index;
    new DataView(runtime.memory.buffer).setUint32(source + 8, 0x11223344, true);
    memory[source + 11] = length;
    hooks[718](destination, source);
    assert.ok(Buffer.from(memory).equals(nativeMemory), `${length}: memory`);
    comparisons++;
  }

  const native = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const recovered = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const recoveredHooks = createClientStringUtilityHooks(recovered);
  const cleanNative = Buffer.from(new Uint8Array(native.memory.buffer));
  const cleanRecovered = Buffer.from(new Uint8Array(recovered.memory.buffer));
  for (const length of [11, 20]) {
    new Uint8Array(native.memory.buffer).set(cleanNative);
    new Uint8Array(recovered.memory.buffer).set(cleanRecovered);
    for (let index = 0; index < length; index++) {
      new Uint8Array(native.memory.buffer)[source + index] = 65 + (index % 26);
      new Uint8Array(recovered.memory.buffer)[source + index] = 65 + (index % 26);
    }
    native.call(470, destination, source, length);
    recoveredHooks[470](destination, source, length);
    assert.ok(Buffer.from(new Uint8Array(recovered.memory.buffer))
      .equals(Buffer.from(new Uint8Array(native.memory.buffer))), `${length}: long memory`);
    native.call(718, 0xc62000, destination);
    recoveredHooks[718](0xc62000, destination);
    assert.ok(Buffer.from(new Uint8Array(recovered.memory.buffer))
      .equals(Buffer.from(new Uint8Array(native.memory.buffer))), `${length}: copy memory`);
    comparisons += 2;
  }
  assert.equal(comparisons, 8);
});
