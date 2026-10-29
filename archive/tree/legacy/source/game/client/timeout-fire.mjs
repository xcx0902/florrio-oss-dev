/** Recovered client timer firing (original function 3278).
 *
 * The client keeps pending timers in a libc++-style unordered map:
 *
 *   - bucket-array pointer   at 7932796
 *   - bucket capacity        at 7932800
 *   - shared chain sentinel  at 7932804 (its first word is the chain head)
 *   - live entry count       at 7932808
 *   - maximum load factor    at 7932812 (always 1.0 here)
 *   - static-init guard      at 7932816
 *
 * A chain node stores `next` (+0), the hash word (+4), the timer id (+8) and
 * the owning entry (+12). The entry stores the callback object at +16. Firing
 * an id invokes the callback through vtable byte offset 24 (slot 6), looks the node up again
 * (the callback may mutate the map), unlinks it, decrements the live count,
 * destroys the callback through vtable slot 4 when it is the entry itself, or
 * slot 5 otherwise, then releases the entry and the node.
 *
 * Bucket selection is `id & (capacity-1)` while the capacity is a power of two,
 * otherwise `id < capacity ? id : id % capacity`. Lookup follows the shared
 * chain but stops as soon as a node's hash belongs to another bucket; the same
 * rule decides whether a bucket slot has to be cleared or repointed when a node
 * is unlinked.
 *
 * A null callback is unrecoverable: the shipped code calls function 406 and
 * then executes `unreachable`.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([3278]);
export const dependencyIds = Object.freeze([362, 369, 370, 406]);

const REGISTRY = Object.freeze({
  buckets: 7932796,
  capacity: 7932800,
  sentinel: 7932804,
  liveCount: 7932808,
  maxLoad: 7932812,
  initialized: 7932816,
});
const INVOKE_SLOT = 6; // byte offset 24 in the vtable
const DESTROY_SLOT = 5;
const SELF_DESTROY_SLOT = 4;
const ONE_F32 = 0x3f800000;

export function createTimeoutFireHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function outOfBounds(error) {
    if (error instanceof RangeError)
      return new WebAssembly.RuntimeError('memory access out of bounds');
    return error;
  }
  function readU8(address) {
    try { return dataView().getUint8(address >>> 0); }
    catch (error) { throw outOfBounds(error); }
  }
  function readU32(address) {
    try { return dataView().getUint32(address >>> 0, true); }
    catch (error) { throw outOfBounds(error); }
  }
  function writeU32(address, value) {
    try { dataView().setUint32(address >>> 0, value >>> 0, true); }
    catch (error) { throw outOfBounds(error); }
  }

  /** Bucket for a hash/id under the map's current capacity. */
  function bucketFor(key, capacity) {
    if (popcount(capacity) <= 1) return (key & (capacity - 1)) >>> 0;
    return (key < capacity ? key : key % capacity) >>> 0;
  }
  function popcount(value) {
    let count = 0;
    for (let bits = value >>> 0; bits !== 0; bits = (bits & (bits - 1)) >>> 0) count++;
    return count;
  }

  /** Lazily clear the map behind the C++ static guard. */
  function initializeRegistry() {
    if ((readU8(REGISTRY.initialized) & 1) !== 0) return;
    if ((runtime.call(369, REGISTRY.initialized) >>> 0) === 0) return;
    // Two adjacent i64 stores: sentinel/live-count, then buckets/capacity.
    writeU32(REGISTRY.sentinel, 0);
    writeU32(REGISTRY.sentinel + 4, 0);
    writeU32(REGISTRY.buckets, 0);
    writeU32(REGISTRY.capacity, 0);
    writeU32(REGISTRY.maxLoad, ONE_F32);
    runtime.call(370, REGISTRY.initialized);
  }

  /**
   * Walk the bucket chain until both the hash word and the id match. Returns 0
   * when no node matches or the chain leaves the bucket.
   */
  function findNode(id) {
    const capacity = readU32(REGISTRY.capacity);
    if (capacity === 0) return 0;
    const bucket = bucketFor(id, capacity);
    const buckets = readU32(REGISTRY.buckets);
    const sentinel = readU32((buckets + bucket * 4) >>> 0);
    if (sentinel === 0) return 0;
    let node = readU32(sentinel);
    if (node === 0) return 0;
    const powerOfTwo = popcount(capacity) <= 1;
    for (;;) {
      const hash = readU32(node + 4);
      if (id !== hash) {
        const sameBucket = powerOfTwo
          ? ((hash & (capacity - 1)) >>> 0) === bucket
          : bucketFor(hash, capacity) === bucket;
        if (!sameBucket) return 0;
      } else if (readU32(node + 8) === id) {
        return node;
      }
      node = readU32(node);
      if (node === 0) return 0;
    }
  }

  /** Invoke the timer callback through vtable byte offset 24 (slot 6). */
  function invokeCallback(node) {
    const entry = readU32(node + 12);
    const callback = readU32(entry + 16);
    if (callback === 0) {
      runtime.call(406);
      throw new WebAssembly.RuntimeError('unreachable');
    }
    const vtable = readU32(callback);
    const method = readU32((vtable + INVOKE_SLOT * 4) >>> 0);
    runtime.indirect({parameters: ['i32'], results: []}, method, callback);
  }

  /** Unlink a known node, maintaining the bucket slots exactly as libc++ does. */
  function unlinkNode(id, node) {
    const capacity = readU32(REGISTRY.capacity);
    const buckets = readU32(REGISTRY.buckets);
    const bucket = bucketFor(id, capacity);
    const bucketAddress = (buckets + bucket * 4) >>> 0;
    let link = readU32(bucketAddress);
    let previous = 0;
    let current = link;
    for (;;) {
      previous = current;
      current = readU32(current);
      if (current === node) break;
    }
    const next = readU32(node);
    let clearBucket = true;
    if (previous !== REGISTRY.sentinel
        && bucketFor(readU32(previous + 4), capacity) === bucket) {
      clearBucket = false;
    }
    if (clearBucket && next !== 0
        && bucketFor(readU32(next + 4), capacity) === bucket) {
      clearBucket = false;
    }
    if (clearBucket) writeU32(bucketAddress, 0);

    if (next === 0) {
      writeU32(previous, 0);
    } else {
      const nextBucket = bucketFor(readU32(next + 4), capacity);
      if (nextBucket !== bucket) writeU32(buckets + nextBucket * 4, previous);
      writeU32(previous, next);
    }
    writeU32(node, 0);

    writeU32(REGISTRY.liveCount, (readU32(REGISTRY.liveCount) - 1) >>> 0);
    const entry = readU32(node + 12);
    writeU32(node + 12, 0);
    if (entry !== 0) {
      const callback = readU32(entry + 16);
      const slot = callback === entry ? SELF_DESTROY_SLOT : DESTROY_SLOT;
      if (callback !== 0) {
        const vtable = readU32(callback);
        const method = readU32((vtable + slot * 4) >>> 0);
        runtime.indirect({parameters: ['i32'], results: []}, method, callback);
      }
      runtime.call(362, entry);
    }
    runtime.call(362, node);
  }

  /** Original 3278: invoke and remove the timer registered under `id`. */
  function fireTimeoutCallback(id) {
    initializeRegistry();
    const node = findNode(id);
    if (node === 0) return;
    invokeCallback(node);
    const again = findNode(id);
    if (again === 0) return;
    unlinkNode(id, again);
  }

  return Object.freeze({3278: fireTimeoutCallback});
}
