import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createShiftHooks, functionIds} from '../source/game/client/shifts.mjs';

let comparisons = 0, trapComparisons = 0;
after(() => console.log(
  `client shift oracle comparisons: ${comparisons} (${trapComparisons} trapping)`));

const SAFE = 0x100000;
const SHIFTS = [...Array.from({length: 34}, (_, index) => index), 63, 64, 65, 96, 127];

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createShiftHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set32 = (address, value) => view.setUint32(address, value, true);
  function seed(address) {
    set32(address, 0x01234567);
    set32(address + 4, 0x89abcdef);
  }
  function compare(id, args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    const expected = invoke(() => runtime.call(id, ...args));
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = invoke(() => hooks[id](...args));
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    if (expected.error) trapComparisons++;
    comparisons++;
  }
  return {runtime, hooks, bytes, seed, compare};
}

test('shift helpers expose the original arities and replace both ids', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [648, 650]);
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('648/650 match every sampled shift count on a fixed 64-bit pair', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    for (const shift of SHIFTS) {
      o.seed(SAFE + 0x100);
      o.compare(id, [SAFE + 0x100, shift], `${id} shift ${shift}`);
    }
  }
});

test('648/650 trap identically at the memory boundary', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    for (const shift of [0, 1]) {
      o.seed(0x3fffff8);
      o.compare(id, [0x3ffffff, shift], `${id} boundary shift ${shift}`);
    }
  }
});
