import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createBitmapDecodeHooks, functionIds} from '../source/game/client/bitmap-decode.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client bitmap-decode oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createBitmapDecodeHooks(runtime);
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
    set32(133584, 0);
    set32(7944552, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    bytes.fill(0, SAFE + 0x300, SAFE + 0x800);
  }
  function prepare(id, args, kind) {
    const shift = kind === 'overlap' ? 4 : 0;
    if (id === 2265 || id === 2268 || id === 2270 || id === 2264 || id === 2266) {
      const object = SAFE + 0x300 + shift;
      args[0] = object;
      set32(object + 24, 8);
      set32(object + 28, 2);
      set32(object, SAFE + 0x500);
      set32(object + 20, SAFE + 0x600);
      set32(object + 16, 8);
      set32(object + 36, id === 2265 ? 24 : 32);
      set32(object + 48, SAFE + 0x700);
      set32(object + 56, 0);
      bytes.fill(0xaa, SAFE + 0x500, SAFE + 0x520);
      for (let index = 0; index < 16; index++) set8(SAFE + 0x700 + index, index * 3);
    } else if (id === 2269) {
      const object = SAFE + 0x300 + shift;
      args[0] = object;
      set32(object + 24, 8);
      set32(object + 28, 2);
      set32(object, SAFE + 0x500);
      set32(object + 20, SAFE + 0x600);
      set32(object + 16, 8);
      set32(object + 36, 3);
      set32(object + 48, SAFE + 0x700);
      set32(object + 56, 0);
      bytes.fill(0xaa, SAFE + 0x500, SAFE + 0x520);
      set32(SAFE + 0x700, 0x11223344);
      set32(SAFE + 0x704, 0x55667788);
    } else if (id === 602) {
      const object = SAFE + 0x300 + shift;
      args[0] = object;
      args[1] = 0x40; args[2] = 0x50; args[3] = 0x60; args[4] = 0x70;
      for (let index = 0; index < 8; index++) set8(object + 28 + index, index * 4);
      set32(object + 24, 0x0f0f0f0f);
      if (kind === 'overlap') {
        set32(object + 4, SAFE + 0x400);
        set32(SAFE + 0x400, 3);
        set32(SAFE + 0x404, SAFE + 0x500);
        set32(SAFE + 0x500, 0x10203040);
        set32(SAFE + 0x504, 0x50607080);
        set32(SAFE + 0x508, 0x90a0b0c0);
      } else {
        set32(object + 4, 0);
      }
    } else if (id === 543) {
      args[0] = SAFE + 0x600 + shift;
      args[1] = kind === 'overlap' ? 0x41 : 0x7ff;
      set32(133584, SAFE + 0x700);
      set32(SAFE + 0x700, 1);
      set32(7944552, 0);
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

test('bitmap-decode functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('bitmap-decode functions match on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      const args = argumentsFor(arity, kind);
      if (kind === 'safe' || kind === 'overlap') o.prepare(id, args, kind);
      else if (id === 543) args[1] = 0x7ff;
      else if (id === 2265 || id === 2268 || id === 2269 || id === 2270 || id === 2264 || id === 2266) { o.set32(24, 0); o.set32(28, 1); }
      o.compare(id, args, `${id} ${kind}`, kind);
    }
  }
});

test('bitmap-decode edge cases cover palettes, channel masks and UTF-8 boundaries', async () => {
  const o = await oracle();
  for (const [index, value] of [1, 0, 0xffffffff].entries()) {
    o.reset('safe');
    const args = [SAFE + 0x300];
    o.set32(SAFE + 0x300 + 24, value);
    for (let offset = 0; offset < 8; offset++) o.set8(SAFE + 0x300 + 28 + offset, offset * 4);
    o.set32(SAFE + 0x304, 0);
    o.compare(602, args, `602 channels ${index}`, 'edges');
  }
  for (const [label, colors] of [['exact', [0x10203040, 0, 0]], ['near', [0x10203050, 0x10203040, 0]], ['none', [0xff, 0xee, 0xdd]]]) {
    o.reset('safe');
    const args = [SAFE + 0x300, 0x10, 0x20, 0x30, 0x40];
    o.set32(SAFE + 0x304, SAFE + 0x400);
    o.set32(SAFE + 0x400, 3);
    o.set32(SAFE + 0x404, SAFE + 0x500);
    colors.forEach((color, index) => o.set32(SAFE + 0x500 + index * 4, color));
    o.compare(602, args, `602 ${label}`, 'edges');
  }
  for (const flag of [0, 1]) {
    for (const value of [0x41, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdfff, 0xe000, 0xffff, 0x10000, 0x10ffff, 0x110000, 57216]) {
      o.reset('safe');
      o.set32(133584, SAFE + 0x700);
      o.set32(SAFE + 0x700, flag);
      o.compare(543, [SAFE + 0x600, value], `543 flag=${flag} value=${value}`, 'edges');
    }
  }
  for (const decoder of [2264, 2265, 2266, 2268, 2269, 2270]) {
    for (const [width, rows] of [[0, 1], [1, 1], [9, 2], [16, 3]]) {
      o.reset('safe');
      const args = [SAFE + 0x300];
      o.set32(SAFE + 0x300 + 24, width);
      o.set32(SAFE + 0x300 + 28, rows);
      o.set32(SAFE + 0x300, SAFE + 0x500);
      o.set32(SAFE + 0x304, SAFE + 0x600);
      o.set32(SAFE + 0x310, 8);
      o.set32(SAFE + 0x324, 3);
      o.set32(SAFE + 0x330, SAFE + 0x700);
      o.set32(SAFE + 0x338, 0);
      o.set32(SAFE + 0x300 + 36, decoder === 2265 ? 24 : 32);
      for (let index = 0; index < 16; index++) o.set8(SAFE + 0x700 + index, index * 3);
      o.compare(decoder, args, `${decoder} width=${width} rows=${rows}`, 'edges');
    }
  }
  o.reset('safe');
  o.compare(1423, [0], '1423 clear', 'edges');
});
