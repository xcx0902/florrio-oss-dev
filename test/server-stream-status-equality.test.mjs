import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamStatusEqualityHooks, functionIds} from '../source/game/server/stream-status-equality.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream status equality oracle comparisons: ${comparisons} total; handle pairs`));

test('stream status equality matches originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 362, 367], construct: false});
  const hooks = createStreamStatusEqualityHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const left = 0x880000;
  const right = 0x880100;
  const stream = 0x881000;
  const area = 0x882000;

  for (const id of [48, 49, 363, 368]) {
    for (const leftPresent of [false, true]) {
      for (const rightPresent of [false, true]) {
        for (const value of [0, 65]) {
          memory.set(clean);
          const view = new DataView(runtime.memory.buffer);
          view.setUint32(left, leftPresent ? stream : 0, true);
          view.setUint32(right, rightPresent ? stream : 0, true);
          view.setUint32(stream + 12, area, true);
          view.setUint32(stream + 16, area + 4, true);
          view.setUint8(area, value);
          const setup = Buffer.from(memory);
          const stack = runtime.stackPointer.value;
          const expected = runtime.call(id, left, right);
          const expectedMemory = Buffer.from(memory);
          memory.set(setup);
          runtime.stackPointer.value = stack;
          const actual = hooks[id](left, right);
          assert.equal(actual, expected, `${id}/${leftPresent}/${rightPresent}/${value}: result`);
          assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
          assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${leftPresent}/${rightPresent}/${value}: memory`);
          comparisons++;
        }
      }
    }
  }
  assert.ok(comparisons >= 32);
});
