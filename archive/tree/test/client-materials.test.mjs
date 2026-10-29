import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createMaterialHooks, functionIds} from '../source/game/client/materials.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client material oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;
const MATERIAL = new Set([461, 1122, 3408, 3441, 3541, 4070]);
const MAP_BYTES = new Set([1783, 1785]);
const MAP_DWORDS = new Set([1792, 1794]);
const MIX = new Set([1311, 3357]);

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createMaterialHooks(runtime);
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
    set32(4, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 8; index++) {
      const base = SAFE + index * 0x100 + shift;
      set32(base + 8, 0x1234);
    }
  }
  function prepare(id, args, kind) {
    if (MATERIAL.has(id)) {
      set32(args[2] + 4, SAFE + 0x900);
      set8(SAFE + 0x900 + 10, kind === 'overlap' ? 2 : 3);
    } else if (MAP_BYTES.has(id)) {
      set8(args[1], 65);
      set8(args[1] + 1, 200);
    } else if (MAP_DWORDS.has(id)) {
      set32(args[1], 65);
      set32(args[1] + 4, 1000);
    } else if (MIX.has(id)) {
      set32(args[1], SAFE + 0x900);
      set32(args[1] + 4, SAFE + 0xa00);
      set32(SAFE + 0xa00 + 8, SAFE + 0xb00);
      set32(SAFE + 0xb00 + (id === 1311 ? 4 : 0), 12345);
    } else if (id === 2334) {
      set32(441664, 1);
      set32(441672, SAFE + 0xc00);
      set32(SAFE + 0xc00, SAFE + 0xd00);
      set32(SAFE + 0xd00 + 144, 1);
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
  return {runtime, hooks, reset, prepare, compare};
}

function argumentsFor(arity, kind) {
  const values = [];
  for (let index = 0; index < arity; index++) {
    if (kind === 'safe') values.push(SAFE + index * 0x100);
    else if (kind === 'overlap') values.push(SAFE + index * 0x100 + 4);
    else if (kind === 'boundary') values.push(0x3ffffff - index);
    else values.push(0);
  }
  return values;
}

test('material functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('material functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      const args = argumentsFor(arity, kind);
      if (kind === 'safe' || kind === 'overlap') o.prepare(id, args, kind);
      o.compare(id, args, `${id} ${kind}`, kind);
    }
  }
});
