import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFiveKeySortHook, functionIds} from '../source/game/server/packed-key-sort-five.mjs';

let comparisons = 0;
after(() => console.log(
  `server five-key packed sort oracle comparisons: ${comparisons} total; `
  + 'all permutations and deterministic random keys'));

test('five-key packed sort 253 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [253, 252], construct: false});
  const hook = createFiveKeySortHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const base = 0x410000;
  const slots = [0, 1, 2, 3, 4].map(index => base + index * 16);
  assert.equal(hook[253].length, runtime.exports.__fn253.length);
  function check(keys) {
    memory.fill(0x6d, base - 64, base + 384);
    for (let i = 0; i < 5; i++) view.setUint32(slots[i], keys[i] >>> 0, true);
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(253, ...slots);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[253](...slots);
    assert.equal(actual, expected, `return for [${keys}]`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `memory for [${keys}]`);
    assert.equal(runtime.stackPointer.value, stack, 'stack');
    comparisons++;
  }
  function permutations(values) {
    const results = [];
    function visit(current, remaining) {
      if (!remaining.length) { results.push(current); return; }
      for (let i = 0; i < remaining.length; i++)
        visit([...current, remaining[i]], [...remaining.slice(0, i), ...remaining.slice(i + 1)]);
    }
    visit([], values);
    return results;
  }
  for (const set of [
    [0, 1, 2, 3, 4],
    [4, 3, 2, 1, 0],
    [0x4001, 2, 0x8001, 0xffffffff, 0],
    [0x3fff, 0x7fff, 0xbfff, 0xffff, 0x13fff],
  ]) for (const keys of permutations(set)) check(keys);
  let state = 0x51ed270b;
  for (let trial = 0; trial < 100; trial++) {
    const keys = [];
    for (let i = 0; i < 5; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      keys.push(state);
    }
    check(keys);
  }
});
