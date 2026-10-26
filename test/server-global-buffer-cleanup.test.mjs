import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createGlobalBufferCleanupHook, functionIds} from '../source/game/server/global-buffer-cleanup.mjs';

let comparisons = 0;
after(() => console.log(
  `server global buffer cleanup oracle comparisons: ${comparisons} total; null and allocated`));

test('global buffer cleanup matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 121], construct: false});
  const hook = createGlobalBufferCleanupHook(runtime)[474];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const allocated of [false, true]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    if (allocated) view.setUint32(8548268, runtime.call(121, 16), true);
    view.setBigUint64(8548260, 123456789n, true);
    view.setUint32(8548244 + 8, 0, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(474);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook();
    assert.equal(runtime.stackPointer.value, stack, `${allocated}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${allocated}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
