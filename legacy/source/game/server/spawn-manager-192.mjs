/** Recovered sp_server world+192 manager allocator and publisher (420, 419).
 *
 * Function 420 acquires a 56-byte entity record. It first pops the root of a
 * free-address heap (count at +16, array at +24); when that heap is empty it
 * hands out records from 7168-byte blocks (128 records each) tracked by:
 *
 *   +0   next record index inside the current block (0..128)
 *   +4   number of allocated blocks
 *   +8   block-pointer array capacity
 *   +12  block-pointer array
 *   +16  free-address heap count
 *   +24  free-address heap array
 *
 * Function 419 publishes a record into an owner world: it sets the world's
 * component flag, clears the two per-id caches, writes the owner revision
 * stamp into three id tables, appends the record to the active vector at
 * owner+1676/+1680/+1684, records the stamp at world+472/+476, then clears the
 * caches and rewrites the first two id tables again.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([420, 419]);

export const MANAGER_OFFSETS = Object.freeze({
  recordIndex: 0,
  blockCount: 4,
  blockCapacity: 8,
  blocks: 12,
  freeCount: 16,
  freeHeap: 24,
});
export const RECORD_BYTES = 56;
export const RECORDS_PER_BLOCK = 128;
export const BLOCK_BYTES = RECORD_BYTES * RECORDS_PER_BLOCK;
const ACTIVE_LENGTH = 1676;
const ACTIVE_CAPACITY = 1680;
const ACTIVE_DATA = 1684;
const CACHE_SLOTS = Object.freeze([264876, 264880]);
const STAMP_TABLES = Object.freeze([68268, 133804, 199340]);
const OWNER_ID_MASK = 16383;

export function createSpawnManager192Hook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const u32 = (view, address) => view.getUint32(address, true) >>> 0;
  const set32 = (view, address, value) => view.setUint32(address, value >>> 0, true);

  /** Grow a pointer array in place using the original geometric policy. */
  function growPointerArray(view, arrayAddress, count, oldCapacity, needed) {
    // The original derives the new capacity from the old one, not from count:
    // a zero capacity starts at 1024, otherwise it starts at twice the old cap.
    let capacity = oldCapacity === 0 ? 1024 : oldCapacity * 2;
    while (capacity < needed) capacity *= 2;
    const oldPointer = u32(view, arrayAddress);
    const next = runtime.call(16, capacity * 4) >>> 0;
    runtime.call(15, next, oldPointer, count * 4);
    runtime.call(14, oldPointer);
    set32(view, arrayAddress, next);
    return {pointer: next, capacity};
  }

  /** Original 420: acquire a 56-byte record from the free heap or a block. */
  function acquireRecord(manager) {
    try {
      const view = dataView();
      const freeCount = u32(view, manager + MANAGER_OFFSETS.freeCount);
      if (freeCount !== 0) {
        const heap = u32(view, manager + MANAGER_OFFSETS.freeHeap);
        const root = u32(view, heap);
        if (freeCount <= 1) {
          set32(view, manager + MANAGER_OFFSETS.freeCount, freeCount - 1);
          return root | 0;
        }
        const last = u32(view, heap + (freeCount - 1) * 4);
        set32(view, heap, last);
        set32(view, heap + (freeCount - 1) * 4, root);
        if (freeCount === 2) {
          set32(view, manager + MANAGER_OFFSETS.freeCount, 1);
          return root | 0;
        }
        let child = freeCount < 4
          ? 1
          : (u32(view, heap + 8) < u32(view, heap + 4) ? 1 : 2);
        const heapSize = freeCount - 1;
        let childValue = u32(view, heap + child * 4);
        if (childValue < last) {
          set32(view, manager + MANAGER_OFFSETS.freeCount, heapSize);
          return root | 0;
        }
        const lastParent = (freeCount - 3) >>> 1;
        let parent = 0;
        for (;;) {
          const parentSlot = child;
          set32(view, heap + parent * 4, childValue);
          if (child > lastParent) {
            parent = parentSlot;
            break;
          }
          const left = child * 2;
          const right = left + 1;
          child = right;
          if (heapSize > left + 2) {
            child = u32(view, heap + right * 4) < u32(view, heap + (right + 1) * 4)
              ? right + 1 : right;
          }
          parent = parentSlot;
          childValue = u32(view, heap + child * 4);
          if (childValue < last) break;
        }
        set32(view, heap + parent * 4, last);
        set32(view, manager + MANAGER_OFFSETS.freeCount, heapSize);
        return root | 0;
      }

      const index = view.getInt32(manager + MANAGER_OFFSETS.recordIndex, true);
      if (index <= 127) {
        const blocks = u32(view, manager + MANAGER_OFFSETS.blocks);
        const blockCount = u32(view, manager + MANAGER_OFFSETS.blockCount);
        const block = u32(view, blocks + (blockCount - 1) * 4);
        set32(view, manager + MANAGER_OFFSETS.recordIndex, index + 1);
        return (block + index * RECORD_BYTES) | 0;
      }

      const block = runtime.call(16, BLOCK_BYTES) >>> 0;
      const blockCount = u32(view, manager + MANAGER_OFFSETS.blockCount);
      const needed = blockCount + 1;
      let blocks = u32(view, manager + MANAGER_OFFSETS.blocks);
      let capacity = u32(view, manager + MANAGER_OFFSETS.blockCapacity);
      if (capacity < needed) {
        ({pointer: blocks, capacity} = growPointerArray(
          view, manager + MANAGER_OFFSETS.blocks, blockCount, capacity, needed));
        set32(view, manager + MANAGER_OFFSETS.blockCapacity, capacity);
      }
      set32(view, blocks + blockCount * 4, block);
      set32(view, manager + MANAGER_OFFSETS.recordIndex, 1);
      set32(view, manager + MANAGER_OFFSETS.blockCount, needed);
      return block | 0;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  function releaseCacheRecord(view, owner, slotOffset, entityId) {
    const slot = owner + slotOffset + entityId * 8;
    const record = u32(view, slot);
    set32(view, slot, 0);
    if (record !== 0) {
      runtime.call(14, u32(view, record + 12));
      runtime.call(14, record);
    }
  }

  /** Original 419: publish a record and attach it to the world. */
  function publishRecord(world, record) {
    try {
      const view = dataView();
      const owner = u32(view, world);
      const entityId = u32(view, world + 16) & OWNER_ID_MASK;
      view.setUint8(world + 95, view.getUint8(world + 95) | 8);

      for (const slotOffset of CACHE_SLOTS) releaseCacheRecord(view, owner, slotOffset, entityId);
      const stamp = u32(view, owner + 2140);
      for (const table of STAMP_TABLES) set32(view, owner + table + entityId * 4, stamp);

      const length = u32(view, owner + ACTIVE_LENGTH);
      const needed = length + 1;
      let capacity = u32(view, owner + ACTIVE_CAPACITY);
      let data = u32(view, owner + ACTIVE_DATA);
      if (capacity < needed) {
        capacity = capacity === 0 ? 1024 : capacity * 2;
        while (capacity < needed) capacity *= 2;
        const next = runtime.call(16, capacity * 4) >>> 0;
        runtime.call(15, next, data, length * 4);
        runtime.call(14, data);
        data = next;
        set32(view, owner + ACTIVE_DATA, data);
        set32(view, owner + ACTIVE_CAPACITY, capacity);
      }
      set32(view, data + length * 4, record);
      set32(view, owner + ACTIVE_LENGTH, needed);

      set32(view, world + 472, stamp);
      set32(view, world + 476, stamp);

      for (const slotOffset of CACHE_SLOTS) releaseCacheRecord(view, owner, slotOffset, entityId);
      set32(view, owner + STAMP_TABLES[0] + entityId * 4, stamp);
      set32(view, owner + STAMP_TABLES[1] + entityId * 4, stamp);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({420: acquireRecord, 419: publishRecord});
}
