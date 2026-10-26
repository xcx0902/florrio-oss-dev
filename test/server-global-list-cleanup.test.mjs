import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createGlobalListCleanupHooks, functionIds} from '../source/game/server/global-list-cleanup.mjs';

let comparisons = 0;
after(() => console.log(
  `server global list cleanup oracle comparisons: ${comparisons} total; one node lists`));

test('global list cleanup matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 121], construct: false});
  const hooks = createGlobalListCleanupHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    const node = runtime.call(121, 40);
    memory.fill(0, node, node + 40);
    const view = new DataView(runtime.memory.buffer);
    if (id === 448) {
      view.setUint32(8548348, node, true);
      view.setUint32(8548340, 0, true);
    } else {
      view.setUint32(8548284, node, true);
      view.setUint32(8548276, 0, true);
    }
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(id);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[id]();
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
