import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamBlockWriteHooks, functionIds} from '../source/game/server/stream-block-write.mjs';

let comparisons = 0;
after(() => console.log(
  `server block write oracle comparisons: ${comparisons} total; full and zero writes`));

test('buffered block writes match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createStreamBlockWriteHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const stream = 0x890000;
  const area = 0x891000;
  const source = 0x892000;

  function setup(used) {
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(stream + 16, area + 32, true);
    view.setUint32(stream + 20, area + 32 - used, true);
    view.setUint8(stream + 75, 0xff);
    for (let index = 0; index < 16; index++) memory[source + index] = 65 + index;
  }

  for (const size of [1, 2, 4]) {
    for (const count of [0, 1, 2, 4]) {
      if (size * count > 8) continue;
      memory.set(clean);
      setup(8);
      const setupMemory = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(427, source, size, count, stream);
      const expectedMemory = Buffer.from(memory);
      memory.set(setupMemory);
      runtime.stackPointer.value = stack;
      const actual = hooks[427](source, size, count, stream);
      assert.equal(actual, expected, `427/${size}/${count}: result`);
      assert.equal(runtime.stackPointer.value, stack, `427/${size}/${count}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `427/${size}/${count}: memory`);
      comparisons++;
    }
  }

  for (const count of [0, 1, 5, 8]) {
    memory.set(clean);
    setup(8);
    const setupMemory = Buffer.from(memory);
    const expected = runtime.call(274, source, count, stream);
    const expectedMemory = Buffer.from(memory);
    memory.set(setupMemory);
    const actual = hooks[274](source, count, stream);
    assert.equal(actual, expected, `274/${count}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `274/${count}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 12);
});
