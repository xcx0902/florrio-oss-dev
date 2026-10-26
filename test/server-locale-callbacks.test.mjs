import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleCallbackHooks, functionIds} from '../source/game/server/locale-callbacks.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale callback oracle comparisons: ${comparisons} total; local delivery`));

test('locale callback dispatch matches originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 69, 221], construct: false});
  const hooks = createLocaleCallbackHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const self = 0xa10000;
  const record = 0xa11000;
  const target = 0xa12000;

  for (const id of functionIds) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(self + 4, 0x1234, true);
    view.setUint32(record + 8, target, true);
    view.setUint32(record + 16, 0, true);
    view.setUint32(target + 4, 0x1234, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(id, self, record, 7, 9);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[id](self, record, 7, 9);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
