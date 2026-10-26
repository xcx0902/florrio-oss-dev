import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLocaleStreamStateHook, functionIds} from '../source/game/server/locale-stream-state.mjs';

let comparisons = 0;
after(() => console.log(
  `server locale stream state oracle comparisons: ${comparisons} total; matched facets`));

test('locale stream state update matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 69], construct: false});
  const hook = createLocaleStreamStateHook(runtime)[439];
  const memory = new Uint8Array(runtime.memory.buffer);
  const self = 0xa90000;
  const record = 0xa91000;
  const target = 0xa92000;

  for (const state of [0, 1]) {
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(self + 4, 0x1234, true);
    view.setUint32(record + 8, target, true);
    view.setUint32(record + 4, 7, true);
    view.setUint32(record + 28, state, true);
    view.setUint32(target + 4, 0x1234, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(439, self, record, 7, 9, 0);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hook(self, record, 7, 9, 0);
    assert.equal(runtime.stackPointer.value, stack, `${state}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${state}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 2);
});
