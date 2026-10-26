import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMovableRecordHook, functionIds} from '../source/game/server/movable-record.mjs';

let comparisons = 0;
after(() => console.log(
  `server movable record oracle comparisons: ${comparisons} total; empty and 1..255 entries`));

test('movable record constructor matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createMovableRecordHook(runtime)[166];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const source = 0x680000;
  const destination = 0x682000;
  let state = 0x5a5a1234;

  for (const words of [0, 1, 2, 7, 8, 9, 31, 64, 255]) {
    for (const entries of [0, 1, 3, 7, 8, 15, 32]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(source, 0xdeadbeef, true);
      view.setUint8(source + 4, words);
      view.setUint8(source + 32, entries);
      view.setBigUint64(source + 24, 0x1122334455667788n, true);
      view.setBigUint64(source + 100, 0x99aabbccddeeff00n, true);
      view.setBigUint64(source + 108, 0x0f1e2d3c4b5a6978n, true);
      for (let index = 0; index < words; index++) view.setUint32(source + 8 + index * 4, state, true);
      for (let index = 0; index < entries; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        view.setBigUint64(source + 36 + index * 8, BigInt(state) << 32n | BigInt(state ^ 0x5555), true);
      }
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      runtime.call(166, destination, source);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hook(destination, source);
      assert.equal(runtime.stackPointer.value, stack, `${words}/${entries}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${words}/${entries}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 60);
});
