import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createLeafHooks, functionIds} from '../source/game/client/leaf-functions.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client leaf oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const BIGINT_ARGUMENT = new Map([[1968, 2], [1985, 1]]);
const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createLeafHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  function reset(safe) {
    bytes.fill(0xa5);
    if (!safe) return;
    // 2356/2359 dereference [p0+4], and 2324 dereferences [p0+96].
    for (let index = 0; index < 8; index++) {
      const base = SAFE + index * 0x100;
      view.setUint32(base + 4, SAFE + 0x4000, true);
      view.setUint32(base + 96, SAFE + 0x5000, true);
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
  return {runtime, hooks, bytes, reset, compare};
}

function argumentsFor(id, arity, kind) {
  const values = [];
  for (let index = 0; index < arity; index++) {
    if (kind === 'safe') values.push(SAFE + index * 0x100);
    else if (kind === 'overlap') values.push(SAFE + index * 4);
    else if (kind === 'boundary') values.push(0x3ffffff - index);
    else values.push(0);
  }
  const bigintIndex = BIGINT_ARGUMENT.get(id);
  if (bigintIndex !== undefined) {
    values[bigintIndex] = kind === 'boundary' ? -1n : 0x0123456789abcdefn;
  }
  return values;
}

test('leaf functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('leaf functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.hooks[id].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind === 'safe' || kind === 'overlap');
      o.compare(id, argumentsFor(id, arity, kind), `${id} ${kind}`, kind);
    }
  }
});
