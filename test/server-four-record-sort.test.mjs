import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFourRecordSortHook, functionIds} from '../source/game/server/four-record-sort.mjs';

let comparisons = 0;
after(() => console.log(
  `server four-record sort oracle comparisons: ${comparisons} total; `
  + 'all permutations of six key sets plus random records'));

test('four-record sort network 159 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createFourRecordSortHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const base = 0x3f0000;
  const pointers = [base, base + 8, base + 16, base + 24];
  assert.equal(hook[159].length, runtime.exports.__fn159.length);

  function permutations(values) {
    if (values.length <= 1) return [values];
    const result = [];
    for (let index = 0; index < values.length; index++) {
      const rest = [...values.slice(0, index), ...values.slice(index + 1)];
      for (const tail of permutations(rest)) result.push([values[index], ...tail]);
    }
    return result;
  }

  function run(keys) {
    memory.fill(0xcc, base, base + 64);
    for (let index = 0; index < 4; index++) {
      memory[base + index * 8] = 0xa0 + index;
      view.setFloat32(base + index * 8 + 4, keys[index], true);
    }
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(159, ...pointers);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[159](...pointers);
    assert.equal(actual, expected, `${keys}: swap count`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `${keys}: memory`);
    assert.equal(runtime.stackPointer.value, stack, `${keys}: stack`);
    comparisons++;
  }

  const keySets = [
    [1, 2, 3, 4],
    [2, 2, 2, 2],
    [-1.5, -2.5, 0.5, 0.25],
    [NaN, 1, 2, 3],
    [Infinity, -Infinity, 0, 1],
    [1, Infinity, -0, NaN],
  ];
  for (const keys of keySets)
    for (const permutation of permutations(keys)) run(permutation);

  let state = 0x9e3779b9;
  for (let index = 0; index < 100; index++) {
    const keys = [];
    for (let slot = 0; slot < 4; slot++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      keys.push((state & 0xffff) / 128 - 256);
    }
    run(keys);
  }
});
