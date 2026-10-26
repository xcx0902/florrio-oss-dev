import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {loadOriginal} from './helpers/wasm-probe.mjs';
import {
  createSpawnManager192Hook, functionIds, MANAGER_OFFSETS, RECORD_BYTES,
  RECORDS_PER_BLOCK, BLOCK_BYTES,
} from '../source/game/server/spawn-manager-192.mjs';

let comparisons = 0;
after(() => console.log(
  `server world+192 manager oracle comparisons: ${comparisons} total; `
  + 'free-heap pop, block allocation, vector growth and cache release'));

test('world+192 record allocator and publisher match the original', async () => {
  const runtime = await loadOriginal('sp_server', {functionIds: [...functionIds, 14, 15, 16], construct: false});
  const hook = createSpawnManager192Hook(runtime);
  const memory = new Uint8Array(runtime.memory.buffer);
  const view = new DataView(runtime.memory.buffer);
  const clean = Buffer.from(memory);
  const manager = 0x440000;
  const heap = 0x441000;
  const owner = 0x450000; // enough for the 264,880 cache table
  const world = 0x4a0000;
  const ownerBytes = 0x62000;
  let state = 0x13579bdf;

  assert.equal(hook[420].length, runtime.exports.__fn420.length);
  assert.equal(hook[419].length, runtime.exports.__fn419.length);

  function restore(snapshot) {
    memory.set(snapshot);
    runtime.stackPointer.value = 0x02000000;
  }
  function mallocBytes(bytes) {
    return runtime.call(16, bytes) >>> 0;
  }

  // Every scenario starts from the same allocator image, sets up its own
  // manager or world, snapshots that setup, then runs the native body and the
  // hook from identical bytes.
  for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 20, 31, 40, 64, 100]) {
    for (let trial = 0; trial < 6; trial++) {
      restore(clean);
      memory.fill(0x7a, manager, manager + 0x1000);
      view.setUint32(manager + MANAGER_OFFSETS.freeCount, count, true);
      view.setUint32(manager + MANAGER_OFFSETS.freeHeap, heap, true);
      for (let i = 0; i < count; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        view.setUint32(heap + i * 4, state, true);
      }
      const setup = Buffer.from(memory);
      const stack = runtime.stackPointer.value;
      const expected = runtime.call(420, manager);
      const expectedMemory = Buffer.from(memory);
      restore(setup);
      runtime.stackPointer.value = stack;
      const actual = hook[420](manager);
      assert.equal(actual, expected, `pop ${count}/${trial}: result`);
      assert.ok(Buffer.from(memory).equals(expectedMemory), `pop ${count}/${trial}: memory`);
      assert.equal(runtime.stackPointer.value, stack, 'pop: stack');
      comparisons++;
    }
  }

  // Block-backed allocation: index within the current block, then the
  // 128-record boundary with no growth, geometric growth and first-block cases.
  const allocationCases = [
    {index: 0, blocks: 1, capacity: 4, grow: false},
    {index: 1, blocks: 1, capacity: 4, grow: false},
    {index: 127, blocks: 1, capacity: 4, grow: false},
    {index: 128, blocks: 1, capacity: 4, grow: false},
    {index: 128, blocks: 1, capacity: 0, grow: true},
    {index: 128, blocks: 1, capacity: 1, grow: true},
    {index: 128, blocks: 2, capacity: 2, grow: true},
    {index: 128, blocks: 0, capacity: 0, grow: true},
    {index: 128, blocks: 0, capacity: 4, grow: false},
  ];
  for (const scenario of allocationCases) {
    restore(clean);
    memory.fill(0x33, manager, manager + 0x2000);
    const blockPointers = [];
    for (let i = 0; i < scenario.blocks; i++) blockPointers.push(mallocBytes(BLOCK_BYTES));
    const array = scenario.capacity > 0 ? mallocBytes(scenario.capacity * 4) : 0;
    if (array !== 0) memory.fill(0, array, array + scenario.capacity * 4);
    for (let i = 0; i < blockPointers.length; i++) view.setUint32(array + i * 4, blockPointers[i], true);
    view.setInt32(manager + MANAGER_OFFSETS.recordIndex, scenario.index, true);
    view.setUint32(manager + MANAGER_OFFSETS.blockCount, scenario.blocks, true);
    view.setUint32(manager + MANAGER_OFFSETS.blockCapacity, scenario.capacity, true);
    view.setUint32(manager + MANAGER_OFFSETS.blocks, array, true);
    view.setUint32(manager + MANAGER_OFFSETS.freeCount, 0, true);
    view.setUint32(manager + MANAGER_OFFSETS.freeHeap, 0, true);
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    const expected = runtime.call(420, manager);
    const expectedMemory = Buffer.from(memory);
    restore(setup);
    runtime.stackPointer.value = stack;
    const actual = hook[420](manager);
    assert.equal(actual, expected, `allocate ${JSON.stringify(scenario)}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `allocate ${JSON.stringify(scenario)}: memory`);
    assert.equal(runtime.stackPointer.value, stack, 'allocate: stack');
    comparisons++;
  }

  // Repeated calls across the 128-record boundary on one manager.
  {
    restore(clean);
    memory.fill(0x33, manager, manager + 0x2000);
    const block = mallocBytes(BLOCK_BYTES);
    const array = mallocBytes(16);
    memory.fill(0, array, array + 16);
    view.setUint32(array, block, true);
    view.setInt32(manager + MANAGER_OFFSETS.recordIndex, 127, true);
    view.setUint32(manager + MANAGER_OFFSETS.blockCount, 1, true);
    view.setUint32(manager + MANAGER_OFFSETS.blockCapacity, 4, true);
    view.setUint32(manager + MANAGER_OFFSETS.blocks, array, true);
    view.setUint32(manager + MANAGER_OFFSETS.freeCount, 0, true);
    view.setUint32(manager + MANAGER_OFFSETS.freeHeap, 0, true);
    let nativeState = Buffer.from(memory);
    let hookState = nativeState;
    for (let step = 0; step < 4; step++) {
      restore(nativeState);
      const expected = runtime.call(420, manager);
      nativeState = Buffer.from(memory);
      restore(hookState);
      const actual = hook[420](manager);
      hookState = Buffer.from(memory);
      assert.equal(actual, expected, `repeated allocate step ${step}: result`);
      assert.ok(hookState.equals(nativeState), `repeated allocate step ${step}: memory`);
      comparisons++;
    }
  }

  // Distinct manager instances must not share record cursors or block tables.
  for (const instance of [0x446000, 0x448000]) {
    restore(clean);
    memory.fill(0x33, instance, instance + 0x2000);
    const block = mallocBytes(BLOCK_BYTES);
    const array = mallocBytes(16);
    memory.fill(0, array, array + 16);
    view.setUint32(array, block, true);
    view.setInt32(instance + MANAGER_OFFSETS.recordIndex, 3, true);
    view.setUint32(instance + MANAGER_OFFSETS.blockCount, 1, true);
    view.setUint32(instance + MANAGER_OFFSETS.blockCapacity, 4, true);
    view.setUint32(instance + MANAGER_OFFSETS.blocks, array, true);
    view.setUint32(instance + MANAGER_OFFSETS.freeCount, 0, true);
    view.setUint32(instance + MANAGER_OFFSETS.freeHeap, 0, true);
    const setup = Buffer.from(memory);
    const expected = runtime.call(420, instance);
    const expectedMemory = Buffer.from(memory);
    restore(setup);
    const actual = hook[420](instance);
    assert.equal(actual, expected, `instance ${instance.toString(16)}: result`);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `instance ${instance.toString(16)}: memory`);
    comparisons++;
  }

  // Publisher: vector growth, stamp tables and cache release branches.
  const publisherCases = [];
  for (const id of [0, 5]) {
    for (const [length, capacity] of [[0, 0], [0, 4], [1, 1], [1, 2], [2, 2], [2, 4], [3, 4]]) {
      for (const caches of ['none', 'both', 'first']) publisherCases.push({id, length, capacity, caches});
    }
  }
  for (const scenario of publisherCases) {
    restore(clean);
    memory.fill(0, owner, owner + ownerBytes);
    memory.fill(0x44, world, world + 0x800);
    view.setUint32(world, owner, true);
    view.setUint32(world + 16, scenario.id, true);
    view.setUint8(world + 95, 0x11);
    view.setUint32(owner + 2140, 0x1234 + scenario.id, true);
    if (scenario.capacity > 0) {
      const data = mallocBytes(scenario.capacity * 4);
      memory.fill(0, data, data + scenario.capacity * 4);
      for (let i = 0; i < scenario.length; i++) view.setUint32(data + i * 4, 0x900000 + i, true);
      view.setUint32(owner + 1684, data, true);
    }
    view.setUint32(owner + 1676, scenario.length, true);
    view.setUint32(owner + 1680, scenario.capacity, true);
    const slots = [owner + 264876 + scenario.id * 8, owner + 264880 + scenario.id * 8];
    const live = scenario.caches === 'both' ? 2 : scenario.caches === 'first' ? 1 : 0;
    for (let i = 0; i < live; i++) {
      const payload = mallocBytes(16);
      const record = mallocBytes(16);
      view.setUint32(record + 12, payload, true);
      view.setUint32(slots[i], record, true);
    }
    const setup = Buffer.from(memory);
    const stack = runtime.stackPointer.value;
    runtime.call(419, world, 0x98765432);
    const expectedMemory = Buffer.from(memory);
    restore(setup);
    runtime.stackPointer.value = stack;
    hook[419](world, 0x98765432);
    assert.ok(Buffer.from(memory).equals(expectedMemory), `publish ${JSON.stringify(scenario)}: memory`);
    assert.equal(runtime.stackPointer.value, stack, 'publish: stack');
    comparisons++;
  }
  // Two publishes on the same world exercise the already-grown vector and the
  // now-empty cache slots, on a distinct publisher instance.
  {
    restore(clean);
    memory.fill(0, owner, owner + ownerBytes);
    memory.fill(0x44, world, world + 0x800);
    view.setUint32(world, owner, true);
    view.setUint32(world + 16, 2, true);
    view.setUint32(owner + 2140, 0x77, true);
    let nativeState = Buffer.from(memory);
    let hookState = nativeState;
    for (let step = 0; step < 2; step++) {
      restore(nativeState);
      runtime.call(419, world, 0x11110000 + step);
      nativeState = Buffer.from(memory);
      restore(hookState);
      hook[419](world, 0x11110000 + step);
      hookState = Buffer.from(memory);
      assert.ok(hookState.equals(nativeState), `repeated publish step ${step}: memory`);
      comparisons++;
    }
  }
  restore(clean);
});
