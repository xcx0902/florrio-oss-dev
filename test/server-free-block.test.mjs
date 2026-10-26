import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createFreeBlockHook, functionIds} from '../source/game/server/free-block.mjs';

let comparisons = 0;
after(() => console.log(
  `server free-block oracle comparisons: ${comparisons} total; `
  + 'small/tree bins, previous/next coalescing, top and dv paths'));

test('dlmalloc block free 286 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 16], construct: false});
  const hook = createFreeBlockHook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const initial = Buffer.from(memory);
  const initialStack = runtime.stackPointer.value;
  assert.equal(hook[286].length, runtime.exports.__fn286.length);

  function compare(sizes, order, probeSize = 48) {
    memory.set(initial);
    runtime.stackPointer.value = initialStack;
    const blocks = [];
    for (const size of sizes) {
      const pointer = runtime.call(16, size) >>> 0;
      blocks.push({chunk: (pointer - 8) >>> 0, size: view.getUint32(pointer - 4, true) & ~7});
    }
    const before = Buffer.from(memory);
    const stackBeforeFree = runtime.stackPointer.value;

    for (const index of order) runtime.call(286, blocks[index].chunk, blocks[index].size);
    const freed = Buffer.from(memory);
    const expectedPointer = runtime.call(16, probeSize);
    const expected = Buffer.from(memory);

    memory.set(before);
    runtime.stackPointer.value = stackBeforeFree;
    for (const index of order) hook[286](blocks[index].chunk, blocks[index].size);
    assert.equal(runtime.stackPointer.value, stackBeforeFree, 'stack pointer');
    for (let i = 0; i < freed.length; i++) {
      if (freed[i] !== memory[i])
        assert.fail(`post-free memory differs at ${i.toString(16)} for order [${order}] sizes [${sizes}]`);
    }
    const actualPointer = runtime.call(16, probeSize);
    for (let i = 0; i < expected.length; i++) {
      if (expected[i] !== memory[i]) {
        assert.fail(`memory differs at ${i.toString(16)} for order [${order}] sizes [${sizes}]`);
      }
    }
    assert.equal(actualPointer, expectedPointer, 'subsequent malloc pointer');
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

  // Small-bin and tree-bin coalescing across adjacent and non-adjacent blocks.
  const small = [24, 40, 80, 600];
  for (let i = 0; i < small.length; i++) compare(small, [i]);
  for (let i = 0; i + 1 < small.length; i++) compare(small, [i, i + 1]);
  compare(small, [0, 1, 2]);
  compare(small, [1, 2, 3]);
  compare(small, [0, 1, 2, 3]);
  compare(small, [3, 2, 1, 0]);
  compare(small, [0, 2]);
  compare(small, [1, 3]);
  for (const order of permutations([0, 1, 2, 3]).slice(0, 20)) compare(small, order);

  const large = [32, 56, 300, 700, 1600, 5000, 20000];
  for (let i = 0; i < large.length; i++) compare(large, [i]);
  for (let i = 0; i + 1 < large.length; i++) compare(large, [i, i + 1]);
  compare(large, [6, 5, 4, 3, 2, 1, 0]);
  compare(large, [0, 2, 4, 6]);
  compare(large, [1, 3, 5, 6]);
  compare(large, [3, 0, 5, 2]);
  compare(large, [2, 4], 3000);
  compare(large, [6], 1200);

  let state = 0x51f15e5d;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  for (let trial = 0; trial < 25; trial++) {
    const count = 3 + (random() % 6);
    const sizes = [];
    for (let i = 0; i < count; i++) {
      const bucket = random() % 5;
      sizes.push([24, 48, 96, 320, 1200][bucket] + (random() % 8) * 8);
    }
    const order = sizes.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = random() % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    compare(sizes, order);
  }
});
