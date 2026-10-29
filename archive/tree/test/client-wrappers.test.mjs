import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createWrapperHooks, functionIds} from '../source/game/client/wrappers.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client wrapper oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const dependencies = [389, 365, 488, 442, 363];
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createWrapperHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set8 = (address, value) => view.setUint8(address, value);
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset(kind) {
    bytes.fill(0xa5);
    set32(0, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 20; index++) {
      set32(SAFE + index * 0x100 + shift + 8, 0x1234);
    }
  }
  function prepare913(args, count) {
    for (let index = 0; index <= count; index++) {
      const record = SAFE + 0x500 + index * 0x20;
      set32(args[0] + index * 4, record);
      for (let offset = 0; offset < 20; offset++) set8(record + offset, index * 31 + offset);
    }
  }
  function prepare(id, args, kind) {
    if (id === 482) {
      set32(args[0], 0x11111111);
      set32(args[0] + 4, 0x22222222);
      set32(args[0] + 8, 0x33333333);
    } else if (id === 463) {
      set32(args[0] + 4, SAFE + 0x500);
      set32(args[1] + 4, SAFE + 0x520);
      bytes.set([97, 98, 99, 0], SAFE + 0x500);
      bytes.set(kind === 'overlap' ? [97, 98, 100, 0] : [97, 98, 99, 0], SAFE + 0x520);
    } else if (id === 837) {
      set32(133584, kind === 'overlap' ? 7945660 : 0);
    } else if (id === 913) {
      prepare913(args, 4);
    }
  }
  function compare(id, args, label, kind) {
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
    byKind[kind].comparisons++;
    if (expected.error) byKind[kind].traps++;
    comparisons++;
  }
  return {runtime, hooks, reset, prepare, prepare913, compare, set8};
}

function argumentsFor(id, arity, kind) {
  const values = [];
  for (let index = 0; index < arity; index++) {
    if (kind === 'safe') values.push(SAFE + index * 0x100);
    else if (kind === 'overlap') values.push(SAFE + index * 0x100 + 4);
    else if (kind === 'boundary') values.push(0x3ffffff - index);
    else values.push(0);
  }
  return values;
}

test('wrapper functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('wrapper functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      const args = argumentsFor(id, arity, kind);
      if (kind === 'safe' || kind === 'overlap') o.prepare(id, args, kind);
      o.compare(id, args, `${id} ${kind}`, kind);
    }
  }
});

test('wrapper edge cases cover both 463 branches, short arrays and extreme 582 inputs', async () => {
  const o = await oracle();
  for (const difference of [0, 1]) {
    o.reset('safe');
    const args = [SAFE + 0x300, SAFE + 0x320, 0];
    o.prepare(463, args, 'safe');
    if (difference) o.set8(SAFE + 0x520, 100);
    o.compare(463, args, `463 inline p2=0 difference=${difference}`, 'edges');
  }
  for (const count of [1, 2]) {
    o.reset('safe');
    const args = [SAFE + 0x400, count];
    o.prepare913(args, count);
    o.compare(913, args, `913 count=${count}`, 'edges');
  }
  for (const value of [0, 1, 2, 0x80000000, 0xffffffff]) {
    o.reset('safe');
    o.compare(582, [SAFE + 0x100, value], `582 p1=${value}`, 'edges');
  }
});
