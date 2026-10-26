import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createWindowCheckHooks, functionIds} from '../source/game/client/window-check.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client window-check oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createWindowCheckHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset(kind) {
    bytes.fill(0xa5);
    set32(0, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    for (let offset = 0; offset <= 20; offset += 4) {
      set32(114848 + offset, 5);
      set32(114868 + offset, 6);
      set32(114888 + offset, 7);
      set32(114908 + offset, 8);
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

test('window-check exposes the original arity and replaces id 2058', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [2058]);
  assert.equal(typeof o.hooks[2058], 'function');
  assert.equal(o.hooks[2058].length, o.runtime.exports.__fn2058.length);
});

test('window-check matches on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  const arity = o.runtime.exports.__fn2058.length;
  for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
    o.reset(kind);
    const args = argumentsFor(arity, kind);
    o.compare(2058, args, `2058 ${kind}`, kind);
  }
});

test('window-check edge cases cover packed nibbles and table windows', async () => {
  const o = await oracle();
  const values = [0, 1, 2, 3, 4, 5, 15, 16, 0x0f, 0x10, 0x000f000f, 0x00100010,
    0x01000000, 0x0a0f0a0f, 0x0b0a0a0a, 0xffffffff, 0x12345678, 0x2f3e4d5c,
    0x00010000, 0x00020000, 0x00030000, 0x00040000, 0x10000000];
  for (const value of values) {
    for (const tableCase of [0, 1, 2]) {
      o.reset('safe');
      for (let offset = 0; offset <= 20; offset += 4) {
        const base = [5, 1, 0][tableCase];
        o.runtime.memory.buffer;
        new DataView(o.runtime.memory.buffer).setUint32(114848 + offset, base, true);
        new DataView(o.runtime.memory.buffer).setUint32(114868 + offset, base + 1, true);
        new DataView(o.runtime.memory.buffer).setUint32(114888 + offset, base + 2, true);
        new DataView(o.runtime.memory.buffer).setUint32(114908 + offset, base + 3, true);
      }
      o.compare(2058, [0, value], `2058 value=${value} table=${tableCase}`, 'edges');
    }
  }
});
