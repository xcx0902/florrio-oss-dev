import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createAffineSamplerHooks, functionIds} from '../source/game/client/affine-sampler.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edges']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client affine-sampler oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createAffineSamplerHooks(runtime);
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
      set32(SAFE + 0x800 + index * 4, 0x10203040 + index * 0x01010101);
  }
  function prepare(id, args, kind) {
    const shift = kind === 'overlap' ? 4 : 0;
    const object = SAFE + 0x300 + shift;
    args[0] = object;
    set32(object, SAFE + 0x800);
    set32(object + 4, 4);
    set32(object + 8, 4);
    set32(object + 12, 32);
    set32(object + 16, 0);
    set32(object + 20, SAFE + 0x600);
    set32(object + 24, 4);
    set32(object + 28, 4);
    set32(object + 32, 16);
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

test('affine-sampler functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b), [663, 743, 965, 966, 967, 968, 2108, 2113, 2129, 2133, 2146, 2150, 2167, 2188, 2204]);
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('affine-sampler functions match on safe, overlapping, zero, and boundary arguments', async () => {
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

test('affine-sampler edge cases cover steps, sizes and divide-by-zero', async () => {
  const o = await oracle();
  const dimensions = [[1, 1], [1, 3], [2, 2], [3, 3], [4, 4], [5, 3], [4, 0], [0, 4]];
  for (const id of functionIds) {
    for (const [width, rows] of dimensions) {
      for (const step of [1, 2, 4, 7]) {
        o.reset('safe');
        const args = [SAFE + 0x300];
        o.set32(SAFE + 0x300, SAFE + 0x800);
        o.set32(SAFE + 0x300 + 4, step);
        o.set32(SAFE + 0x300 + 8, step);
        o.set32(SAFE + 0x300 + 12, 32);
        o.set32(SAFE + 0x300 + 20, SAFE + 0x600);
        o.set32(SAFE + 0x300 + 24, width);
        o.set32(SAFE + 0x300 + 28, rows);
        o.set32(SAFE + 0x300 + 32, 24);
        o.compare(id, args, `${id} width=${width} rows=${rows} step=${step}`, 'edges');
      }
    }
  }
});
