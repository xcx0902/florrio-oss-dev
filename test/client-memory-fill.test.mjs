import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createClientMemoryFillHooks, functionIds} from '../source/game/client/memory-fill.mjs';

let comparisons = 0, trapComparisons = 0;
after(() => console.log(`fillMemory oracle comparisons: ${comparisons} total, ${trapComparisons} trapping`));

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [...functionIds, 368], construct: false});
  runtime.instance.exports.Nf();
  const hooks = createClientMemoryFillHooks(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer), limit = bytes.length;
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  function compareFull(pointer, value, count, label, id = 382) {
    const before = Buffer.from(bytes);
    const args = [pointer, value, count];
    const expected = invoke(() => runtime.call(id, ...args));
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    const actual = invoke(() => hooks[id](...args));
    assert.deepEqual(actual, expected, `${label}: result`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    if (expected.error) trapComparisons++;
    comparisons++;
  }
  function compare(pointer, value, count, label, id = 382) {
    const start = pointer >>> 0;
    const low = Math.max(0, start - 32), high = Math.min(limit, start + (count >>> 0) + 32);
    bytes.fill(0x5a, low, high);
    const expected = invoke(() => runtime.call(id, pointer, value, count));
    const expectedWindow = Buffer.from(bytes.subarray(low, high)), expectedStack = runtime.stackPointer.value;
    bytes.fill(0x5a, low, high);
    const actual = invoke(() => hooks[id](pointer, value, count));
    assert.deepEqual(actual, expected, `${label}: result`);
    assert.ok(Buffer.from(bytes.subarray(low, high)).equals(expectedWindow), `${label}: written window`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    if (expected.error) trapComparisons++;
    comparisons++;
  }
  return {runtime, hooks, bytes, compare, compareFull, storage: runtime.call(368, 4096)};
}

test('fillMemory preserves every widening threshold, alignment and byte value', async () => {
  const o = await oracle(), lengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 23, 24, 25, 26, 31, 32, 33, 63, 64, 65, 95, 96, 127, 128, 129, 255, 256, 257, 511, 512, 1024];
  o.bytes.fill(0xa7, o.storage - 32, o.storage + 1056);
  for (let alignment = 0; alignment < 8; alignment++)
    for (const length of lengths) {
      for (const value of [0, 1, 0x55, 0x7f, 0x80, 0xfe, 0xff, 0x100, 0x1234, -1])
        o.compare(o.storage + alignment, value, length, `alignment ${alignment}, length ${length}, value ${value}`);
      // Periodically compare all 64 MiB, not only the touched window.
      if ((alignment * lengths.length + length) % 257 === 0)
        o.compareFull(o.storage + alignment, 0xa5, length, `full checkpoint ${alignment}/${length}`);
    }
});

test('fillMemory preserves wraparound traps and writes made before the fault', async () => {
  const o = await oracle(), limit = o.bytes.length;
  const cases = [
    [-1, 1, 0], [0, -1, 0], [0, 0, -1], [0xffffffff, 7, 1], [0xfffffffe, 7, 2],
    [0xfffffffe, 7, 3], [0xfffffff0, 7, 0x20], [0x80000000, 7, 9],
    [limit - 1, 7, 1], [limit - 2, 7, 2], [limit - 4, 7, 4], [limit - 9, 7, 9],
    [limit - 64, 7, 64], [limit - 64, 7, 65], [limit - 256, 7, 257],
    [limit, 7, 1], [limit + 8, 7, 24], [-4, 7, 4], [-4, 7, 8],
  ];
  for (const [pointer, value, count] of cases)
    o.compareFull(pointer, value, count, `boundary ${pointer}/${value}/${count}`);
});

test('fillMemoryByte865 forwards count, value and pointer through the original argument order', async () => {
  const o = await oracle(), limit = o.bytes.length;
  const cases = [[0, 0, 0], [1, 1, 1], [4096, 2, 2], [4097, 3, 3], [4098, 8, 0x1234], [4100, 9, -1], [5000, 33, 0x55], [6000, 256, 0x80], [7000, 1024, 0xff], [limit - 8, 8, 7], [limit - 8, 9, 7], [-1, 0, 0]];
  for (const [pointer, count, value] of cases)
    o.compareFull(pointer, count, value, `865 ${pointer}/${count}/${value}`, 865);
});

test('fillMemory returns the original pointer and leaves stack untouched', async () => {
  const o = await oracle();
  for (const pointer of [0, 1, 4096, 0x7fffffff, -1, -4096]) {
    const expected = o.runtime.call(382, pointer, 0, 0);
    assert.equal(o.hooks[382](pointer, 0, 0), expected, `pointer ${pointer}`);
    assert.equal(o.hooks[865](pointer, 0, 0), o.runtime.call(865, pointer, 0, 0), `865 pointer ${pointer}`);
    comparisons++;
  }
});
