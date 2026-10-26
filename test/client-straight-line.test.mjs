import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createStraightLineHooks, functionIds} from '../source/game/client/straight-line.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client straight-line oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const BIGINT_ARGUMENTS = new Map([[918, [1, 2, 3, 4]]]);
const SAFE = 0x100000;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createStraightLineHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset(kind) {
    bytes.fill(0xa5);
    if (kind === 'zero' || kind === 'boundary') return;
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 8; index++) {
      const base = SAFE + index * 0x100 + shift;
      // 2077 reads p0+436; 2078 reads p1+76 and the object behind it. 3852
      // reads p0+28 and p0+32. 418/889 read the third/second argument.
      set32(base, 5);
      set32(base + 4, 3);
      set32(base + 16, 8);
      set32(base + 20, SAFE + 0xb000);
      set32(base + 28, SAFE + 0x6000);
      set32(base + 32, SAFE + 0x7000);
      set32(base + 76, SAFE + 0x9000);
      set32(base + 80, SAFE + 0x9000);
      set32(base + 436, SAFE + 0x8000);
      set32(base + 440, SAFE + 0x8000);
    }
    // Component 2078 reads: meta pointer, stride and base pointer.
    set32(SAFE + 0x9000 + 4, SAFE + 0xa000);
    set32(SAFE + 0x9000 + 16, 8);
    set32(SAFE + 0x9000 + 20, SAFE + 0xb000);
    view.setUint8(SAFE + 0xa000 + 9, 3);
    // 2077 stores a selected word at the component pointer.
    set32(SAFE + 0x8000 + 4, SAFE + 0xc000);
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
    else if (kind === 'overlap') values.push(SAFE + index * 0x100 + 4);
    else if (kind === 'boundary') values.push(0x3ffffff - index);
    else values.push(0);
  }
  for (const index of BIGINT_ARGUMENTS.get(id) ?? []) {
    if (kind === 'safe') values[index] = 0x0123456789abcdefn + BigInt(index * 0x1111);
    else if (kind === 'overlap') values[index] = -0x123456789abcdefn - BigInt(index);
    else if (kind === 'boundary') values[index] = -1n - BigInt(index);
    else values[index] = 0n;
  }
  return values;
}

test('straight-line functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('straight-line functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      o.compare(id, argumentsFor(id, arity, kind), `${id} ${kind}`, kind);
    }
  }
});
