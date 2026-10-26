import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createBufferHelperHooks, functionIds} from '../source/game/client/buffer-helpers.mjs';

let comparisons = 0;
after(() => console.log(`client buffer helper oracle comparisons: ${comparisons} total`));

test('buffer helper matches original result and memory', async () => {
  const runtime = await loadOriginal('client', {
    functionIds: [...functionIds, 820, 406], construct: false,
    imports: {a: {Ga(pointer) {
      new DataView(runtime.memory.buffer).setUint32(pointer >>> 0, 0x0a0b0c0d, true);
      return 0;
    }}},
  });
  const hooks = createBufferHelperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  memory.set(clean);
  const stack = runtime.stackPointer.value;
  const expectedRandom = runtime.call(908);
  const expectedMemoryRandom = Buffer.from(memory);
  memory.set(clean);
  assert.equal(hooks[908](), expectedRandom, '908: result');
  assert.equal(runtime.stackPointer.value, stack, '908: stack');
  assert.ok(Buffer.from(memory).equals(expectedMemoryRandom), '908: memory');
  comparisons++;

  memory.set(clean);
  let expected;
  let expectedError = null;
  try {
    expected = runtime.call(706, 0, 0, 0, 0);
  } catch (error) {
    expectedError = error;
  }
  const expectedMemory = Buffer.from(memory);
  memory.set(clean);
  let actual;
  let actualError = null;
  try {
    actual = hooks[706](0, 0, 0, 0);
  } catch (error) {
    actualError = error;
  }
  assert.equal(actualError !== null, expectedError !== null, 'trap');
  if (actualError === null) assert.equal(actual, expected, 'result');
  assert.ok(Buffer.from(memory).equals(expectedMemory), 'memory');
  comparisons++;
  assert.equal(comparisons, 2);
});
