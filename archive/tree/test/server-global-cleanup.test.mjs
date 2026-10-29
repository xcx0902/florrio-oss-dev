import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createGlobalCleanupHooks, functionIds} from '../source/game/server/global-cleanup.mjs';

let comparisons = 0;
after(() => console.log(
  `server global cleanup oracle comparisons: ${comparisons} total; null pointers`));

test('global cleanup helpers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 10], construct: false});
  const hooks = createGlobalCleanupHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x9b0000;

  for (const id of [436, 441]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(id === 436 ? 8555164 : 8551052, 0, true);
    view.setUint32(id === 436 ? 8555156 : 8551044, 0x5a5a5a5a, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(id);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[id]();
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }

  for (const id of [646, 721]) {
    memory.set(clean);
    if (id === 646) new DataView(runtime.memory.buffer).setUint32(record + 60, 0, true);
    else new DataView(runtime.memory.buffer).setUint32(record + 24, 0, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(id, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[id](record);
    assert.equal(actual, expected, `${id}: result`);
    assert.equal(runtime.stackPointer.value, stack, `${id}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 4);
});
