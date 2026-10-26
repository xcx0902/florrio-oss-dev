import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRecordHooks, functionIds} from '../source/game/client/records.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client record oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createRecordHooks(runtime);
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
    for (let index = 0; index < 10; index++) {
      const base = SAFE + index * 0x100 + shift;
      set32(base + 8, 0x1234);
    }
  }
  function prepare(id, args, kind) {
    if (id === 440) {
      set32(7944468, SAFE + 0x900);
      set32(SAFE + 0x900, 1);
      set32(SAFE + 0x908, SAFE + 0x920);
      set32(SAFE + 0x920, 0);
      set32(SAFE + 0x924, 0x1234);
    } else if (id === 605) {
      set32(132100, 0xffffffff);
      set8(7944472, 0);
    } else if (id === 891) {
      const record = SAFE + 0x900;
      set32(args[1], record);
      set32(record, SAFE + 0xa00);
      set32(record + 4, 10);
      set32(args[1] + 4, SAFE + 0xb00);
      for (let index = 0; index < 10; index++) set8(SAFE + 0xa00 + index, index + 1);
      for (let index = 0; index < 25; index++) set8(SAFE + 0xb00 + index, index * 3);
    } else if (id === 821) {
      set32(7948176, 123456789);
    } else if (id === 1135) {
      set32(args[0], 0);
      set8(args[0] + 74, 5);
      set32(args[0] + 44, SAFE + 0x900);
      set32(args[0] + 48, 16);
    } else if (id === 711) {
      if (kind === 'overlap') {
        set32(args[0] + 16, args[1]);
        set32(args[0] + 24, 2);
        set32(args[0] + 36, 5);
      } else {
        set32(args[0] + 16, 0);
      }
    } else if (id === 1940) {
      for (let index = 0; index < 4; index++) {
        set32(args[1] + index * 4, [1, 5, 9, 13][index]);
        set32(args[3] + index * 4, [1, 5, 8, 13][index]);
      }
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
  return {runtime, hooks, reset, prepare, compare};
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

test('record functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('record functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
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
