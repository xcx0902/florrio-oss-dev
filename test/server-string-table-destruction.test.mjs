import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {
  createStringTableDestructionHook, functionIds, stringTables, singleStrings,
} from '../source/game/server/string-table-destruction.mjs';

let comparisons = 0;
after(() => console.log(
  `server string-table destruction oracle comparisons: ${comparisons} total; table walks and single strings`));

test('static string destructors match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 19], construct: false});
  const hooks = createStringTableDestructionHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  assert.deepEqual(functionIds, [501, 502, 503, 504, 506, 508, 511]);
  const addresses = new Set([...Object.values(singleStrings)]);
  for (const [top, bottom] of Object.values(stringTables)) {
    for (let address = bottom; address <= top; address += 12) addresses.add(address);
  }
  let state = 0xabcdef01;

  function prepare() {
    memory.set(clean);
    for (const address of addresses) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      view.setUint8(address + 11, 0x80);
      view.setUint32(address, state, true);
      view.setUint32(address + 4, state ^ 0x5a5a5a5a, true);
      view.setUint32(address + 8, 0, true);
    }
  }

  for (const id of functionIds) {
    for (let trial = 0; trial < 24; trial++) {
      prepare();
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, 0x12345678);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id]();
      assert.equal(actual, expected, `${id}/${trial}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${trial}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${trial}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 160);
});
