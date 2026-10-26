import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createConfigIoHooks, functionIds} from '../source/game/client/config-io.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client config-io oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;
const dependencies = [363, 365, 415, 463, 488, 545, 711, 712, 733, 837];

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createConfigIoHooks(runtime);
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
    set32(7941628, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 24; index++) set32(SAFE + index * 0x100 + shift + 8, 0x1234);
  }
  function string(address, text) {
    bytes.set([...text].map(character => character.charCodeAt(0)), address);
    set8(address + text.length, 0);
  }
  function prepare(id, args, kind) {
    if (id === 1802) {
      args[0] = SAFE + 0x600;
      set32(args[0] + 8, kind === 'overlap' ? 0 : SAFE + 0x500);
    } else if (id === 1771) {
      args[0] = SAFE + 0x600;
      args[1] = SAFE + 0x300;
      args[2] = 8; args[3] = 9;
      bytes.fill(0, args[1], args[1] + 0x200);
      set32(args[0] + 4, SAFE + 0x700);
      set32(args[1] + 4, kind === 'overlap' ? SAFE + 0x704 : SAFE + 0x700);
      set32(args[1] + 8, SAFE + 0x700);
    } else if (id === 1766) {
      args[0] = SAFE + 0x600;
      args[1] = SAFE + 0x300;
      args[2] = 8; args[3] = 9; args[4] = 10; args[5] = 0;
      bytes.fill(0, args[1], args[1] + 0x200);
      set32(args[0] + 4, SAFE + 0x700);
      set32(args[1] + 4, SAFE + 0x700);
      set32(args[1] + 8, SAFE + 0x700);
    } else if (id === 2308 || id === 2309) {
      args[0] = SAFE + 0x700;
      args[3] = kind === 'overlap' ? 0 : SAFE + 0x300;
      string(args[3], '42');
    } else if (id === 2304) {
      args[0] = SAFE + 0x700;
      args[3] = kind === 'overlap' ? 0 : SAFE + 0x300;
      string(args[3], 'abc');
    } else if (id === 2331) {
      args[3] = kind === 'overlap' ? 0 : SAFE + 0x300;
      string(args[3], '5');
    } else if (id === 1978) {
      args[0] = SAFE + 0x700;
      args[1] = SAFE + 0x800;
      args[2] = kind === 'overlap' ? 20 : 5;
      set32(args[0] + 84, SAFE + 0x600);
      bytes.fill(65, SAFE + 0x600, SAFE + 0x700);
      set8(SAFE + 0x60a, 0);
    } else if (id === 1804) {
      args[0] = SAFE + 0x600;
      set32(args[0] + 8, kind === 'overlap' ? 0 : SAFE + 0x500);
      bytes.fill(0, SAFE + 0x500, SAFE + 0x520);
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
  return {runtime, hooks, reset, prepare, compare, set8, set32, string};
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

test('config-io functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('config-io functions match on safe, overlapping, zero, and boundary arguments', async () => {
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

test('config-io edge cases cover defaults, literals and buffer extents', async () => {
  const o = await oracle();
  for (const id of [2308, 2309]) {
    for (const text of ['', '0', '-5', '42']) {
      o.reset('safe');
      const args = [SAFE + 0x700, 0, 0, SAFE + 0x300];
      o.string(SAFE + 0x300, text);
      o.compare(id, args, `${id} text=${text || 'empty'}`, 'edges');
    }
    o.reset('safe');
    o.compare(id, [SAFE + 0x700, 0, 0, 0], `${id} absent`, 'edges');
  }
  for (const text of ['0', 'abc', '']) {
    o.reset('safe');
    const args = [SAFE + 0x700, 0, 0, SAFE + 0x300];
    o.string(SAFE + 0x300, text);
    o.compare(2304, args, `2304 text=${text || 'empty'}`, 'edges');
  }
  for (const text of ['0', '1', '2', '5', '-1']) {
    o.reset('safe');
    const args = [0, 0, 0, SAFE + 0x300];
    o.string(SAFE + 0x300, text);
    o.compare(2331, args, `2331 text=${text}`, 'edges');
  }
  for (const length of [0, 1, 5, 20]) {
    o.reset('safe');
    const args = [SAFE + 0x700, SAFE + 0x800, length];
    o.set32(SAFE + 0x700 + 84, SAFE + 0x600);
    o.set8(SAFE + 0x600, 65);
    o.set8(SAFE + 0x601, 0);
    o.compare(1978, args, `1978 length=${length}`, 'edges');
  }
  for (const state of [0, 1, 5, 0xffffffff]) {
    o.reset('safe');
    const args = [SAFE + 0x600];
    o.set32(SAFE + 0x608, SAFE + 0x500);
    o.set32(133584, state);
    o.compare(1804, args, `1804 state=${state}`, 'edges');
  }
});
