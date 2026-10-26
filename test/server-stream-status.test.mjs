import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStreamStatusHooks, functionIds} from '../source/game/server/stream-status.mjs';

let comparisons = 0;
after(() => console.log(
  `server stream status oracle comparisons: ${comparisons} total; null and readable handles`));

test('stream status probes match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createStreamStatusHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const handle = 0x870000;
  const stream = 0x871000;
  const area = 0x872000;

  for (const id of [362, 367]) {
    for (const present of [false, true]) {
      for (const value of [0, 65, 255]) {
        memory.set(clean);
        const view = new DataView(runtime.memory.buffer);
        view.setUint32(handle, present ? stream : 0, true);
        view.setUint32(stream + 12, area, true);
        view.setUint32(stream + 16, area + 4, true);
        view.setUint8(area, value);
        const setup = Buffer.from(memory);
        const stack = runtime.stackPointer.value;
        const expected = runtime.call(id, handle);
        const expectedMemory = Buffer.from(memory);
        memory.set(setup);
        runtime.stackPointer.value = stack;
        const actual = hooks[id](handle);
        assert.equal(actual, expected, `${id}/${present}/${value}: result`);
        assert.equal(runtime.stackPointer.value, stack, `${id}/${present}/${value}: stack`);
        assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${present}/${value}: memory`);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons >= 12);
});
