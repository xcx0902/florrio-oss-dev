import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVtableDestructorHooks, functionIds} from '../source/game/server/vtable-destructors.mjs';

let comparisons = 0;
after(() => console.log(
  `server vtable destructor oracle comparisons: ${comparisons} total; zeroed records`));

test('vtable destructors match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 19, 121], construct: false});
  const hooks = createVtableDestructorHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x9a0000;

  for (const id of functionIds) {
    for (const pointer of [0, record + 256]) {
      memory.set(clean);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(record + 8, pointer, true);
      view.setUint8(record + 12, 0);
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(id, record);
      const expectedMemory = Buffer.from(memory);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      const actual = hooks[id](record);
      assert.equal(actual, expected, `${id}/${pointer}: result`);
      assert.equal(runtime.stackPointer.value, stack, `${id}/${pointer}: stack`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/${pointer}: memory`);
      comparisons++;
    }
  }
  for (const id of [299, 300]) {
    memory.set(clean);
    const pointer = runtime.call(121, 16);
    const view = new DataView(runtime.memory.buffer);
    const offset = id === 299 ? 12 : 16;
    view.setUint32(record + offset, pointer, true);
    view.setUint32(record + offset + 4, 4, true);
    view.setUint8(record + offset + 11, 0x80);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(id, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[id](record);
    assert.equal(runtime.stackPointer.value, stack, `${id}/long: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${id}/long: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 8);
});
