import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleFacetCleanupHook, functionIds} from '../source/game/server/locale-facet-cleanup.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale facet cleanup oracle comparisons: ${comparisons} total; empty facets`));

test('locale facet cleanup matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 121], construct: false});
  const hook = createLocaleFacetCleanupHook(runtime)[242];
  const tableIndex = 106;
  const originalEntry = runtime.table.get(tableIndex);
  const adapter = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    1, 5, 1, 0x60, 1, 0x7f, 0,
    3, 2, 1, 0,
    7, 8, 1, 4, 110, 111, 111, 112, 0, 0,
    10, 4, 1, 2, 0, 0x0b,
  ])), {}).exports.noop;
  runtime.table.set(tableIndex, adapter);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0xc50000;
  const locale = 0xc51000;
  const typeTable = 0xc52000;

  for (const count of [2, 1]) {
    memory.set(clean);
    const base = runtime.call(121, 512);
    memory.fill(0, base, base + 512);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(record + 28, locale, true);
    view.setUint32(locale, typeTable, true);
    view.setUint32(locale + 4, count, true);
    view.setUint32(typeTable + 8, tableIndex, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(242, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook(record);
    assert.equal(runtime.stackPointer.value, stack, `${count}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${count}: memory`);
    comparisons++;
  }
  runtime.table.set(tableIndex, originalEntry);
  assert.ok(comparisons >= 2);
});
