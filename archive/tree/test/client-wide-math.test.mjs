import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createWideMathHooks, functionIds} from '../source/game/client/wide-math.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'shifts', 'multiply']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client wide-math oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;
const WIDE = 0x0123456789abcdefn;
const WIDE_HIGH = 0xfedcba9876543210n;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createWideMathHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  function reset() { bytes.fill(0xa5); }
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
  return {runtime, hooks, reset, compare};
}

function argumentsFor(id, arity, kind) {
  const values = [];
  for (let index = 0; index < arity; index++) values.push(0);
  values[0] = kind === 'safe' ? SAFE
    : kind === 'overlap' ? SAFE + 4
      : kind === 'boundary' ? 0x3ffffff : 0;
  if (id === 434) {
    values[1] = kind === 'zero' || kind === 'boundary' ? 0n : WIDE;
    values[2] = kind === 'zero' || kind === 'boundary' ? 0n : WIDE_HIGH;
    values[3] = kind === 'zero' || kind === 'boundary' ? 0n : -1n;
    values[4] = kind === 'zero' || kind === 'boundary' ? 0n : 0x1111222233334444n;
  } else {
    values[1] = kind === 'zero' || kind === 'boundary' ? 0n : WIDE;
    values[2] = kind === 'zero' || kind === 'boundary' ? 0n : WIDE_HIGH;
    values[3] = kind === 'safe' ? 13
      : kind === 'overlap' ? 67
        : kind === 'boundary' ? 0x3ffffff : 0;
  }
  return values;
}

test('wide-math functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('wide-math functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset();
      o.compare(id, argumentsFor(id, arity, kind), `${id} ${kind}`, kind);
    }
  }
});

test('128-bit shifts match every shift-count class and the multiply matches wide edge products', async () => {
  const o = await oracle();
  const shifts = [0, 1, 2, 31, 32, 33, 63, 64, 65, 96, 127, 128, 129, 192, 255, -1, 0x7fffffff];
  for (const id of [442, 541]) {
    for (const amount of shifts) {
      o.reset();
      o.compare(id, [SAFE, WIDE, WIDE_HIGH, amount], `${id} shift ${amount}`, 'shifts');
    }
  }
  for (const [low, high, lowB, highB] of [
    [-1n, -1n, -1n, -1n],
    [0xffffffffffffffffn, 0n, 0xffffffffffffffffn, 0n],
    [0n, 0xffffffffffffffffn, 1n, 0n],
  ]) {
    o.reset();
    o.compare(434, [SAFE, low, high, lowB, highB], `434 edge ${low},${high}`, 'multiply');
  }
});
