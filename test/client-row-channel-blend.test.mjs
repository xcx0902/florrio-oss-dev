import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRowChannelBlendHooks, functionIds} from '../source/game/client/row-channel-blend.mjs';

let comparisons = 0;
after(() => console.log(
  `client row-channel-blend 2185 oracle comparisons: ${comparisons} total (0 trapping); `
  + 'selector 0/16/64 and pass-through modes over variable rows'));

const SAFE = 0x100000;
const DESCRIPTOR = SAFE + 0x300;
const DESTINATION = SAFE + 0x600;
const SOURCE = SAFE + 0x800;

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds, construct: false});
  const hooks = createRowChannelBlendHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const set32 = (address, value) => view.setUint32(address, value, true);
  function reset({width = 4, rows = 3, selector = 0} = {}) {
    bytes.fill(0, SAFE, SAFE + 0x1000);
    let state = 0x10203040;
    for (let index = 0; index < 64; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      set32(DESTINATION + index * 4, state);
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      set32(SOURCE + index * 4, state);
    }
    set32(DESCRIPTOR, SOURCE);
    set32(DESCRIPTOR + 12, 32);
    set32(DESCRIPTOR + 20, DESTINATION);
    set32(DESCRIPTOR + 24, width);
    set32(DESCRIPTOR + 28, rows);
    set32(DESCRIPTOR + 32, 24);
    set32(DESCRIPTOR + 52, selector);
    return [DESCRIPTOR];
  }
  function compare(args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected;
    try { expected = {result: runtime.call(2185, ...args)}; }
    catch (error) { expected = {error: [error.constructor.name, error.message]}; }
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual;
    try { actual = {result: hooks[2185](...args)}; }
    catch (error) { actual = {error: [error.constructor.name, error.message]}; }
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    comparisons++;
  }
  return {runtime, hooks, reset, compare};
}

test('row-channel-blend 2185 keeps the original arity and id', async () => {
  const o = await oracle();
  assert.deepEqual([...functionIds], [2185, 2203]);
  assert.equal(o.hooks[2185].length, o.runtime.exports.__fn2185.length);
});

test('row-channel-blend 2185 matches every selector class', async () => {
  const o = await oracle();
  for (const selector of [0, 16, 64, 1, 15, 17, 32, 48, 80, 112, 128, 255, -1]) {
    o.compare(o.reset({selector}), `selector ${selector}`);
  }
});

test('row-channel-blend 2185 matches widths, rows and strides', async () => {
  const o = await oracle();
  for (const width of [0, 1, 2, 3, 5]) {
    for (const rows of [0, 1, 2, 3]) {
      for (const selector of [0, 16, 64, 1]) {
        o.compare(o.reset({width, rows, selector}), `w${width} r${rows} s${selector}`);
      }
    }
  }
});

test('row-channel-blend 2185 matches deterministic random descriptors', async () => {
  const o = await oracle();
  let state = 0x9e3779b9;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const selectors = [0, 16, 32, 64, 1, 48, 80, 96, 112, 128, 255];
  for (let row = 0; row < 60; row++) {
    const width = next() % 5;
    const rows = next() % 4;
    const args = o.reset({width, rows, selector: selectors[next() % selectors.length]});
    const view = new DataView(o.runtime.memory.buffer);
    view.setUint32(DESCRIPTOR + 32, 16 + (next() % 16), true);
    view.setUint32(DESCRIPTOR + 12, 16 + (next() % 16), true);
    o.compare(args, `random ${row}`);
  }
});
