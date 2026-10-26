import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTextSupportHooks, functionIds} from '../source/game/client/text-support.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client text-support oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createTextSupportHooks(runtime);
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
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 24; index++) {
      set32(SAFE + index * 0x100 + shift + 8, 0x1234);
    }
  }
  function string(address, text) {
    bytes.set([...text].map(character => character.charCodeAt(0)), address);
    set8(address + text.length, 0);
  }
  function prepare1955(id, args, kind) {
    const object = args[0];
    set32(object + 24, 3);
    set32(object + 44, 5);
    set8(object + 48, kind === 'overlap' ? 8 : 0);
    set32(object + 16, 20);
    set32(object + 12, SAFE + 0x500);
    set32(object + 8, SAFE + 0x520);
    if (kind === 'overlap') set32(object + 44, 30);
    set8(SAFE + 0x500, 0x5a);
  }
  function prepare(id, args, kind) {
    if (id === 378) string(args[0], 'hello');
    else if (id === 464) {
      set32(args[2] + 4, kind === 'overlap' ? 16 : 32);
      bytes.set(kind === 'overlap' ? [43, 53, 0] : [49, 50, 0], args[0]);
    } else if (id === 545) {
      string(args[0], kind === 'overlap' ? '+45' : ' -123');
    } else if (id === 769) {
      string(args[0], 'abc');
      string(args[1], kind === 'overlap' ? 'abd' : 'abc');
    } else if (id === 911) {
      const values = [1, 3, 5, 7];
      for (let index = 0; index < values.length; index++) set32(args[0] + index * 4, values[index]);
      set32(args[2], kind === 'overlap' ? 0 : 4);
    } else if (id === 1943) {
      for (let index = 0; index < 3; index++) {
        set8(args[1] + index, [1, 2, 3][index]);
        set8(args[3] + index, [1, kind === 'overlap' ? 9 : 2, 3][index]);
      }
    } else if (id === 1955) prepare1955(id, args, kind);
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

test('text functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('text functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
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

test('text edge cases cover prefix, decimal, bounded compare and stream branches', async () => {
  const o = await oracle();
  for (const [text, flags] of [['+5', 16], ['-5', 16], ['0x1f', 16], ['0X1f', 16], ['12', 16], ['12', 0]]) {
    o.reset('safe');
    const args = [SAFE, SAFE + 0x100, SAFE + 0x300];
    o.set32(SAFE + 0x304, flags);
    for (let index = 0; index < text.length; index++) o.set8(SAFE + index, text.charCodeAt(index));
    o.set8(SAFE + text.length, 0);
    o.compare(464, args, `464 ${text} flags=${flags}`, 'edges');
  }
  for (const text of ['0', '-0', '+7', ' 42']) {
    o.reset('safe');
    const args = [SAFE];
    for (let index = 0; index < text.length; index++) o.set8(SAFE + index, text.charCodeAt(index));
    o.set8(SAFE + text.length, 0);
    o.compare(545, args, `545 ${text}`, 'edges');
  }
  for (const count of [0, 1, 2]) {
    o.reset('safe');
    const args = [SAFE, SAFE + 0x100, count];
    o.prepare(769, args, 'safe');
    o.compare(769, args, `769 count=${count}`, 'edges');
  }
  for (const target of [0, 1, 4, 7, 9]) {
    o.reset('safe');
    const args = [SAFE, SAFE + 16, SAFE + 0x200];
    o.prepare(911, args, 'safe');
    o.set32(SAFE + 0x200, target);
    o.compare(911, args, `911 target=${target}`, 'edges');
  }
});
