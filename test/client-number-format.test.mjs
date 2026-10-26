import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createNumberFormatHooks, functionIds} from '../source/game/client/number-format.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client number-format oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createNumberFormatHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set8 = (address, value) => view.setUint8(address, value);
  const set32 = (address, value) => view.setUint32(address, value, true);
  const setF32 = (address, value) => view.setFloat32(address, value, true);
  function reset(kind) {
    bytes.fill(0xa5);
    set32(0, 0);
    set32(7947488, 0);
    set32(7947492, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 24; index++) {
      set32(SAFE + index * 0x100 + shift + 8, 0x1234);
    }
  }
  function string(address, text) {
    bytes.set([...text].map(character => character.charCodeAt(0)), address);
    set8(address + text.length, 0);
  }
  function prepare(id, args, kind) {
    if (id === 2018) {
      const object = SAFE + 0x600;
      set32(args[1] + 144, object);
      setF32(object + 16, kind === 'overlap' ? -2.25 : 1.5);
      set32(args[1] + 24, 3);
      set32(args[1] + 28, -2);
    } else if (id === 848) {
      set32(7947488, SAFE + 0x500);
      set32(7947492, SAFE + 0x500);
      args[0] = 3;
    } else if (id === 2061) {
      const object = SAFE + 0x600;
      set32(args[1] + 76, object);
      set32(object + 16, 100);
      set32(object + 20, 8);
      set32(args[1] + 4, kind === 'overlap' ? 0x10000000 : 0x32595559);
      set32(args[2], 2);
      set32(args[2] + 4, 5);
    } else if (id === 570) {
      args[0] = kind === 'overlap' ? 42n : 1234567890123n;
      args[1] = SAFE + 0x100;
    } else if (id === 524) {
      args[0] = SAFE + 0x200;
      args[1] = SAFE + 0x300;
      string(args[1], 'abc');
      args[2] = 0;
      args[3] = kind === 'overlap' ? 0x4a08 : 0;
    } else if (id === 712) {
      args[0] = SAFE + 0x700;
      set32(args[0] + 4, args[2]);
      if (kind === 'overlap') {
        set32(args[0] + 16, args[1]);
        set32(args[0] + 24, 2);
        set32(args[0] + 36, 7);
      }
    } else if (id === 571) {
      const p0 = args[0], p1 = args[1];
      set32(p0, 0x12345678); set32(p1, kind === 'overlap' ? 0x12345778 : 0x12345678);
      set32(p0 + 4, 10); set32(p1 + 4, kind === 'overlap' ? 11 : 10);
      set32(p0 + 8, 20); set32(p1 + 8, 20);
      set32(p0 + 12, 30); set32(p1 + 12, 30);
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
  return {runtime, hooks, reset, prepare, compare, set8, set32, setF32, string};
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

test('number-format functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('number-format functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      const args = argumentsFor(arity, kind);
      if (id === 570 && kind === "zero") args[0] = 0n;
      if (id === 570 && kind === "boundary") args[0] = 18446744073709551615n;
      if (kind === 'safe' || kind === 'overlap') o.prepare(id, args, kind);
      if (id === 848 && kind === 'boundary') args[0] = 0x40000000;
      o.compare(id, args, `${id} ${kind}`, kind);
    }
  }
});

test('number-format edge cases cover u64 lengths, flags, parser transitions and key fields', async () => {
  const o = await oracle();
  for (const value of [0n, 9n, 10n, 4294967295n, 4294967296n, 42949672959n, 18446744073709551615n]) {
    o.reset('safe');
    o.compare(570, [value, SAFE + 0x100], `570 ${value}`, 'edges');
  }
  for (const flags of [0, 2048, 512, 2048 | 512, 64, 8, 8 | 16384, 74]) {
    o.reset('safe');
    const args = [SAFE + 0x200, SAFE + 0x300, 0, flags];
    o.string(SAFE + 0x300, 'x');
    o.compare(524, args, `524 flags=${flags}`, 'edges');
  }
  for (const [existing, state, p3] of [[0, 0, 1], [SAFE + 0x100, 2, 3], [SAFE + 0x104, 2, 3], [999, 1, 0]]) {
    o.reset('safe');
    const args = [SAFE + 0x700, SAFE + 0x100, SAFE + 0x700 + 4, p3];
    o.set32(args[0] + 4, args[2]);
    o.set32(args[0] + 16, existing);
    o.set32(args[0] + 24, state);
    o.set32(args[0] + 36, 7);
    o.compare(712, args, `712 existing=${existing} state=${state}`, 'edges');
  }
  for (const [field, delta] of [[4, 1], [8, 5], [-1, 0x100], [-1, 0x10000], [12, 9]]) {
    o.reset('safe');
    const args = [SAFE, SAFE + 0x100];
    o.set32(SAFE, 0x12345678); o.set32(SAFE + 0x100, 0x12345678);
    o.set32(SAFE + 4, 10); o.set32(SAFE + 0x104, 10);
    o.set32(SAFE + 8, 20); o.set32(SAFE + 0x108, 20);
    o.set32(SAFE + 12, 30); o.set32(SAFE + 0x10c, 30);
    if (field === -1) o.set32(SAFE + 0x100, 0x12345678 ^ delta);
    else o.set32(SAFE + 0x100 + field, (field === 4 ? 10 : field === 8 ? 20 : 30) + delta);
    o.compare(571, args, `571 field=${field} delta=${delta}`, 'edges');
  }
  for (const count of [0, 1, 2]) {
    o.reset('safe');
    o.set32(7947488, SAFE + 0x500);
    o.set32(7947492, SAFE + 0x500);
    o.compare(848, [count], `848 count=${count}`, 'edges');
  }
  for (const tag of [0, 0x10000001, 844715353, 1498831189, 1431918169, 7]) {
    o.reset('safe');
    const args = [SAFE, SAFE + 0x100, SAFE + 0x200, SAFE + 0x300, SAFE + 0x400];
    o.set32(SAFE + 0x100 + 76, SAFE + 0x600);
    o.set32(SAFE + 0x600 + 16, 100);
    o.set32(SAFE + 0x600 + 20, 8);
    o.set32(SAFE + 0x100 + 4, tag);
    o.set32(SAFE + 0x200, 2);
    o.set32(SAFE + 0x200 + 4, 5);
    o.compare(2061, args, `2061 tag=${tag}`, 'edges');
  }
  for (const [scaleA, scaleB] of [[1.5, 3], [-2.25, -2], [1e30, 3], [0, 0]]) {
    o.reset('safe');
    const args = [0, SAFE + 0x100, SAFE + 0x300, SAFE + 0x400];
    o.set32(SAFE + 0x100 + 144, SAFE + 0x600);
    o.setF32(SAFE + 0x600 + 16, scaleA);
    o.set32(SAFE + 0x100 + 24, scaleB);
    o.set32(SAFE + 0x100 + 28, -1);
    o.compare(2018, args, `2018 scale=${scaleA},${scaleB}`, 'edges');
  }
});
