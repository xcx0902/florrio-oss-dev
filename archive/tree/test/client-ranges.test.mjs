import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRangeHooks, functionIds} from '../source/game/client/ranges.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client range oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;
const RANGE_IDS = new Set([1780, 1782, 1791]);

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createRangeHooks(runtime);
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
    set32(SAFE + 0x680, 0);
    set32(SAFE + 0x800, SAFE + 0x820);
    bytes.set([49, 50, 51, 52, 53, 0], SAFE + 0x820);
    if (kind === 'zero' || kind === 'boundary') return;
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 8; index++) {
      const base = SAFE + index * 0x100 + shift;
      set8(base + 11, 0x80);
      set32(base, SAFE + 0x900);
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
  return {runtime, hooks, reset, compare};
}

function argumentsFor(id, arity, kind) {
  const values = [];
  for (let index = 0; index < arity; index++) {
    if (kind === 'safe') values.push(SAFE + index * 0x100);
    else if (kind === 'overlap') values.push(SAFE + index * 0x100 + 4);
    else if (kind === 'boundary') values.push(0x3ffffff - index);
    else values.push(0);
  }
  if (id === 894) values[0] = kind === 'boundary' ? 0x3ffffff : kind === 'zero' ? 0 : SAFE + 0x680;
  if (id === 920) values[0] = kind === 'boundary' ? 0x3ffffff : kind === 'zero' ? 0 : SAFE + 0x800;
  if (id === 526) values[2] = kind === 'zero' ? 0 : kind === 'boundary' ? 4 : 8;
  if (RANGE_IDS.has(id)) {
    if (kind === 'zero') {
      for (let index = 1; index < arity; index++) values[index] = 0;
    } else {
      values[1] = SAFE + 0x100;
      values[2] = SAFE + 0x180;
      if (id === 1780) {
        values[3] = kind === 'boundary' ? 0x300000 : SAFE + 0x300;
        values[4] = kind === 'boundary' ? 0x3ffffff : SAFE + 0x400;
      } else {
        values[3] = kind === 'boundary' ? 0x3ffffff : SAFE + 0x400;
      }
    }
  }
  return values;
}

test('range functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('range functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      o.compare(id, argumentsFor(id, arity, kind), `${id} ${kind}`, kind);
    }
  }
});
