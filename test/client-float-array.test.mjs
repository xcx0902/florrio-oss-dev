import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFloatArrayHooks, functionIds} from '../source/game/client/float-array.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client float-array oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;
const dependencies = [363, 365, 442, 463, 571, 913];

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, ...dependencies], construct: false});
  const hooks = createFloatArrayHooks(runtime);
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
    if (kind === 'zero' || kind === 'boundary') return;
    bytes.fill(0, SAFE + 0x300, SAFE + 0x800);
    void view;
  }
  function prepare(id, args, kind) {
    if (id === 468) {
      args[0] = SAFE + 0x200;
      args[1] = kind === 'overlap' ? -7 : 0x12345678;
    } else if (id === 509) {
      args[0] = SAFE + 0x200;
      args[1] = kind === 'overlap' ? -2.5 : 1.5;
    } else if (id === 732) {
      args[0] = SAFE + 0x400;
      args[1] = kind === 'overlap' ? 2 : 3;
      args[2] = SAFE + 0x300;
      set32(SAFE + 0x300, 0);
      set32(SAFE + 0x304, 20);
      set32(SAFE + 0x308, 40);
      set32(SAFE + 0x30c, 60);
    } else if (id === 1768) {
      args[0] = SAFE + 0x600;
      args[1] = SAFE + 0x300;
      args[2] = SAFE + 0x200;
      args[3] = 7;
      args[4] = 0;
      set32(args[0] + 0, SAFE + 0x700);
      set32(args[0] + 4, SAFE + 0x700);
      set32(args[0] + 8, kind === 'overlap' ? SAFE + 0x704 : SAFE + 0x700);
      set32(SAFE + 0x700 + 4, SAFE + 0x700);
      set32(args[1] + 4, args[2]);
      set32(args[1] + 8, SAFE + 0x700);
      set32(args[1] + 16, args[2]);
      set32(args[1] + 20, args[2]);
      set32(args[1] + 24, 2);
      set32(args[1] + 28, 0);
      set32(args[1] + 36, 1);
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

test('float-array functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('float-array functions match on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      const args = argumentsFor(arity, kind);
      if (kind === 'safe' || kind === 'overlap') {
        o.prepare(id, args, kind);
      } else if (id === 509) {
        args[1] = kind === 'zero' ? 0 : Infinity;
      } else if (id === 732) {
        if (kind === 'zero') args[1] = 0;
        else args[1] = -1;
      }
      o.compare(id, args, `${id} ${kind}`, kind);
    }
  }
});

test('float-array edge cases cover signs, exponents and parser states', async () => {
  const o = await oracle();
  for (const value of [1, -1, 0, 0x7fffffff, -0x80000000, -123456]) {
    o.reset('safe');
    o.compare(468, [SAFE + 0x200, value], `468 ${value}`, 'edges');
  }
  for (const value of [0, -0, 1, -1, 0.5, 1e-310, 2 ** 1023, Infinity, -Infinity, NaN]) {
    o.reset('safe');
    o.compare(509, [SAFE + 0x200, value], `509 ${value}`, 'edges');
  }
  for (const count of [1, 2, 3, 4]) {
    o.reset('safe');
    o.set32(SAFE + 0x300, 0);
    o.set32(SAFE + 0x304, 20);
    o.set32(SAFE + 0x308, 40);
    o.set32(SAFE + 0x30c, 60);
    o.compare(732, [SAFE + 0x400, count, SAFE + 0x300], `732 count=${count}`, 'edges');
  }
  for (const [label, second] of [['equal', 0], ['different', 4]]) {
    for (const p3 of [0, 1, 2]) {
      o.reset('safe');
      const args = [SAFE + 0x600, SAFE + 0x300, SAFE + 0x200, p3, 0];
      o.set32(SAFE + 0x600, SAFE + 0x700);
      o.set32(SAFE + 0x604, SAFE + 0x700);
      o.set32(SAFE + 0x608, SAFE + 0x700 + second);
      o.set32(SAFE + 0x704, SAFE + 0x700);
      o.set32(SAFE + 0x700 + 4, SAFE + 0x700);
      o.compare(1768, args, `1768 ${label} target=${p3}`, 'edges');
    }
  }
});
