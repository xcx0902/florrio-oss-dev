import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createDeleteGuardHook, functionIds} from '../source/game/server/delete-guard.mjs';

let comparisons = 0;
after(() => console.log(
  `server delete guard oracle comparisons: ${comparisons} total; null, sentinels and heap`));

test('delete guard matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 121], construct: false});
  const hook = createDeleteGuardHook(runtime)[355];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const kind of ['null', 'sentinel1', 'sentinel2', 'heap']) {
    memory.set(clean);
    const pointer = kind === 'null' ? 0
      : kind === 'sentinel1' ? 18764
        : kind === 'sentinel2' ? 18788
          : runtime.call(121, 4);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(355, pointer);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hook(pointer);
    assert.equal(actual, expected, `${kind}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${kind}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${kind}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
