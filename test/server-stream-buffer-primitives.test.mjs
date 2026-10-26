import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamBufferPrimitiveHooks, functionIds} from '../source/game/server/stream-buffer-primitives.mjs';

let comparisons = 0;
after(() => console.log(
  `server streambuf primitive oracle comparisons: ${comparisons} total; word, byte and put paths`));

test('streambuf word/byte/put primitives match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createStreamBufferPrimitiveHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const self = 0x740000;
  const handle = 0x740100;
  const area = 0x741000;

  for (const used of [0, 1, 3]) {
    for (const id of [41, 361, 366]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(handle, self, true);
      view.setUint32(self + 12, area + used, true);
      view.setUint32(self + 16, area + 4, true);
      for (let index = 0; index < 4; index++) memory[area + index] = 0x80 + index;
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, id === 41 ? handle : self);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](id === 41 ? handle : self);
      assert.equal(actual, expected, `${id}/${used}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${used}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${used}: memory`);
      comparisons++;
    }
  }

  for (const used of [0, 1, 3]) {
    for (const value of [0, 65, 255, 0x141]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(self + 24, area + used, true);
      view.setUint32(self + 28, area + 4, true);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(365, self, value);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[365](self, value);
      assert.equal(actual, expected, `365/${used}/${value}: result`);
      assert.equal(runtime.stackPointer.value, stack, `365/${used}/${value}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `365/${used}/${value}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 21);
});
