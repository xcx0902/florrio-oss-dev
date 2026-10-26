import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamReadCharHook, functionIds} from '../source/game/server/stream-read-char.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream read char oracle comparisons: ${comparisons} total; word values`));

test('character reader matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 366], construct: false});
  const hook = createStreamReadCharHook(runtime)[322];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const result = 0x970000;
  const handle = 0x970100;
  const stream = 0x971000;
  const area = 0x972000;

  for (const value of [0, 0x41, 0x7f, 0x80, 0x80ff, 0xffffff80]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(handle, stream, true);
    view.setUint32(stream + 12, area, true);
    view.setUint32(stream + 16, area + 8, true);
    view.setUint32(area, value, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(322, result, handle);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook(result, handle);
    assert.equal(runtime.stackPointer.value, stack, `${value}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${value}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 6);
});
