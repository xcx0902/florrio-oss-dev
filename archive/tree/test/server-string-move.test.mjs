import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStringMoveHooks, functionIds} from '../source/game/server/string-move.mjs';

let comparisons = 0;
after(() => console.log(
  `server string move-assignment oracle comparisons: ${comparisons} total; `
  + 'short/long destinations and sources'));

test('string move assignment 54/86 match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 16], construct: false});
  const hooks = createStringMoveHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const base = 0x390000;
  assert.equal(hooks[54].length, runtime.exports.__fn54.length);
  assert.equal(hooks[86].length, runtime.exports.__fn86.length);

  function writeString(address, text, long) {
    const bytes = new TextEncoder().encode(text);
    if (long) {
      const data = runtime.call(16, 32);
      memory.fill(0, data, data + 32);
      memory.set(bytes, data);
      view.setUint32(address, data, true);
      view.setUint32(address + 4, 32, true);
      view.setUint32(address + 8, bytes.length, true);
      view.setUint8(address + 11, 0x80);
    } else {
      memory.fill(0, address, address + 12);
      memory.set(bytes, address);
      view.setUint8(address + 11, bytes.length);
    }
  }

  for (const id of functionIds) {
    for (const destinationLong of [false, true]) {
      for (const sourceLong of [false, true]) {
        for (const text of ['', 'a', 'hello', 'sixteen-byte-str']) {
          const before = Buffer.from(memory);
          const destination = base + 128;
          const source = base + 256;
          writeString(destination, 'destination-value', destinationLong);
          writeString(source, text, sourceLong);
          const setup = Buffer.from(memory);
          const stack = runtime.stackPointer.value;
          runtime.call(id, destination, source);
          const expected = Buffer.from(memory);
          memory.set(setup);
          runtime.stackPointer.value = stack;
          hooks[id](destination, source);
          assert.ok(Buffer.from(memory).equals(expected),
            `${id}/${destinationLong}/${sourceLong}/${text}: memory`);
          assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
          comparisons++;
          memory.set(before);
        }
      }
    }
  }
});
