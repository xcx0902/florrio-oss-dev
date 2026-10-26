import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createObjectDeleterHooks, functionIds} from '../source/game/server/object-deleters.mjs';

let comparisons = 0;
after(() => console.log(
  `server object deleter oracle comparisons: ${comparisons} total; allocated records`));

test('deleting destructors match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 292, 299, 300, 14, 19, 121], construct: false});
  const hooks = createObjectDeleterHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);

  for (const id of functionIds) {
    memory.set(clean);
    const record = runtime.call(121, 64);
    memory.fill(0, record, record + 64);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(id, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[id](record);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 3);
});
