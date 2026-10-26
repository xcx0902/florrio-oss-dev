import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSlotAllocatorHooks, functionIds} from '../source/game/client/slot-allocators.mjs';

let comparisons = 0;
after(() => console.log(
  `client slot allocator oracle comparisons: ${comparisons} total; slot, index and overflow paths`));

test('slot allocator matches original result, memory and traps', async () => {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 371, 406], construct: false});
  const hooks = createSlotAllocatorHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const slot = 0xc80000;

  for (const count of [0, 5, 30, 31]) {
    memory.set(clean);
    const expected = runtime.call(846, slot, count);
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    const actual = hooks[846](slot, count);
    assert.equal(actual, expected, `${count}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${count}: memory`);
    comparisons++;
  }

  for (const count of [0, 1, 4]) {
    memory.set(clean);
    const expected = runtime.call(542, count);
    const expectedMemory = Buffer.from(memory);
    memory.set(clean);
    const actual = hooks[542](count);
    assert.equal(actual, expected, `542/${count}: pointer`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `542/${count}: memory`);
    comparisons++;
  }

  memory.set(clean);
  let expectedError = null;
  try {
    runtime.call(542, 0x40000000);
  } catch (error) {
    expectedError = error;
  }
  memory.set(clean);
  let actualError = null;
  try {
    hooks[542](0x40000000);
  } catch (error) {
    actualError = error;
  }
  assert.equal(actualError !== null, expectedError !== null, '542/overflow: trap');
  comparisons++;
  assert.equal(comparisons, 8);
});
