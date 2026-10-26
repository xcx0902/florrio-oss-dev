import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMemoryFillHook, functionIds} from '../source/game/server/memory-fill.mjs';

let comparisons = 0;
after(() => console.log(
  `server memory fill oracle comparisons: ${comparisons} total; counts and bytes`));

test('memory fill matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createMemoryFillHook(runtime)[325];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const destination = 0x980000;

  for (const count of [0, 1, 5]) {
    for (const value of [0, 65, 0x1ff]) {
      memory.set(clean);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(325, destination, count, value);
      const expectedMemory = Buffer.from(memory);
      memory.set(clean);
      runtime.stackPointer.value = stack;
      const actual = hook(destination, count, value);
      assert.equal(actual, expected, `${count}/${value}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${count}/${value}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${count}/${value}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 9);
});
