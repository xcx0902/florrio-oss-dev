import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamReadWordRecordHook, functionIds} from '../source/game/server/stream-read-word-record.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream word record oracle comparisons: ${comparisons} total; values and positions`));

test('word read into result record matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 361], construct: false});
  const hook = createStreamReadWordRecordHook(runtime)[315];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const result = 0x790000;
  const handle = 0x791000;
  const stream = 0x792000;
  const area = 0x793000;

  for (const used of [0, 4, 8]) {
    for (const value of [0, 0x12345678, -1]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(handle, stream, true);
      view.setUint32(stream + 12, area + used, true);
      view.setUint32(stream + 16, area + 12, true);
      view.setInt32(area + used, value, true);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(315, result, handle);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hook(result, handle);
      assert.equal(actual, expected, `${used}/${value}: result`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${used}/${value}: memory`);
      comparisons++;
    }
  }
  assert.ok(comparisons >= 9);
});
