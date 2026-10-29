/** Recovered sp_server cp6TimeoutFire (original function 659).
 *
 * The server keeps its pending timers in an open-addressed bucket table whose
 * chains are singly linked nodes. Firing one id:
 *
 *   1. lazily initialises the registry through the C++ static guard;
 *   2. hashes the id into a bucket and walks the chain until both the hash word
 *      (+4) and the id word (+8) match;
 *   3. invokes the timer callback stored at entry+16 through vtable slot 6;
 *   4. looks the node up again, because the callback may have mutated the map;
 *   5. unlinks the node, decrements the live count and destroys the callback
 *      object through vtable slot 4 (self-based) or 5;
 *   6. frees the callback entry and the chain node.
 *
 * The bucket index is `id & (capacity-1)` while capacity is a power of two and
 * `id < capacity ? id : id % capacity` otherwise. The recovered code preserves
 * the original trap behaviour for a null callback and for out-of-bounds bucket
 * or chain pointers. WAT SHA-256:
 * dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([659]);
export const dependencyIds = Object.freeze([14, 31, 32, 42]);

const REGISTRY = Object.freeze({
  buckets: 8569332,
  capacity: 8569336,
  sentinel: 8569340,
  liveCount: 8569344,
  initialized: 8569352,
});
const CALLBACK_INVOKE_SLOT = 6;
const CALLBACK_DESTROY_SLOT = 5;
const CALLBACK_SELF_DESTROY_SLOT = 4;

export function createTimeoutFireHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function readU32(address) {
    try {
      return dataView().getUint32(address >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function writeU32(address, value) {
    try {
      dataView().setUint32(address >>> 0, value >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function readU8(address) {
    try {
      return dataView().getUint8(address >>> 0);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function writeU32Pair(address, low, high) {
    writeU32(address, low);
    writeU32((address + 4) >>> 0, high);
  }

  /** Lazily zero the registry; the shipped static guard decides who runs this. */
  function ensureInitialized() {
    if ((readU8(REGISTRY.initialized) & 1) !== 0) return;
    if ((runtime.call(32, REGISTRY.initialized) >>> 0) === 0) return;
    writeU32Pair(REGISTRY.sentinel, 0, 0);
    writeU32Pair(REGISTRY.buckets, 0, 0);
    writeU32(REGISTRY.liveCount + 4, 0x3f800000); // 1.0f at 8569348
    runtime.call(31, REGISTRY.initialized);
  }

  function isPowerOfTwo(value) {
    return (value & (value - 1)) === 0;
  }

  function bucketIndex(key, capacity) {
    if (isPowerOfTwo(capacity)) return (key & (capacity - 1)) >>> 0;
    return (key < capacity ? key : key % capacity) >>> 0;
  }

  function normalizeKey(key, capacity) {
    return bucketIndex(key, capacity);
  }

  /**
   * Original lookup: bucket slot -> bucket sentinel node -> chain. A chain node
   * whose hash word differs from the requested id terminates the search unless
   * it belongs to the same bucket, in which case the walk continues.
   */
  function findNode(key) {
    const capacity = readU32(REGISTRY.capacity);
    if (capacity === 0) return null;
    const bucketArray = readU32(REGISTRY.buckets);
    const index = bucketIndex(key, capacity);
    const bucketSentinel = readU32((bucketArray + index * 4) >>> 0);
    if (bucketSentinel === 0) return null;
    let node = readU32(bucketSentinel);
    if (node === 0) return null;
    const powerOfTwo = isPowerOfTwo(capacity);
    const mask = (capacity - 1) >>> 0;
    for (;;) {
      const nodeKey = readU32((node + 4) >>> 0);
      if (nodeKey !== key) {
        if (powerOfTwo) {
          if (((nodeKey & mask) >>> 0) !== index) return null;
        } else {
          const nodeIndex = nodeKey < capacity ? nodeKey : nodeKey % capacity;
          if (nodeIndex !== index) return null;
        }
      } else if (readU32((node + 8) >>> 0) === key) {
        return {capacity, bucketArray, index, bucketSentinel, node};
      }
      node = readU32(node);
      if (node === 0) return null;
    }
  }

  function invokeCallback(node) {
    const entry = readU32((node + 12) >>> 0);
    const callback = readU32((entry + 16) >>> 0);
    if (callback === 0) runtime.call(42);
    const vtable = readU32(callback);
    const method = readU32((vtable + CALLBACK_INVOKE_SLOT * 4) >>> 0);
    runtime.indirect({parameters: ['i32'], results: []}, method, callback);
  }

  function destroyCallback(node) {
    const entry = readU32((node + 12) >>> 0);
    writeU32((node + 12) >>> 0, 0);
    if (entry === 0) return;
    const callback = readU32((entry + 16) >>> 0);
    if (callback !== 0) {
      const slot = callback === entry
        ? CALLBACK_SELF_DESTROY_SLOT : CALLBACK_DESTROY_SLOT;
      const vtable = readU32(callback);
      const method = readU32((vtable + slot * 4) >>> 0);
      runtime.indirect({parameters: ['i32'], results: []}, method, callback);
    }
    runtime.call(14, entry);
  }

  /** Original 659: fire and remove one timer id. */
  function cp6TimeoutFire(key) {
    const id = key >>> 0;
    ensureInitialized();
    const first = findNode(id);
    if (first === null) return;
    invokeCallback(first.node);

    // The callback may have inserted, removed or rehashed entries, so the
    // shipped code performs a complete second lookup before unlinking.
    const found = findNode(id);
    if (found === null) return;
    const {capacity, bucketArray, index, node} = found;
    const slotAddress = (bucketArray + index * 4) >>> 0;

    let previous = readU32(slotAddress);
    let current = previous;
    while (current !== node) {
      previous = current;
      current = readU32(current);
      if (current === 0) return;
    }

    // The shipped code inspects the *previous* chain node, not the removed
    // node, when deciding whether the bucket slot can be cleared.
    let keepBucket = false;
    if (previous !== REGISTRY.sentinel &&
        normalizeKey(readU32((previous + 4) >>> 0), capacity) === index)
      keepBucket = true;
    const next = readU32(node);
    if (!keepBucket && next !== 0 &&
        normalizeKey(readU32((next + 4) >>> 0), capacity) === index)
      keepBucket = true;
    if (!keepBucket) writeU32(slotAddress, 0);

    let replacement = 0;
    if (next !== 0) {
      const nextIndex = normalizeKey(readU32((next + 4) >>> 0), capacity);
      if (nextIndex === index) {
        replacement = next;
      } else {
        writeU32((bucketArray + nextIndex * 4) >>> 0, previous);
        replacement = next;
      }
    }
    writeU32(previous, replacement);
    writeU32(node, 0);
    writeU32(REGISTRY.liveCount,
      (readU32(REGISTRY.liveCount) - 1) >>> 0);
    destroyCallback(node);
    runtime.call(14, node);
  }

  return Object.freeze({659: cp6TimeoutFire});
}
