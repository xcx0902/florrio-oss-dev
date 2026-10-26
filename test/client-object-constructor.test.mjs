import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createObjectConstructorHooks, functionIds} from '../source/game/client/object-constructor.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client object-constructor oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createObjectConstructorHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set8 = (address, value) => view.setUint8(address, value);
  const set32 = (address, value) => view.setInt32(address, value, true);
  function reset(kind) {
    bytes.fill(0xa5);
    set32(0, 0);
    set32(441324, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    bytes.fill(0, SAFE + 0x300, SAFE + 0x800);
  }
  function prepare(id, args, kind) {
    const shift = kind === 'overlap' ? 4 : 0;
    args[0] = SAFE + 0x300 + shift;
    args[1] = SAFE + 0x500;
    for (let offset = 0; offset < 100; offset += 4) set32(SAFE + 0x500 + offset, 0x100 + offset);
    set32(SAFE + 0x500 + 68, 0x11223344);
    set32(SAFE + 0x500 + 72, 0);
    set32(SAFE + 0x500 + 76, 0);
    set32(SAFE + 0x500 + 96, 0x55667788);
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
  return {runtime, hooks, reset, prepare, compare, set8, set32};
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

test('object-constructor exposes the original arity and replaces id 384', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [384]);
  assert.equal(typeof o.hooks[384], 'function');
  assert.equal(o.hooks[384].length, o.runtime.exports.__fn384.length);
});

test('object-constructor matches on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  const arity = o.runtime.exports.__fn384.length;
  for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
    o.reset(kind);
    const args = argumentsFor(arity, kind);
    if (kind === 'safe' || kind === 'overlap') o.prepare(384, args, kind);
    o.compare(384, args, `384 ${kind}`, kind);
  }
});

test('object-constructor edge cases cover each list-relink branch', async () => {
  const o = await oracle();
  const cases = [
    ['neighbors-both', 0x600, 0x640, 0],
    ['previous-only', 0x600, 0, 0],
    ['next-only', 0, 0x640, 0],
    ['head-no-neighbors', 0, 0, 1],
    ['not-head-no-neighbors', 0, 0, 0],
    ['head-with-next', 0, 0x640, 1],
  ];
  for (const [label, previous, next, head] of cases) {
    o.reset('safe');
    const source = SAFE + 0x500;
    o.set32(source + 72, previous ? SAFE + previous : 0);
    o.set32(source + 76, next ? SAFE + next : 0);
    o.set32(441324, head ? source : SAFE + 0x700);
    if (previous) o.set32(SAFE + previous + 76, source);
    if (next) o.set32(SAFE + next + 72, source);
    o.compare(384, [SAFE + 0x300, source], `384 ${label}`, 'edges');
  }
  for (const shift of [0, 1, 4, 20]) {
    o.reset('safe');
    o.prepare(384, [SAFE + 0x300, SAFE + 0x500], 'safe');
    o.compare(384, [SAFE + 0x300 + shift, SAFE + 0x500], `384 overlap ${shift}`, 'edges');
  }
});
