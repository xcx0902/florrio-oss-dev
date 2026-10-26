import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createRecordSortHook, functionIds} from '../source/game/server/record-sort.mjs';

let comparisons = 0;
after(() => console.log(
  `server record-sort oracle comparisons: ${comparisons} total; `
  + 'exhaustive small permutations and random larger ranges'));

test('record sort 385 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [385, 159], construct: false});
  const hook = createRecordSortHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const base = 0x420000;
  assert.equal(hook[385].length, runtime.exports.__fn385.length);

  function check(keys) {
    const end = base + keys.length * 8;
    memory.fill(0xa5, base - 64, base + 512);
    for (let i = 0; i < keys.length; i++) {
      view.setUint8(base + i * 8, 0x30 + i);
      view.setUint8(base + i * 8 + 1, 0x11 + i);
      view.setUint8(base + i * 8 + 2, 0x22 + i);
      view.setUint8(base + i * 8 + 3, 0x33 + i);
      view.setFloat32(base + i * 8 + 4, keys[i], true);
    }
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(385, base, end);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[385](base, end);
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
    [0, 1, 2, 3],
    [3, 2, 1, 0],
    [2, 2, 1, 3],
    [-1, 0.5, -2, 4],
    [Infinity, -Infinity, 0, 1],
    [NaN, 0, 1, 2],
  ]) {
    for (const keys of permutations(set)) check(keys);
  }
  for (let size = 0; size <= 6; size++) {
    for (const keys of permutations(Array.from({length: size}, (_, i) => size - i - 1)))
      check(keys);
  }
  for (const keys of [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
    [0, 1, 2, 3, 4, 5, 11, 10, 9, 8, 7, 6],
    [5, 6, 7, 8, 9, 10, 11, 4, 3, 2, 1, 0],
    Array.from({length: 20}, (_, i) => i),
    Array.from({length: 20}, (_, i) => 19 - i),
    [0, 1, 2, 3, 4, 5, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [NaN, NaN, 1, -1, Infinity, -Infinity, 2, 2, 3, 3],
  ]) check(keys);

  let state = 0x9e3779b9;
  for (let trial = 0; trial < 60; trial++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const size = 7 + (state % 14);
    const keys = [];
    for (let i = 0; i < size; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      keys.push((state % 7) - 3);
    }
    check(keys);
  }
});
