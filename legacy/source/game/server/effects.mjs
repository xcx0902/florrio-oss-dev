/** Effect payload ownership/lifetime and deferred callback storage services.
 * Original signatures, pool addresses, unique-owner moves and typed virtual
 * dispatch are retained; see effects-map.json for the explicit boundaries.
 */
export const functionIds = Object.freeze([118, 150, 271, 275, 276, 277]);
const POOL = Object.freeze({ used: 8548308, blocks: 8548312, blockCapacity: 8548316,
  blockItems: 8548320, freeCount: 8548324, freeCapacity: 8548328, freeItems: 8548332 });

export function createEffectHooks(runtime) {
  let buffer, view;
  function access(address, width) {
    if (buffer !== runtime.memory.buffer) { buffer = runtime.memory.buffer; view = new DataView(buffer); }
    if (address < 0 || address + width > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = address => access(address, 1).getUint8(address);
  const u32 = address => access(address, 4).getUint32(address, true);
  const double = address => access(address, 8).getFloat64(address, true);
  const word = (address, value) => access(address, 4).setUint32(address, value, true);
  const float = (address, value) => access(address, 4).setFloat32(address, value, true);
  const long = address => access(address, 8).setBigUint64(address, 0n, true);
  const add = (address, offset) => (address + offset) >>> 0;
  const call = (id, ...args) => runtime.call(id, ...args);
  function frame(size, work) {
    const scratch = (runtime.stackPointer.value - size) >>> 0;
    runtime.stackPointer.value = scratch;
    const result = work(scratch);
    runtime.stackPointer.value = (scratch + size) | 0;
    return result;
  }
  function virtual(object, slot, ...args) {
    return runtime.indirect({ parameters: Array(args.length + 1).fill('i32'), results: [] },
      u32(u32(object) + slot * 4), object, ...args);
  }
  function unlink(handle) {
    const previous = u32(handle + 4);
    word(previous + 8, u32(handle + 8));
    word(u32(handle + 8) + 4, previous);
  }
  function appendPointer(header, pointer, beforeCount) {
    let capacity = u32(header + 4);
    const count = u32(header), next = (count + 1) >>> 0;
    let items;
    if (capacity >= next) items = u32(header + 8);
    else {
      capacity = capacity ? (capacity << 1) >>> 0 : 1024;
      while (capacity < next) capacity = (capacity << 1) >>> 0;
      const previous = u32(header + 8);
      items = call(16, (capacity << 2) >>> 0) >>> 0;
      const copied = call(15, items, previous, (count << 2) >>> 0);
      call(14, previous);
      word(header + 8, copied); word(header + 4, capacity);
    }
    word(add(items, (count << 2) >>> 0), pointer);
    if (beforeCount) beforeCount();
    word(header, next);
    return { count, next, items };
  }

  function remainingEffectLifetime(effect) {
    effect >>>= 0;
    return frame(16, scratch => {
      call(21, scratch);
      if (!u8(effect + 8)) return Infinity;
      if (!u8(scratch)) return -Infinity;
      return Math.fround(double(effect + 16) - double(scratch + 8));
    });
  }

  /** Replace an area's shared effect in every currently tracked target list.
   * The input holder transfers ownership. Clearing the payload also unlinks
   * and frees its intrusive target-handle vector.
   */
  function replaceAreaEffect(area, intensity, incoming) {
    area >>>= 0; incoming >>>= 0;
    float(area + 4, intensity);
    const count = u32(area + 16);
    if (count) {
      let handle = u32(area + 24);
      const end = add(handle, Math.imul(count, 12));
      do {
        const entity = u32(handle);
        if (entity) {
          const previous = u32(area + 8), effects = u32(entity + 192), next = u32(incoming);
          if (next) {
            if (previous) {
              let item = u32(effects + 36);
              const length = u32(effects + 28);
              if (length) {
                const limit = add(item, length << 2);
                while (u32(item) !== previous) {
                  item = add(item, 4);
                  if (item === limit) break;
                }
              }
              // The original writes at end if the old payload is absent;
              // preserving that write matters for malformed target lists.
              word(item, next);
            } else appendPointer(effects + 28, next);
          } else if (previous) {
            let item = u32(effects + 36);
            const length = u32(effects + 28), limit = add(item, length << 2), last = add(limit, -4);
            if (length) {
              while (u32(item) !== previous) {
                item = add(item, 4);
                if (item === limit) break;
              }
            }
            if (item !== last) word(item, u32(last));
            word(effects + 28, (length - 1) >>> 0);
          }
        }
        handle = add(handle, 12);
      } while (handle !== end);
    }
    const next = u32(incoming);
    word(incoming, 0);
    const previous = u32(area + 8);
    word(area + 8, next);
    if (previous) virtual(previous, 1);
    if (!(previous ? u32(area + 8) : next)) {
      const items = u32(area + 24), length = u32(area + 16);
      for (let index = 0; index < length; index++) unlink(add(items, Math.imul(index, 12)));
      call(14, items);
      long(area + 16); word(area + 24, 0);
    }
  }

  /** Destroy a deferred callback and return its 40-byte slot to the shared
   * max-heap of available addresses. The slot's bytes remain untouched.
   */
  function releaseDeferredSlot(holder) {
    holder >>>= 0;
    const node = u32(holder);
    word(holder, 0);
    if (!node) return holder | 0;
    const callback = u32(node + 16);
    if (callback === node) virtual(callback, 4);
    else if (callback) virtual(callback, 5);
    const { count, next, items } = appendPointer(POOL.freeCount, node);
    if ((next | 0) < 2) return holder | 0;
    const heap = u32(POOL.freeItems);
    let parentIndex = (((next & 0x3fffffff) - 2) >>> 1), parent = add(heap, parentIndex << 2);
    let parentValue = u32(parent), child = add(heap, count << 2);
    const inserted = u32(child);
    if (parentValue >= inserted) return holder | 0;
    let destination;
    do {
      destination = parent;
      word(child, parentValue);
      if (!parentIndex) break;
      child = destination;
      parentIndex = ((parentIndex - 1) / 2) | 0;
      parent = add(heap, parentIndex << 2);
      parentValue = u32(parent);
    } while (parentValue < inserted);
    word(destination, inserted);
    return holder | 0;
  }

  function acquireDeferredSlot() {
    const count = u32(POOL.freeCount);
    if (count) {
      const heap = u32(POOL.freeItems), result = u32(heap);
      let remaining = 1;
      if ((count | 0) <= 1) remaining = (count - 1) >>> 0;
      else {
        const last = add(add(heap, count << 2), -4);
        word(heap, u32(last)); word(last, result);
        if (count !== 2) {
          let child = add(heap, 4), childIndex = 1;
          if ((count | 0) >= 4 && u32(heap + 4) < u32(heap + 8)) { child = add(heap, 8); childIndex = 2; }
          remaining = (count - 1) >>> 0;
          let childValue = u32(child);
          const replacement = u32(heap);
          if (childValue >= replacement) {
            const lastParent = (count - 3) >>> 1;
            let parent = heap, destination;
            do {
              destination = child;
              word(parent, childValue);
              if ((childIndex | 0) > (lastParent | 0)) break;
              const left = childIndex << 1;
              childIndex = left | 1;
              child = add(heap, childIndex << 2);
              const right = (left + 2) | 0;
              if ((remaining | 0) > right && u32(child) < u32(child + 4)) {
                child = add(child, 4); childIndex = right;
              }
              parent = destination;
              childValue = u32(child);
            } while (childValue >= replacement);
            word(destination, replacement);
          }
        }
      }
      word(POOL.freeCount, remaining);
      return result | 0;
    }
    const used = u32(POOL.used);
    if (used <= 4095) {
      const block = u32(add(add(u32(POOL.blockItems), u32(POOL.blocks) << 2), -4));
      word(POOL.used, (used + 1) >>> 0);
      return add(block, Math.imul(used, 40)) | 0;
    }
    const block = call(16, 163840) >>> 0;
    appendPointer(POOL.blocks, block, () => word(POOL.used, 1));
    return block | 0;
  }

  /** Grow the owning vector and move every unique slot pointer. The old
   * vector's moved-from entries are destroyed through the recovered service.
   */
  function growDeferredVector(vector, holder) {
    vector >>>= 0; holder >>>= 0;
    const start = u32(vector), count = ((u32(vector + 4) - start) | 0) >> 2;
    const required = (count + 1) >>> 0;
    if (required >= 0x40000000) { call(58); throw new WebAssembly.RuntimeError('unreachable'); }
    const capacityBytes = (u32(vector + 8) - start) | 0;
    const doubled = (capacityBytes >> 1) >>> 0;
    const capacity = ((capacityBytes >> 2) >>> 0) < 536870911 ? Math.max(required, doubled) : 1073741823;
    let allocation = 0;
    if (capacity) {
      if (capacity >= 0x40000000) { runtime.host('a', 'f'); throw new WebAssembly.RuntimeError('unreachable'); }
      allocation = call(20, (capacity << 2) >>> 0) >>> 0;
    }
    const inserted = u32(holder);
    word(holder, 0);
    let destination = add(allocation, count << 2);
    word(destination, inserted);
    const capacityEnd = add(allocation, capacity << 2), newEnd = add(destination, 4);
    let oldEnd = u32(vector + 4), oldStart = u32(vector);
    if (oldEnd !== oldStart) {
      do {
        oldEnd = add(oldEnd, -4);
        const moved = u32(oldEnd); word(oldEnd, 0);
        destination = add(destination, -4); word(destination, moved);
      } while (oldStart !== oldEnd);
      word(vector + 8, capacityEnd);
      oldEnd = u32(vector + 4); word(vector + 4, newEnd);
      oldStart = u32(vector); word(vector, destination);
      if (oldStart !== oldEnd) {
        do { oldEnd = releaseDeferredSlot(add(oldEnd, -4)) >>> 0; } while (oldEnd !== oldStart);
      }
    } else {
      word(vector + 8, capacityEnd); word(vector + 4, newEnd); word(vector, destination);
    }
    if (oldStart) call(14, oldStart);
  }

  function swapDeferredCallbacks(left, right) {
    left >>>= 0; right >>>= 0;
    return frame(16, scratch => {
      if (left === right) return;
      let callback = u32(left + 16);
      if (left === callback) {
        if (right === u32(right + 16)) {
          virtual(callback, 3, scratch);
          callback = u32(left + 16); virtual(callback, 4); word(left + 16, 0);
          callback = u32(right + 16); virtual(callback, 3, left);
          callback = u32(right + 16); virtual(callback, 4); word(right + 16, 0);
          word(left + 16, left);
          virtual(scratch, 3, right); virtual(scratch, 4); word(right + 16, right);
        } else {
          virtual(callback, 3, right);
          callback = u32(left + 16); virtual(callback, 4);
          word(left + 16, u32(right + 16)); word(right + 16, right);
        }
        return;
      }
      const other = u32(right + 16);
      if (other === right) {
        virtual(other, 3, left);
        callback = u32(right + 16); virtual(callback, 4);
        word(right + 16, u32(left + 16)); word(left + 16, left);
      } else { word(left + 16, other); word(right + 16, callback); }
    });
  }

  return {
    118: remainingEffectLifetime, 150: releaseDeferredSlot, 271: replaceAreaEffect,
    275: growDeferredVector, 276: swapDeferredCallbacks, 277: acquireDeferredSlot,
  };
}
