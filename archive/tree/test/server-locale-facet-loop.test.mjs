import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleFacetLoopHook, functionIds} from '../source/game/server/locale-facet-loop.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale facet loop oracle comparisons: ${comparisons} total; facet counts`));

test('locale facet loop matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 69, 221, 287], construct: false});
  const hook = createLocaleFacetLoopHook(runtime)[442];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const self = 0xc40000;
  const record = 0xc41000;
  const table = 0xc42000;

  for (const [facet, count] of [[0, 0], [0, 2], [0, 3]]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(record + 8, 0, true);
    view.setUint32(self + 12, count, true);
    for (let index = 0; index < 4; index++) {
      view.setUint32(self + 16 + index * 8, table, true);
      view.setUint32(self + 16 + index * 8 + 4, 0, true);
    }
    view.setUint32(table, table, true);
    view.setUint32(table + 4, 0, true);
    view.setUint32(table, 0, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(442, self, record, facet, 0);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook(self, record, facet, 0);
    assert.equal(runtime.stackPointer.value, stack, `${facet}/${count}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${facet}/${count}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
