import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleFacetGetterHooks, functionIds} from '../source/game/server/locale-facet-getters.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale facet getter oracle comparisons: ${comparisons} total; eight facets`));

test('locale facet getters match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 92, 38], construct: false});
  const hooks = createLocaleFacetGetterHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const slot = 0x900000;
  const locale = 0x901000;
  const table = 0x902000;

  for (const id of functionIds) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(slot, locale, true);
    view.setUint32(locale + 16, table, true);
    view.setUint32(locale + 20, table + 256, true);
    for (let index = 0; index < 64; index++) view.setUint32(table + index * 4, 0x1000 + index, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(id, slot);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[id](slot);
    assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 8);
});
