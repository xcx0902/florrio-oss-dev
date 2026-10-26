import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRefcountHelperHooks, functionIds} from '../source/game/server/refcount-helpers.mjs';

let comparisons = 0;
after(() => console.log(
  `server refcount helper oracle comparisons: ${comparisons} total; non-releasing counts`));

test('reference-count helpers match originals', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hooks = createRefcountHelperHooks(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const record = 0x9f0000;
  const control = 0x9f1000;
  const source = 0x9f2000;

  for (const count of [1, 2, 3]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(record + 8, count, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(35, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    hooks[35](record);
    assert.equal(runtime.stackPointer.value, stack, `35/${count}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `35/${count}: memory`);
    comparisons++;
  }

  for (const count of [1, 2, 3]) {
    memory.set(clean);
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(record + 4, control, true);
    view.setUint32(control + 4, count, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(201, record);
    const expectedMemory = Buffer.from(memory);
    memory.set(setup);
    runtime.stackPointer.value = stack;
    const actual = hooks[201](record);
    assert.equal(actual, expected, `201/${count}: result`);
    assert.equal(runtime.stackPointer.value, stack, `201/${count}: stack`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `201/${count}: memory`);
    comparisons++;
  }

  memory.set(clean);
  new DataView(runtime.memory.buffer).setUint32(source, 0, true);
  new DataView(runtime.memory.buffer).setUint32(source + 4, 7, true);
  const setup = Buffer.from(memory);
  const expected = runtime.call(318, record, source);
  const expectedMemory = Buffer.from(memory);
  memory.set(setup);
  const actual = hooks[318](record, source);
  assert.equal(actual, expected, '318: result');
  assert.ok(Buffer.from(memory).equals(expectedMemory), '318: memory');
  comparisons++;
  assert.ok(comparisons >= 7);
});
