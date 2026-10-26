import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createChannelPackHooks, functionIds} from '../source/game/client/channel-pack.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client channel-pack oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;
const TABLE = 104976;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createChannelPackHooks(runtime);
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
    bytes.fill(0, SAFE + 0x300, SAFE + 0x800);
    for (let index = 0; index < 3; index++) {
      const base = SAFE + 0x700 + index * 0x80;
      for (let offset = 0; offset < 0x80; offset++) set8(base + offset, (offset * 7 + index * 11) & 0xff);
      set32(TABLE + index * 4, base);
    }
  }
  function prepare(id, args, kind) {
    const shift = kind === 'overlap' ? 4 : 0;
    args[0] = SAFE + 0x600 + shift;
    args[1] = SAFE + 0x500 + shift;
    args[2] = 2;
    args[3] = SAFE + 0x300 + shift;
    args[4] = SAFE + 0x400 + shift;
    const p3 = args[3], p4 = args[4];
    if (id === 2282 || id === 2283) {
      set32(p3 + 12, 0xff);
      set32(p3 + 16, 0xff00);
      set32(p3 + 20, 0xff0000);
      set32(p3 + 24, 0xff000000);
      [0, 8, 16, 24].forEach((value, index) => set8(p3 + 32 + index, value));
    } else {
      set8(p3 + 20, 0); set8(p3 + 21, 1); set8(p3 + 22, 2);
      set8(p3 + 24, 0); set8(p3 + 25, 8); set8(p3 + 26, 16);
      if (id === 2281) {
        set8(p3 + 28, 0); set8(p3 + 29, 1); set8(p3 + 30, 2);
        set8(p3 + 32, 0); set8(p3 + 33, 8); set8(p3 + 34, 16);
        set32(p3 + 12, 0xff0000);
        set32(p3 + 16, 0xff);
        set32(p3 + 20, 0xff00);
      } else {
        set32(p3 + 4, 0xff);
        set32(p3 + 8, 0xff00);
        set32(p3 + 12, 0xff0000);
      }
    }
    const shifts = id === 2281 ? [0, 8, 16, 0, 0, 8, 16, 24]
      : [0, 8, 16, 24, 0, 8, 16, 24];
    shifts.forEach((value, index) => set8(p4 + 28 + index, value));
    if (id === 2282 || id === 2283) set32(p4 + 24, 0x01020304);
    if (id === 2286 || id === 2287) set32(p4 + 24, 1);
    if (id === 2286) {
      set16(args[1], 0x3344);
      set16(args[1] + 2, 0x5566);
    } else if (id === 2287) {
      set32(args[1], 0x11223344);
      set32(args[1] + 4, 0x55667788);
    } else {
      set32(args[1], 0x11223344);
      set32(args[1] + 4, 0x55667788);
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
  return {runtime, hooks, reset, prepare, compare, set8, set16, set32};
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

test('channel-pack functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('channel-pack functions match on safe, overlapping, zero, and boundary arguments', async () => {
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

test('channel-pack edge cases cover counts, channel patterns and palette indices', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    for (const count of [1, 2, 3]) {
      o.reset('safe');
      const args = [SAFE + 0x600, SAFE + 0x500, 0, SAFE + 0x300, SAFE + 0x400];
      o.prepare(id, args, 'safe');
      args[2] = count;
      o.compare(id, args, `${id} count=${count}`, 'edges');
    }
  }
  for (const pattern of [0, 0xffffffff, 0x01020304, 0x7f80ff00]) {
    for (const id of functionIds) {
      o.reset('safe');
      const args = [SAFE + 0x600, SAFE + 0x500, 1, SAFE + 0x300, SAFE + 0x400];
      o.prepare(id, args, 'safe');
      if (id === 2286) o.set16(args[1], pattern & 0xffff);
      else o.set32(args[1], pattern);
      o.compare(id, args, `${id} pattern=${pattern}`, 'edges');
    }
  }
});
