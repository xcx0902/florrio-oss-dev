import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAllocateOrAbortHook, functionIds} from '../source/game/client/allocate-or-abort.mjs';

let comparisons = 0;
after(() => console.log(
  `client allocate-or-abort oracle comparisons: ${comparisons} total; sizes`));

test('allocate-or-abort matches malloc in fresh instances', async () => {
  const native = await loadOriginal('client', {functionIds: [371, 368, 1], construct: false});
  const recovered = await loadOriginal('client', {functionIds: [371, 368, 1], construct: false});
  const hook = createAllocateOrAbortHook(recovered)[371];
  const cleanNative = Buffer.from(new Uint8Array(native.memory.buffer));
  const cleanRecovered = Buffer.from(new Uint8Array(recovered.memory.buffer));

  for (const size of [0, 1, 16]) {
    new Uint8Array(native.memory.buffer).set(cleanNative);
    new Uint8Array(recovered.memory.buffer).set(cleanRecovered);
    const expected = native.call(371, size);
    const actual = hook(size);
    assert.equal(actual, expected, `${size}: pointer`);
    assert.ok(Buffer.from(new Uint8Array(recovered.memory.buffer))
      .equals(Buffer.from(new Uint8Array(native.memory.buffer))), `${size}: memory`);
    comparisons++;
  }
  assert.equal(comparisons, 3);
});
