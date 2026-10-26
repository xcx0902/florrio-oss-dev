import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createScanFormatHooks, functionIds} from '../source/game/client/scan-format.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client scan-format oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createScanFormatHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set8 = (address, value) => view.setUint8(address, value);
  const set16 = (address, value) => view.setUint16(address, value, true);
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset(kind) {
    bytes.fill(0xa5);
    set32(0, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 24; index++) set32(SAFE + index * 0x100 + shift + 8, 0x1234);
  }
  function string(address, text) {
    bytes.set([...text].map(character => character.charCodeAt(0)), address);
    set8(address + text.length, 0);
  }
  function stream(object, flags) {
    set32(object + 44, 5);
    set32(object + 24, 3);
    set32(object + 8, 1);
    set32(object + 12, 10);
    set32(object + 16, 0);
    set8(object + 48, flags);
    set8(9, 65);
  }
  function prepare(id, args, kind) {
    if (id === 415) {
      string(args[0], kind === 'overlap' ? 'AbD' : 'AbC');
      string(args[1], 'aBc');
    } else if (id === 607) {
      string(args[0], kind === 'overlap' ? 'AbD' : 'AbC');
      string(args[1], 'aBc');
      args[2] = 4;
    } else if (id === 1954) {
      args[0] = SAFE + 0x300;
      args[1] = kind === 'overlap' ? -1 : 65;
      stream(args[0], 0);
      if (kind === 'overlap') set8(9, 0x5a);
    } else if (id === 733) {
      args[0] = SAFE + 0x300;
      string(args[0], 'hello');
      args[1] = kind === 'overlap' ? 3 : 6;
    } else if (id === 601) {
      args[0] = SAFE + 0x300;
      if (kind === 'overlap') { args[1] = 0; return; }
      args[1] = SAFE + 0x400;
      set32(args[0] + 8, 20);
      set32(args[0] + 12, 30);
      set32(args[1], 2);
      set32(args[1] + 4, 3);
      set32(args[1] + 8, 100);
      set32(args[1] + 12, 50);
    } else if (id === 641) {
      args[0] = SAFE + 0x200;
      args[1] = SAFE + 0x300;
      string(args[1], '1.5');
      args[2] = kind === 'overlap' ? (2048 | 1024 | 260 | 16384) : 0;
    } else if (id === 2280) {
      args[0] = SAFE + 0x200;
      args[1] = SAFE + 0x300;
      args[2] = kind === 'overlap' ? 1 : 3;
      args[3] = SAFE + 0x400;
      args[4] = SAFE + 0x500;
      set32(0x100300, 0x11223344);
      set32(0x100304, 0x55667788);
      set32(0x100308, 0x99aabbcc);
      set32(args[3] + 12, 0x00ff00ff);
      set32(args[3] + 16, 0x0000ffff);
      set32(args[3] + 20, 0xffff0000);
      set32(args[3] + 24, 0x000000ff);
      const bytesAt = [32, 24, 8, 16];
      for (let index = 0; index < 4; index++) set8(args[3] + 32 + index, bytesAt[index]);
      for (const [offset, value] of [[28, 28], [29, 16], [30, 32], [32, 8], [33, 24], [34, 0]]) set8(args[4] + offset, value);
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
  return {runtime, hooks, reset, prepare, compare, set8, set16, set32, string, stream};
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

test('scan-format functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('scan-format functions match on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      const args = argumentsFor(arity, kind);
      if (kind === 'safe' || kind === 'overlap') o.prepare(id, args, kind);
      if (id === 2280 && kind === 'boundary') args[2] = -1;
      if (id === 733 && kind === 'boundary') { args[0] = 0x3fffff0; args[1] = 64; }
      if (id === 641 && kind === 'zero') { args[0] = 0; args[1] = SAFE + 0x300; o.set8(SAFE + 0x300, 0); }
      o.compare(id, args, `${id} ${kind}`, kind);
    }
  }
});

test('scan-format edge cases cover bounds, flags, rectangles, ranges and channel masks', async () => {
  const o = await oracle();
  for (const bound of [0, 1, 2, 3, 6]) {
    o.reset('safe');
    const args = [SAFE, SAFE + 0x100, bound];
    o.string(args[0], 'AbC');
    o.string(args[1], 'aBc');
    o.compare(607, args, `607 bound=${bound}`, 'edges');
  }
  for (const flags of [0, 16]) {
    o.reset('safe');
    const args = [SAFE + 0x300, 66];
    o.stream(0x100300, flags);
    o.set8(9, 65);
    o.compare(1954, args, `1954 flags=${flags}`, 'edges');
  }
  for (const length of [0, 1, 3, 4, 5, 6, 7]) {
    o.reset('safe');
    const args = [SAFE + 0x300, length];
    o.string(args[0], 'hello');
    o.compare(733, args, `733 length=${length}`, 'edges');
  }
  for (const [x, y, width, height, first, second] of [
    [2, 3, 100, 50, 20, 30], [-5, -7, 10, 10, 20, 30], [0, 0, 0, 0, 20, 30],
    [25, 5, 10, 10, 20, 30], [1, 1, 10, 10, 0, 30],
  ]) {
    o.reset('safe');
    const args = [SAFE + 0x300, SAFE + 0x400];
    o.set32(args[0] + 8, first);
    o.set32(args[0] + 12, second);
    o.set32(args[1], x); o.set32(args[1] + 4, y);
    o.set32(args[1] + 8, width); o.set32(args[1] + 12, height);
    o.compare(601, args, `601 rect=${x},${y},${width},${height}`, 'edges');
  }
  for (const flags of [0, 4, 256, 260, 2048, 1024, 16384, 2048 | 1024 | 4]) {
    o.reset('safe');
    const args = [SAFE + 0x200, SAFE + 0x300, flags];
    o.string(args[1], '2');
    o.compare(641, args, `641 flags=${flags}`, 'edges');
  }
  for (const count of [0, 1, 2, 4]) {
    o.reset('safe');
    const args = [SAFE + 0x200, SAFE + 0x300, count, SAFE + 0x400, SAFE + 0x500];
    o.set32(SAFE + 0x300, 0x11223344);
    o.set32(SAFE + 0x304, 0x55667788);
    o.set32(SAFE + 0x308, 0x99aabbcc);
    o.set32(SAFE + 0x30c, 0xdeadbeef);
    o.set32(SAFE + 0x400 + 12, 0x00ff00ff);
    o.set32(SAFE + 0x400 + 16, 0x0000ffff);
    o.set32(SAFE + 0x400 + 20, 0xffff0000);
    o.set32(SAFE + 0x400 + 24, 0x000000ff);
    for (let index = 0; index < 4; index++) o.set8(SAFE + 0x400 + 32 + index, [32, 24, 8, 16][index]);
    for (const [offset, value] of [[28, 28], [29, 16], [30, 32], [32, 8], [33, 24], [34, 0]]) o.set8(SAFE + 0x500 + offset, value);
    o.compare(2280, args, `2280 count=${count}`, 'edges');
  }
});
