import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createGlobalPointerVectorCleanupHook, functionIds} from '../source/game/server/global-pointer-vector-cleanup.mjs';

let comparisons = 0;
after(() => console.log(
  `server pointer vector cleanup oracle comparisons: ${comparisons} total; empty and two entries`));

test('global pointer vector cleanup matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 121], construct: false});
  const hook = createGlobalPointerVectorCleanupHook(runtime)[455];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const count of [0, 2]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    const data = runtime.call(121, 8);
    for (let index = 0; index < count; index++) {
      view.setUint32(data + index * 4, runtime.call(121, 8), true);
    }
    view.setUint32(8548312, count, true);
    view.setUint32(8548320, data, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(455);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook();
    assert.equal(runtime.stackPointer.value, stack, `${count}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${count}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
