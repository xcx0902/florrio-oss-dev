import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {createTimeoutFireHook, functionIds, dependencyIds} from '../source/game/server/timeout-fire.mjs';

let comparisons = 0;
after(() => console.log(
  `server cp6TimeoutFire 659 oracle comparisons: ${comparisons} total; `
  + 'empty, absent, power-of-two, small-id, collision, rehash, duplicate, self-callback, null-callback, lazy-init and OOB cases'));

const REGISTRY = {buckets: 8569332, capacity: 8569336, sentinel: 8569340,
  liveCount: 8569344, initialized: 8569352};
const SAFE = 0x300000;
const BUCKETS = SAFE + 0x1000;
const SENTINELS = SAFE + 0x2000;
const VTABLE = SAFE + 0x3000;

test('cp6TimeoutFire 659 matches the original', async () => {
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencyIds, 14, 16, 270], construct: false});
  const hook = createTimeoutFireHook(runtime);
  const bytes = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(bytes.buffer);
  const u32 = address => view.getUint32(address >>> 0, true);
  const set32 = (address, value) => view.setUint32(address >>> 0, value >>> 0, true);
  let safeIndex = -1;
  const noop = runtime.exports.__fn270;
  for (let index = 0; index < runtime.table.length; index++)
    if (runtime.table.get(index) === noop) { safeIndex = index; break; }
  assert.notEqual(safeIndex, -1, 'safe noop in table');
  assert.equal(hook[659].length, runtime.exports.__fn659.length);
  for (let slot = 0; slot < 8; slot++) set32(VTABLE + slot * 4, safeIndex);

  function allocate(size) {
    const block = runtime.call(16, size) >>> 0;
    assert.notEqual(block, 0, 'malloc');
    return block;
  }
  function reset(flag = 1) {
    bytes.fill(0, SAFE, SAFE + 0x8000);
    set32(REGISTRY.capacity, 0);
    set32(REGISTRY.buckets, 0);
    set32(REGISTRY.liveCount, 0);
    set32(REGISTRY.sentinel, 0);
    view.setUint8(REGISTRY.initialized, flag);
    for (let slot = 0; slot < 8; slot++) set32(VTABLE + slot * 4, safeIndex);
  }
  function addNode({capacity, bucketIndex, key, next = 0, callback = true, entryPointer = null}) {
    const sentinel = SENTINELS + bucketIndex * 16;
    const node = allocate(64);
    set32(BUCKETS + bucketIndex * 4, sentinel);
    if (u32(sentinel) === 0) set32(sentinel, node);
    else {
      let cursor = sentinel;
      while (u32(cursor) !== 0) cursor = u32(cursor);
      set32(cursor, node);
    }
    set32(node, next);
    set32(node + 4, key);
    set32(node + 8, key);
    set32(REGISTRY.capacity, capacity);
    set32(REGISTRY.buckets, BUCKETS);
    set32(REGISTRY.liveCount, (u32(REGISTRY.liveCount) + 1) >>> 0);
    if (callback) {
      const entry = allocate(32);
      const target = allocate(32);
      set32(target, VTABLE);
      set32(entry + 16, target);
      set32(node + 12, entry);
      return {node, entry, callback: target};
    }
    set32(node + 12, entryPointer ?? 0);
    return {node};
  }

  const cases = [
    ['empty registry', () => { reset(); return 123; }],
    ['absent key', () => {
      reset();
      addNode({capacity: 1, bucketIndex: 0, key: 999});
      return 123;
    }],
    ['power-of-two hit', () => {
      reset();
      addNode({capacity: 1, bucketIndex: 0, key: 123});
      return 123;
    }],
    ['non-power small id', () => {
      reset();
      addNode({capacity: 3, bucketIndex: 1, key: 1});
      return 1;
    }],
    ['non-power collision', () => {
      reset();
      const tail = addNode({capacity: 3, bucketIndex: 2, key: 8});
      addNode({capacity: 3, bucketIndex: 2, key: 5, next: tail.node});
      return 5;
    }],
    ['duplicate id removes first', () => {
      reset();
      const second = addNode({capacity: 1, bucketIndex: 0, key: 42});
      addNode({capacity: 1, bucketIndex: 0, key: 42, next: second.node});
      return 42;
    }],
    ['next node moves to another bucket', () => {
      reset();
      const tail = addNode({capacity: 3, bucketIndex: 1, key: 4});
      addNode({capacity: 3, bucketIndex: 2, key: 5, next: tail.node});
      return 5;
    }],
    ['self-based callback uses destroy slot 4', () => {
      reset();
      const node = allocate(64);
      const entry = allocate(32);
      const sentinel = SENTINELS;
      set32(BUCKETS, sentinel);
      set32(sentinel, node);
      set32(node + 4, 91);
      set32(node + 8, 91);
      set32(node + 12, entry);
      set32(entry, VTABLE);
      set32(entry + 16, entry);
      set32(REGISTRY.capacity, 1);
      set32(REGISTRY.buckets, BUCKETS);
      set32(REGISTRY.liveCount, 1);
      return 91;
    }],
    ['null callback aborts', () => {
      reset();
      addNode({capacity: 1, bucketIndex: 0, key: 77, callback: false});
      return 77;
    }],
    ['lazy registry initialization', () => {
      reset(0);
      set32(REGISTRY.sentinel, 0xdeadbeef);
      return 5;
    }],
    ['out-of-bounds bucket array', () => {
      reset();
      set32(REGISTRY.capacity, 1);
      set32(REGISTRY.buckets, 0xfffffff0);
      return 1;
    }],
  ];

  for (const [name, build] of cases) {
    const key = build();
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    let expected, expectedError, expectedMemory;
    try { expected = runtime.call(659, key); }
    catch (error) { expectedError = error; }
    expectedMemory = Buffer.from(bytes);
    bytes.set(before);
    runtime.stackPointer.value = stack;
    let actual, actualError;
    try { actual = hook[659](key); }
    catch (error) { actualError = error; }
    assert.equal(actualError?.constructor.name ?? null, expectedError?.constructor.name ?? null, `${name}: error type`);
    assert.equal(actualError?.message ?? null, expectedError?.message ?? null, `${name}: error message`);
    if (!expectedError) assert.equal(actual, expected, `${name}: return`);
    assert.ok(Buffer.from(bytes).equals(expectedMemory), `${name}: complete memory`);
    assert.equal(runtime.stackPointer.value, stack, `${name}: stack`);
    comparisons++;
  }
});
