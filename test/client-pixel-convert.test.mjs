import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createPixelConvertHooks, functionIds} from '../source/game/client/pixel-convert.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client pixel-convert oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createPixelConvertHooks(runtime);
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
    bytes.fill(0, SAFE + 0x300, SAFE + 0x800);
  }
  function prepare(id, args, kind) {
    const shift = kind === 'overlap' ? 4 : 0;
    args[0] = SAFE + 0x600 + shift;
    args[1] = SAFE + 0x500 + shift;
    args[2] = 2;
    args[3] = SAFE + 0x300 + shift;
    args[4] = SAFE + 0x400 + shift;
    const descriptor = SAFE + 0x300 + shift, shifts = SAFE + 0x400 + shift;
    set32(descriptor + 4, 0x0000ff00);
    set32(descriptor + 8, 0x000000ff);
    set32(descriptor + 12, 0x00ff0000);
    set8(descriptor + 20, 2);
    set8(descriptor + 21, 1);
    set8(descriptor + 22, 3);
    set8(descriptor + 24, 8);
    set8(descriptor + 25, 0);
    set8(descriptor + 26, 16);
    for (let index = 0; index < 8; index++) set8(shifts + 28 + index, index);
    set32(104976 + 4, SAFE + 0x700);
    set32(104976 + 8, SAFE + 0x720);
    set32(104976 + 12, SAFE + 0x740);
    for (let index = 0; index < 4; index++) {
      set8(SAFE + 0x700 + index, index * 17);
      set8(SAFE + 0x720 + index, index * 19);
      set8(SAFE + 0x740 + index, index * 23);
    }
    set32(SAFE + 0x500 + shift, 0x11223344);
    set32(SAFE + 0x504 + shift, 0x55667788);
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

test('pixel-convert exposes the original arity and replaces id 2288', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [2288]);
  assert.equal(typeof o.hooks[2288], 'function');
  assert.equal(o.hooks[2288].length, o.runtime.exports.__fn2288.length);
});

test('pixel-convert matches on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  const arity = o.runtime.exports.__fn2288.length;
  for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
    o.reset(kind);
    const args = argumentsFor(arity, kind);
    if (kind === 'safe' || kind === 'overlap') o.prepare(2288, args, kind);
    o.compare(2288, args, `2288 ${kind}`, kind);
  }
});

test('pixel-convert edge cases cover counts, masks and shift widths', async () => {
  const o = await oracle();
  for (const count of [-1, 0, 1, 3, 5]) {
    for (const layout of [0, 1, 2]) {
      o.reset('safe');
      const args = [SAFE + 0x600, SAFE + 0x500, count, SAFE + 0x300, SAFE + 0x400];
      o.prepare(2288, args, 'safe');
      args[2] = count;
      o.set32(SAFE + 0x300 + 4, layout === 0 ? 0x0000ff00 : layout === 1 ? 0xff000000 : 0xffffffff);
      o.set32(SAFE + 0x300 + 8, layout === 0 ? 0x000000ff : layout === 1 ? 0x00ff0000 : 0x0000ff00);
      o.set32(SAFE + 0x300 + 12, layout === 0 ? 0x00ff0000 : layout === 1 ? 0x000000ff : 0x00ff00ff);
      o.set8(SAFE + 0x300 + 24, layout * 4);
      o.set8(SAFE + 0x300 + 25, layout * 4);
      o.set8(SAFE + 0x300 + 26, layout * 4);
      o.set8(SAFE + 0x400 + 28, layout * 2);
      o.set8(SAFE + 0x400 + 29, layout * 2);
      o.set8(SAFE + 0x400 + 30, layout * 2);
      o.set8(SAFE + 0x400 + 31, layout * 2);
      o.set8(SAFE + 0x400 + 32, layout * 3);
      o.set8(SAFE + 0x400 + 33, layout * 3);
      o.set8(SAFE + 0x400 + 34, layout * 3);
      o.set8(SAFE + 0x400 + 35, layout * 3);
      o.compare(2288, args, `2288 count=${count} layout=${layout}`, 'edges');
    }
  }
});
