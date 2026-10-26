import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createObjectMethodDispatchHook, functionIds} from '../source/game/server/object-method-dispatch.mjs';

let comparisons = 0;
after(() => console.log(
  `server virtual dispatch oracle comparisons: ${comparisons} total; table slots and object payloads`));

test('virtual method thunk matches original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createObjectMethodDispatchHook(runtime)[532];
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const self = 0x400000;
  const object = 0x401000;

  // Find a table slot whose target accepts a single i32 and returns void.
  let slot = null;
  for (let index = 0; index < runtime.table.length; index++) {
    memory.set(clean);
    new DataView(runtime.memory.buffer).setUint32(self, object, true);
    new DataView(runtime.memory.buffer).setUint32(object + 4, index, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    try {
      runtime.call(532, self);
      memory.set(setup);
      runtime.stackPointer.value = stack;
      hook(self);
      slot = index;
      break;
    } catch {}
  }
  assert.notEqual(slot, null, 'no usable virtual table slot');

  for (let trial = 0; trial < 8; trial++) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(self, object, true);
    view.setUint32(object + 4, slot, true);
    for (let offset = 8; offset < 48; offset++) view.setUint8(object + offset, (trial * 37 + offset) & 0xff);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expectedError = (() => { try { runtime.call(532, self); return null; } catch (error) { return error; } })();
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actualError = (() => { try { hook(self); return null; } catch (error) { return error; } })();
    assert.equal(actualError?.constructor, expectedError?.constructor, `${trial}: trap type`);
    assert.equal(runtime.stackPointer.value, stack, `${trial}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${trial}: memory`);
    comparisons++;
  }
  assert.ok(comparisons >= 8);
});
