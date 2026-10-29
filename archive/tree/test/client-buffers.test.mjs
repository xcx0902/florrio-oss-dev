import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createBufferHooks, functionIds} from '../source/game/client/buffers.mjs';

let comparisons = 0, trapComparisons = 0;
const byKind = Object.fromEntries(['safe', 'overlap', 'zero', 'boundary', 'widths']
  .map(kind => [kind, {comparisons: 0, traps: 0}]));
after(() => console.log(
  `client buffer oracle comparisons: ${comparisons} total (${trapComparisons} trapping); `
  + Object.entries(byKind).map(([kind, row]) => `${kind} ${row.comparisons}/${row.traps} trapping`).join(', ')));

const SAFE = 0x100000;
const CLASS_SCAN = new Set([1796, 1797]);

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createBufferHooks(runtime);
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
    for (let index = 0; index < 8; index++) {
      const base = SAFE + index * 0x100 + shift;
      set32(base + 8, 0x1234);
    }
  }
  function prepare(id, args, kind) {
    if (id === 365) {
      bytes.set([97, 98, 99, 0], args[0]);
      bytes.set([97, 98, 100, 0], args[1]);
    } else if (id === 523 || id === 525) {
      if (kind === 'overlap') {
        set8(args[0] + 11, 0x80);
        set32(args[0], SAFE + 0x900);
        set32(args[0] + 4, 5);
      } else {
        set8(args[0] + 11, 3);
      }
    } else if (id === 1796 || id === 1797) {
      set32(args[2], 65);
      set32(args[2] + 4, 66);
      set32(args[2] + 8, 200);
    } else if (id === 1799) {
      set32(args[1], 65);
      set32(args[1] + 4, 200);
    } else if (id === 1938) {
      set32(args[1], 0x01234567);
      set32(args[1] + 4, 0x89abcdef);
    } else if (id === 1941) {
      set8(args[1], 0x80);
      set8(args[1] + 1, 0x7f);
      set8(args[1] + 2, 0xff);
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

function argumentsFor(id, arity, kind) {
  const values = [];
  for (let index = 0; index < arity; index++) {
    if (kind === 'safe') values.push(SAFE + index * 0x100);
    else if (kind === 'overlap') values.push(SAFE + index * 0x100 + 4);
    else if (kind === 'boundary') values.push(0x3ffffff - index);
    else values.push(0);
  }
  if (id === 914) {
    values[1] = 0;
    values[2] = BigInt.asIntN(64, BigInt(values[2]));
  }
  if (CLASS_SCAN.has(id)) values[1] = 0xffff;
  return values;
}

test('buffer functions expose the original arities and replace every selected id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds].sort((a, b) => a - b),
    [...new Set(functionIds)].sort((a, b) => a - b));
  for (const id of functionIds) {
    assert.equal(typeof o.hooks[id], 'function', `hook ${id}`);
    assert.equal(o.hooks[id].length, o.runtime.exports[`__fn${id}`].length, `arity ${id}`);
  }
});

test('buffer functions match the original on safe, overlapping, zero, and boundary arguments', async () => {
  const o = await oracle();
  for (const id of functionIds) {
    const arity = o.runtime.exports[`__fn${id}`].length;
    for (const kind of ['safe', 'overlap', 'zero', 'boundary']) {
      o.reset(kind);
      const args = argumentsFor(id, arity, kind);
      if (kind === 'safe' || kind === 'overlap') o.prepare(id, args, kind);
      o.compare(id, args, `${id} ${kind}`, kind);
    }
  }
});

test('914 stores every selected width and ignores the other selectors', async () => {
  const o = await oracle();
  for (const selector of [-2, -1, 0, 1, 2, 3, 4]) {
    o.reset('safe');
    o.compare(914, [SAFE, selector, 0x0123456789abcdefn], `914 selector ${selector}`, 'widths');
  }
});
