import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createBlendBlitHooks, functionIds} from '../source/game/client/blend-blit.mjs';

let comparisons = 0, traps = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client blend-blit oracle comparisons: ${comparisons} total (${traps} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createBlendBlitHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset(kind) {
    bytes.fill(0xa5);
    set32(0, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    bytes.fill(0, SAFE + 0x300, SAFE + 0x900);
    for (let index = 0; index < 64; index++)
      set32(SAFE + 0x800 + index * 4, 0x10203040 + index * 0x05050505);
  }
  function prepare(id, args, kind, mode = 32) {
    const shift = kind === 'overlap' ? 4 : 0;
    const object = SAFE + 0x300 + shift;
    args[0] = object;
    set32(object, SAFE + 0x800);
    set32(object + 12, 32);
    set32(object + 20, SAFE + 0x600);
    set32(object + 24, 4);
    set32(object + 28, 4);
    set32(object + 32, 16);
    set32(object + 52, mode);
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
    if (expected.error) traps++;
    byKind[kind].comparisons++;
    if (expected.error) byKind[kind].traps++;
    comparisons++;
  }
  return {runtime, hooks, reset, prepare, compare, set32};
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

test('blend-blit exposes the original arities and replaces all four ids', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [2192, 2197, 2209, 2214]);
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function');
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length);
  }
});

test('blend-blit matches on safe, overlapping, zero, and boundary arguments', async () => {
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

test('blend-blit edge cases cover selector modes and row shapes', async () => {
  const o = await oracle();
  const dimensions = [[0, 1], [1, 1], [3, 2], [4, 4], [5, 3]];
  for (const id of functionIds) {
    for (const mode of [0, 16, 32, 48, 64, 80, 96, 112]) {
      for (const [width, rows] of dimensions) {
        o.reset('safe');
        const args = [SAFE + 0x300];
        o.prepare(id, args, 'safe', mode);
        o.set32(SAFE + 0x300 + 24, width);
        o.set32(SAFE + 0x300 + 28, rows);
        o.compare(id, args, `${id} mode=${mode} width=${width} rows=${rows}`, 'edges');
      }
    }
  }
});
