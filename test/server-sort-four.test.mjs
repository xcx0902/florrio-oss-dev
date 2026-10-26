import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createSortFourHook, functionIds} from '../source/game/server/sort-four.mjs';

let comparisons = 0;
after(() => console.log(
  `server sort four oracle comparisons: ${comparisons} total; orderings`));

test('four-element ordering matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 137], construct: false});
  const hook = createSortFourHook(runtime)[244];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const cells = 0xac0000;

  for (const values of [[1, 2, 3, 4], [4, 3, 2, 1], [2, 4, 1, 3], [1, 1, 1, 1], [5, 1, 5, 1]]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    values.forEach((value, index) => view.setUint32(cells + index * 4, value, true));
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(244, cells, cells + 4, cells + 8, cells + 12);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(cells, cells + 4, cells + 8, cells + 12);
    assert.equal(actual, expected, `${values}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${values}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${values}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 5);
});
