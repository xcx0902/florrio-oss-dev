import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createEntityRecordHooks, functionIds} from '../source/game/client/entity-record.mjs';

let comparisons = 0, trapComparisons = 0;
after(() => console.log(
  `entity-record oracle comparisons: ${comparisons} total (${trapComparisons} trapping)`));

const COUNT_SAMPLES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17, 31, 32, 33, 63, 64, 65,
  127, 128, 129, 254, 255];

async function oracle() {
  const runtime = await loadOriginal('client', {functionIds: [618], construct: false});
  const moveEntityRecord = createEntityRecordHooks(runtime)[618];
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const invoke = call => {
    try { return {result: call()}; }
    catch (error) { return {error: [error.constructor.name, error.message]}; }
  };
  function compare(destination, source, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    const expected = invoke(() => runtime.call(618, destination, source));
    const expectedMemory = Buffer.from(bytes), expectedStack = runtime.stackPointer.value;
    bytes.set(before);
    runtime.stackPointer.value = stack;
    const actual = invoke(() => moveEntityRecord(destination, source));
    assert.deepEqual(actual, expected, `${label}: outcome`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${label}: complete memory`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    if (expected.error) trapComparisons++;
    comparisons++;
  }
  return {runtime, bytes, view, compare};
}

function seedRecord(o, source, descriptionCount, dropCount, base = 0x10000000) {
  const {view} = o;
  view.setUint32(source, base + 1, true);
  view.setUint8(source + 4, descriptionCount);
  for (let index = 0; index < descriptionCount; index++)
    view.setUint32(source + 8 + index * 4, base + 0x100 + index, true);
  view.setBigUint64(source + 24, 0x0123456789abcdefn + BigInt(base), true);
  view.setUint8(source + 32, dropCount);
  for (let index = 0; index < dropCount; index++)
    view.setBigUint64(source + 36 + index * 8, 0xfedcba9876543210n + BigInt(index), true);
  view.setBigUint64(source + 100, 0x1111222233334444n + BigInt(base), true);
  view.setBigUint64(source + 108, 0xaaaabbbbccccddddn + BigInt(base), true);
}

test('entity record 618 moves both inline arrays and the qword fields', async () => {
  assert.deepEqual(functionIds, [618]);
  const o = await oracle(), {bytes, view, compare} = o;
  const source = 8192, destination = 32768;
  bytes.fill(0xa5);
  for (let index = 0; index < 25; index++) {
    const descriptionCount = COUNT_SAMPLES[index];
    const dropCount = COUNT_SAMPLES[(index * 7 + 3) % COUNT_SAMPLES.length];
    seedRecord(o, source, descriptionCount, dropCount, index * 0x1000);
    compare(destination, source, `diagonal counts ${descriptionCount}/${dropCount}`);
  }
  for (const descriptionCount of [0, 1, 7, 8, 9, 31, 32, 33, 255]) {
    for (const dropCount of [0, 1, 7, 8, 9, 31, 32, 33, 255]) {
      seedRecord(o, source, descriptionCount, dropCount);
      compare(destination, source, `crossed counts ${descriptionCount}/${dropCount}`);
    }
  }
});

test('entity record 618 preserves chunk order for overlapping moves', async () => {
  const o = await oracle(), {bytes, compare} = o;
  bytes.fill(0x5a);
  const source = 16384;
  const offsets = [0, 1, 2, 3, 4, 5, 7, 8, 9, 12, 16, 24, 28, 32, 36, 40, 88, 96, 100, 104,
    108, 112, 116, -1, -2, -3, -4, -5, -8, -9, -16, -24, -32, -36, -100, -108];
  for (const offset of offsets) {
    for (const [descriptionCount, dropCount] of [[3, 4], [8, 8], [17, 9], [255, 255]]) {
      seedRecord(o, source, descriptionCount, dropCount);
      compare((source + offset) >>> 0, source,
        `overlap destination=source${offset >= 0 ? '+' : ''}${offset}, counts ${descriptionCount}/${dropCount}`);
    }
  }
});

test('entity record 618 traps on the first inaccessible chunk and keeps earlier stores', async () => {
  const o = await oracle(), {bytes, view, compare} = o;
  const limit = bytes.length;
  bytes.fill(0x33);
  const put8 = (address, value) => {
    address >>>= 0;
    if (address < limit) view.setUint8(address, value);
  };
  const put32 = (address, value) => {
    address >>>= 0;
    if (address + 4 <= limit) view.setUint32(address, value, true);
  };
  const put64 = (address, value) => {
    address >>>= 0;
    if (address + 8 <= limit) view.setBigUint64(address, value, true);
  };
  function seedBoundary(source, descriptionCount, dropCount) {
    put32(source, 0x6a09e667);
    put8(source + 4, descriptionCount);
    put64(source + 24, 0x0123456789abcdefn);
    put8(source + 32, dropCount);
    put64(source + 100, 0x1111222233334444n);
    put64(source + 108, 0xaaaabbbbccccddddn);
  }
  const cases = [
    [8192, limit - 4, 1, 0],
    [8192, limit - 8, 1, 0],
    [8192, limit - 4, 2, 0],
    [8192, limit - 256, 255, 0],
    [limit - 4, 8192, 0, 1],
    [limit - 8, 8192, 0, 1],
    [limit - 4, 8192, 0, 2],
    [limit - 256, 8192, 0, 255],
    [limit - 4, limit - 4, 1, 1],
    [limit - 116, limit - 116, 0, 1],
    [0xffffffff, 8192, 1, 1],
    [0, 0xffffffff, 1, 1],
    [0xfffffffc, 0, 1, 1],
    [4, 0xfffffffc, 1, 1],
    [-1, 8192, 1, 1],
    [8192, -1, 1, 1],
    [0x10000, 0xfffffff8, 0, 2],
    [8192, 0xfffffff0, 8, 0],
    [8192, 0xffffffe0, 16, 0],
    [0xfffffff0, 8192, 8, 0],
    [0xffffffe0, 8192, 16, 0],
  ];
  for (const [destination, source, descriptionCount, dropCount] of cases) {
    seedBoundary(source >>> 0, descriptionCount, dropCount);
    compare(destination, source,
      `boundary destination=${destination >>> 0}, source=${source >>> 0}, counts ${descriptionCount}/${dropCount}`);
  }
  // A wrapped source pointer still reads the low bytes that the native i32
  // address arithmetic selects.
  seedBoundary(0xfffffffc, 1, 1);
  compare(0x10000, 0xfffffffc, 'wrapped source address');
});
