import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createIntToLongDoubleHook, functionIds} from '../source/game/server/int-to-long-double.mjs';

let comparisons = 0;
after(() => console.log(
  `server int to long double oracle comparisons: ${comparisons} total; signed values`));

test('signed long-double conversion matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 55], construct: false});
  const hook = createIntToLongDoubleHook(runtime)[72];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0xae0000;

  for (const value of [0, 1, 2, 3, 255, -1, -255, -2147483648]) {
    memory.set(clean);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(72, destination, value);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook(destination, value);
    assert.equal(runtime.stackPointer.value, stack, `${value}: stack`);
    const low = Math.max(0, stack - 32);
    assert.ok(Buffer.from(memory.subarray(0, low)).equals(expectedMemory.subarray(0, low)), `${value}: memory below stack`);
    assert.ok(Buffer.from(memory.subarray(stack)).equals(expectedMemory.subarray(stack)), `${value}: memory above stack`);
    comparisons++;
  }
  assert.ok(comparisons >= 8);
});
