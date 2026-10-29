import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createWideLocaleCallbackHooks, functionIds} from '../source/game/server/locale-callbacks-wide.mjs';

let comparisons = 0;
after(() => console.log(
  `server wide locale callback oracle comparisons: ${comparisons} total; local delivery`));

test('wide locale callback dispatch matches originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 69, 222], construct: false});
  const hooks = createWideLocaleCallbackHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const self = 0xa20000;
  const record = 0xa21000;
  const target = 0xa22000;

  for (const id of functionIds) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(self + 4, 0x1234, true);
    view.setUint32(record + 8, target, true);
    view.setUint32(record + 4, 7, true);
    view.setUint32(target + 4, 0x1234, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(id, self, record, 7, 9, 11, 0);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[id](self, record, 7, 9, 11, 0);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
