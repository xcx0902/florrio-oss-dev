import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamWriteByteHook, functionIds} from '../source/game/server/stream-write-byte.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream write-byte oracle comparisons: ${comparisons} total; null, buffer and value variants`));

test('stream byte writer matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 365], construct: false});
  const hook = createStreamWriteByteHook(runtime)[360];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const handle = 0x730000;
  const stream = 0x731000;
  const buffer = 0x732000;

  for (const streamPresent of [false, true]) {
    for (const used of [0, 1, 7]) {
      for (const value of [0, 65, 255, 0x141]) {
        memory.set(clean);
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(handle, streamPresent ? stream : 0, true);
        view.setUint32(stream + 24, buffer + used, true);
        view.setUint32(stream + 28, buffer + 8, true);
        const setup = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        runtime.call(360, handle, value);
        const expectedMemory = Buffer.from(memory);
        memory.set(setup);
        runtime.stackPointer.value = stack;
        hook(handle, value);
        assert.ok(Buffer.from(memory).equals(expectedMemory),
          `${streamPresent}/${used}/${value}: memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 20);
});
