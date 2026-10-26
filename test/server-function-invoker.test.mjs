import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFunctionInvokerHook, functionIds} from '../source/game/server/function-invoker.mjs';

let comparisons = 0;
after(() => console.log(
  `server function invoker oracle comparisons: ${comparisons} total; table targets`));

test('four-argument invoker matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds], construct: false});
  const hook = createFunctionInvokerHook(runtime)[287];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0xc30000;
  const vtable = 0xc31000;
  const offsetRecord = 0xc32000;
  const typeTable = 0xc33000;
  const tableIndex = 104;
  const originalEntry = runtime.table.get(tableIndex);
  const adapter = new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    1, 8, 1, 0x60, 4, 0x7f, 0x7f, 0x7f, 0x7f, 0,
    3, 2, 1, 0,
    7, 8, 1, 4, 110, 111, 111, 112, 0, 0,
    10, 4, 1, 2, 0, 0x0b,
  ])), {}).exports.noop;
  runtime.table.set(tableIndex, adapter);

  for (const [flags, offset] of [[0, 0], [2, 0], [1, 0], [3, 1]]) {
    for (const useOffset of [false, true]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(record, vtable, true);
      view.setUint32(record + 4, flags, true);
      view.setUint32(vtable, typeTable, true);
      view.setUint32(typeTable + 28, tableIndex, true);
      view.setUint32(offsetRecord, 0, true);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(287, record, 7, useOffset ? offsetRecord : 0, 9);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hook(record, 7, useOffset ? offsetRecord : 0, 9);
      assert.equal(runtime.stackPointer.value, stack, `${flags}/${useOffset}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${flags}/${useOffset}: memory`);
      comparisons++;
    }
  }
  runtime.table.set(tableIndex, originalEntry);
  assert.ok(comparisons >= 4);
});
