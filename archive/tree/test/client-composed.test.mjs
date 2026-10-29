import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createComposedHooks, functionIds} from '../source/game/client/composed.mjs';
import {createClientMemoryFillHooks} from '../source/game/client/memory-fill.mjs';
import {createClientRuntimePrimitiveHooks} from '../source/game/client/runtime-primitives.mjs';
import {createClientClockHooks} from '../source/game/client/clock.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'edge']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client composed oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;

async function oracle() {
  let clockValid = 1, clockNow = 1000.25;
  const runtime = await loadOriginal('client', {
    functionIds,
    construct: false,
    imports: {a: {a: () => clockValid, c: () => clockNow}},
  });
  const memoryFill = createClientMemoryFillHooks(runtime);
  const primitives = createClientRuntimePrimitiveHooks(runtime);
  const clock = createClientClockHooks(runtime);
  const originalCall = runtime.call.bind(runtime);
  const recoveredCalls = {865: memoryFill[865], 363: primitives[363], 372: clock[372]};
  runtime.call = (id, ...args) => recoveredCalls[id]
    ? recoveredCalls[id](...args)
    : originalCall(id, ...args);
  const hooks = createComposedHooks(runtime);
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
    // Start the clock without latched static guards or an override.
    set8(7910224, 0); set8(7910225, 0);
    set8(7910220, 0); set8(7910221, 0);
    set8(7922328, 0); set8(7922329, 0);
    set8(7922312, 0);
    if (kind === 'zero' || kind === 'boundary') return;
    const shift = kind === 'overlap' ? 4 : 0;
    for (let index = 0; index < 8; index++) {
      const base = SAFE + index * 0x100 + shift;
      set8(base + 8, 1);          // 3830: timestamp record is valid
      set32(base + 16, 64);       // 1980: remaining capacity
      set32(base + 20, 0);        // 1980: current end offset
      set32(base + 144, 1);       // 4207: read the clock
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
  return {runtime, hooks, reset, compare, set8, set32};
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

test('composed functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('composed functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      o.compare(id, argumentsFor(arity, kind), `${id} ${kind}`, kind);
    }
  }
});

test('composed clock branches cover the invalid-record and skipped-read paths', async () => {
  const o = await oracle();
  o.reset('edge');
  const base = SAFE;
  o.set8(base + 8, 0);
  o.compare(3830, [base], '3830 invalid timestamp', 'edge');
  o.reset('edge');
  o.set32(base + 0x200 + 144, 0);
  o.compare(4207, [base, base + 0x100, base + 0x200], '4207 skipped clock', 'edge');
});
