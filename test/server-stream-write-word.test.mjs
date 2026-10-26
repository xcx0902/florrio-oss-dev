import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamWriteWordHook, functionIds} from '../source/game/server/stream-write-word.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream write-word oracle comparisons: ${comparisons} total; null and buffered words`));

test('stream word writer matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createStreamWriteWordHook(runtime)[359];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const handle = 0x7d0000;
  const stream = 0x7d1000;
  const area = 0x7d2000;

  for (const present of [false, true]) {
    for (const used of [0, 4]) {
      for (const value of [0, 0x12345678, -1]) {
        memory.set(clean);
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(handle, present ? stream : 0, true);
        view.setUint32(stream + 24, area + used, true);
        view.setUint32(stream + 28, area + 8, true);
        const setup = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(359, handle, value);
        const expectedMemory = Buffer.from(memory);
        memory.set(setup);
        runtime.stackPointer.value = stack;
        const actual = hook(handle, value);
        assert.equal(actual, expected, `${present}/${used}/${value}: result`);
        assert.equal(runtime.stackPointer.value, stack, `${present}/${used}/${value}: stack`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `${present}/${used}/${value}: memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 12);
});
