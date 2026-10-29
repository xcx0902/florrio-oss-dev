import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createByteRangeCompareHook, functionIds} from '../source/game/server/byte-range-compare.mjs';

let comparisons = 0;
after(() => console.log(
  `server byte-range compare oracle comparisons: ${comparisons} total; prefixes, differences and equality`));

test('signed byte-range comparison matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createByteRangeCompareHook(runtime)[611];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const first = 0x720000;
  const second = 0x721000;
  const samples = [
    [[], []], [[1], []], [[], [1]], [[1], [1]], [[1], [2]], [[2], [1]],
    [[128], [127]], [[127], [128]], [[255], [0]], [[0, 1], [0]], [[0], [0, 1]],
    [[65, 66, 67], [65, 66, 68]], [[65, 66], [65, 66]],
  ];

  for (const [left, right] of samples) {
    memory.set(clean);
    for (let index = 0; index < left.length; index++) memory[first + index] = left[index];
    for (let index = 0; index < right.length; index++) memory[second + index] = right[index];
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(611, 0, first, first + left.length, second, second + right.length);
    const actual = hook(0, first, first + left.length, second, second + right.length);
    assert.equal(actual, expected, `${left}/${right}: result`);
    assert.equal(runtime.stackPointer.value, stack);
    comparisons++;
  }
  assert.ok(comparisons >= 10);
});
