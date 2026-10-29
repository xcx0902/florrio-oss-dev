import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createVtableConstructorHooks, functionIds} from '../source/game/client/vtable-constructors.mjs';

const SAFE = 0x100000;

let comparisons = 0;
after(() => console.log(
  `client vtable-constructors oracle comparisons: ${comparisons} total (0 trapping); `
  + `${functionIds.length} allocator constructors with vtable writes`));

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 371, 382, 1024, 1026], construct: false});
  const hooks = createVtableConstructorHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  function compare(id, args = []) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    const expected = {result: runtime.call(id, ...args) >>> 0};
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = {result: hooks[id](...args) >>> 0};
    assert.deepEqual(actual, expected, `${id}: result`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${id}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${id}: stack`);
    comparisons++;
  }
  return {runtime, hooks, compare};
}

test('vtable constructors allocate and copy the original fields', async () => {
  const o = await oracle();
  assert.equal(functionIds.length, 47);
  const view = new DataView(o.runtime.memory.buffer);
  const source = SAFE + 0x200;
  view.setUint32(source + 4, 0x12345678, true);
  view.setUint32(source + 8, 0x9abcdef0, true);
  for (const id of functionIds) o.compare(id, [source]);
});
