import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createPackedKeySortHook, functionIds, packedKeyOrder} from '../source/game/server/packed-key-sort.mjs';

let comparisons = 0;
after(() => console.log(
  `server packed-key sort oracle comparisons: ${comparisons} total; `
  + 'low-14-bit primary order with major tie-break'));

test('packed-key sort 252 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds, construct: false});
  const hook = createPackedKeySortHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const addresses = [0x510000, 0x510004, 0x510008, 0x51000c];
  assert.equal(hook[252].length, runtime.exports.__fn252.length);

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

  function check(keys) {
    keys.forEach((key, index) => view.setUint32(addresses[index], key, true));
    const before = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(252, ...addresses);
    const expectedMemory = Buffer.from(memory);
    memory.set(before);
    runtime.stackPointer.value = stack;
    const actual = hook[252](...addresses);
    assert.equal(actual, expected, `return for [${keys}]`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `memory for [${keys}]`);
    assert.equal(runtime.stackPointer.value, stack, 'stack');
    const sorted = keys.slice().sort((a, b) => packedKeyOrder(a) - packedKeyOrder(b));
    assert.deepEqual(addresses.map(address => view.getUint32(address, true)), sorted, 'sorted order');
    comparisons++;
  }

  const sets = [
    [0, 1, 2, 3],
    [3, 2, 1, 0],
    [0x00000001, 0x00004001, 0x00008001, 0x0000c001],
    [0x00004001, 0x00000001, 0x0000c001, 0x00008001],
    [0xffffffff, 0, 0x3fff, 0x4000],
    [0x00004005, 0x00000005, 0x00008005, 0x0000c005],
    [0x00004009, 0x00004003, 0x00000003, 0x00000009],
    [0xffffc000, 0x00003fff, 0x80000000, 0x7fffffff],
  ];
  for (const set of sets) {
    for (const keys of permutations(set)) check(keys);
  }

  let state = 0x6d2b79f5;
  for (let trial = 0; trial < 100; trial++) {
    const keys = [];
    for (let i = 0; i < 4; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      keys.push(state);
    }
    check(keys);
  }
});
