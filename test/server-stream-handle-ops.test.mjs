import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamHandleOpHooks, functionIds} from '../source/game/server/stream-handle-ops.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream handle oracle comparisons: ${comparisons} total; advance and inequality`));

test('stream handle operations match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 361, 366, 362, 367, 363, 368], construct: false});
  const hooks = createStreamHandleOpHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const handle = 0x8d0000;
  const other = 0x8d0100;
  const stream = 0x8d1000;
  const area = 0x8d2000;

  for (const id of [45, 46]) {
    for (const value of [0, 65, 255]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(handle, stream, true);
      view.setUint32(stream + 12, area, true);
      view.setUint32(stream + 16, area + 8, true);
      view.setUint8(area, value);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, handle);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](handle);
      assert.equal(actual, expected, `${id}/${value}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${value}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${value}: memory`);
      comparisons++;
    }
  }

  for (const id of [59, 60]) {
    for (const leftPresent of [false, true]) {
      for (const rightPresent of [false, true]) {
        memory.set(clean);
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(handle, leftPresent ? stream : 0, true);
        view.setUint32(other, rightPresent ? stream : 0, true);
        view.setUint32(stream + 12, area, true);
        view.setUint32(stream + 16, area + 4, true);
        const setup = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(id, handle, other);
        const expectedMemory = Buffer.from(memory);
        memory.set(setup);
        runtime.stackPointer.value = stack;
        const actual = hooks[id](handle, other);
        assert.equal(actual, expected, `${id}/${leftPresent}/${rightPresent}: result`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 14);
});
