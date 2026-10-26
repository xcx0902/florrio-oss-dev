/** Recovered sp_server dlmalloc block release (original function 286).
 *
 * `releaseBlock(chunk, size)` frees a chunk whose boundary tags use the
 * standard dlmalloc layout:
 *
 *   chunk+0   previous chunk's size (prev_foot)
 *   chunk+4   size | PINUSE(1) | CINUSE(2)
 *   chunk+8   fd, +12 bk            (free list when small)
 *   chunk+16  child[0], +20 child[1], +24 parent, +28 tree index
 *
 * The phases are: merge a free previous chunk, merge the next chunk when it is
 * free/top/designated-victim, otherwise clear the next chunk's PINUSE bit,
 * then insert the resulting free chunk into the small bins or the tree bins.
 * Global state is the small/tree bitmaps, dv/dvsize, top/topsize and the bins.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([286]);

const SMALL_MAP = 8572512;
const TREE_MAP = 8572516;
const DV_SIZE = 8572520;
const TOP_SIZE = 8572524;
const DV = 8572532;
const TOP = 8572536;
const SMALL_BINS = 8572552;
const TREE_BINS = 8572816;

const PINUSE = 1;
const CINUSE = 2; // bit 1 marks the chunk itself as in use
const SIZE_MASK = ~7;

export function createFreeBlockHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const u32 = (p) => view.getUint32(p >>> 0, true) >>> 0;
  const put = (p, value) => view.setUint32(p >>> 0, value >>> 0, true);
  const add = (p, n) => (p + n) >>> 0;
  const headSize = (p) => u32(add(p, 4)) & SIZE_MASK;

  function unlinkSmall(chunk, size) {
    const index = size >>> 3;
    const fd = u32(add(chunk, 8));
    const bk = u32(add(chunk, 12));
    if (fd === bk) {
      put(SMALL_MAP, u32(SMALL_MAP) & ~(1 << index));
    } else {
      put(add(fd, 12), bk);
      put(add(bk, 8), fd);
    }
  }

  /** Remove a free chunk from its tree bin, or from a same-size tree list. */
  function unlinkTree(chunk) {
    const parent = u32(add(chunk, 24));
    const bk = u32(add(chunk, 12));
    if (bk !== chunk) {
      const fd = u32(add(chunk, 8));
      put(add(fd, 12), bk);
      put(add(bk, 8), fd);
      return;
    }
    let child = 0;
    let slot = add(chunk, 20);
    let candidate = u32(slot);
    if (candidate === 0) {
      slot = add(chunk, 16);
      candidate = u32(slot);
    }
    if (candidate !== 0) {
      for (;;) {
        let nextSlot = add(candidate, 20);
        let next = u32(nextSlot);
        if (next === 0) {
          nextSlot = add(candidate, 16);
          next = u32(nextSlot);
          if (next === 0) {
            put(slot, 0);
            child = candidate;
            break;
          }
        }
        slot = nextSlot;
        candidate = next;
      }
    }
    if (parent === 0) return;
    const index = u32(add(chunk, 28));
    const binAddress = add(TREE_BINS, index * 4);
    if (u32(binAddress) === chunk) {
      put(binAddress, child);
      if (child === 0) {
        put(TREE_MAP, u32(TREE_MAP) & ~(1 << index));
        return;
      }
    } else {
      const linkOffset = u32(add(parent, 16)) === chunk ? 16 : 20;
      put(add(parent, linkOffset), child);
      if (child === 0) return;
    }
    put(add(child, 24), parent);
    const first = u32(add(chunk, 16));
    if (first !== 0) {
      put(add(child, 16), first);
      put(add(first, 24), child);
    }
    const second = u32(add(chunk, 20));
    if (second !== 0) {
      put(add(child, 20), second);
      put(add(second, 24), child);
    }
  }

  function unlinkChunk(chunk) {
    const size = headSize(chunk);
    if (size <= 255) unlinkSmall(chunk, size);
    else unlinkTree(chunk);
  }

  /** dlmalloc's bit-twiddled tree-bin index for a chunk size. */
  function treeIndex(size) {
    if (size > 0xffffff) return 31;
    let x = size >>> 8;
    const high = ((x + 1048320) >>> 16) & 8;
    x = (x << high) >>> 0;
    const middle = ((x + 520192) >>> 16) & 4;
    x = (x << middle) >>> 0;
    const low = ((x + 245760) >>> 16) & 2;
    x = (x << low) >>> 0;
    const exponent = ((x >>> 15) - (high | middle | low)) >>> 0;
    return (((exponent << 1) >>> 0) | ((size >>> (exponent + 21)) & 1)) + 28;
  }

  function insertSmall(chunk, size) {
    const index = size >>> 3;
    const bin = add(SMALL_BINS, index * 8);
    const bitmap = u32(SMALL_MAP);
    if ((bitmap & (1 << index)) === 0) {
      put(SMALL_MAP, bitmap | (1 << index));
      put(add(bin, 8), chunk);
      put(add(bin, 12), chunk);
      put(add(chunk, 8), bin);
      put(add(chunk, 12), bin);
      return;
    }
    const first = u32(add(bin, 8));
    put(add(bin, 8), chunk);
    put(add(first, 12), chunk);
    put(add(chunk, 12), bin);
    put(add(chunk, 8), first);
  }

  function insertTree(chunk, size) {
    const index = treeIndex(size);
    put(add(chunk, 16), 0);
    put(add(chunk, 20), 0);
    put(add(chunk, 28), index);
    const binAddress = add(TREE_BINS, index * 4);
    const bitmap = u32(TREE_MAP);
    if ((bitmap & (1 << index)) === 0) {
      put(TREE_MAP, bitmap | (1 << index));
      put(binAddress, chunk);
      put(add(chunk, 24), binAddress);
      put(add(chunk, 8), chunk);
      put(add(chunk, 12), chunk);
      return;
    }
    let lowerBound = (size << (index === 31 ? 0 : 25 - (index >>> 1))) >>> 0;
    let node = u32(binAddress);
    for (;;) {
      if (headSize(node) === size) {
        const first = u32(add(node, 8));
        put(add(first, 12), chunk);
        put(add(node, 8), chunk);
        put(add(chunk, 24), 0);
        put(add(chunk, 12), node);
        put(add(chunk, 8), first);
        return;
      }
      const direction = (lowerBound >>> 29) & 4;
      lowerBound = (lowerBound << 1) >>> 0;
      const childSlot = add(add(node, direction), 16);
      const child = u32(childSlot);
      if (child === 0) {
        put(childSlot, chunk);
        put(add(chunk, 24), node);
        put(add(chunk, 8), chunk);
        put(add(chunk, 12), chunk);
        return;
      }
      node = child;
    }
  }

  /** Original 286: release (chunk, size) into the dlmalloc arenas. */
  function releaseBlock(chunk, size) {
    try {
      dataView();
      chunk >>>= 0;
      size >>>= 0;
      let next = add(chunk, size);
      let head = u32(add(chunk, 4));

      // Merge a free previous chunk: its size sits in this chunk's prev_foot.
      if ((head & PINUSE) === 0) {
        if ((head & 3) === 0) return;
        const previousSize = u32(chunk);
        size = (size + previousSize) >>> 0;
        chunk = (chunk - previousSize) >>> 0;
        if (chunk !== u32(DV)) unlinkChunk(chunk);
      }

      const nextHead = u32(add(next, 4));
      if ((nextHead & CINUSE) !== 0) {
        put(add(next, 4), nextHead & ~PINUSE);
        put(add(chunk, 4), size | PINUSE);
        put(add(chunk, size), size);
      } else if (next === u32(TOP)) {
        put(TOP, chunk);
        size = (u32(TOP_SIZE) + size) >>> 0;
        put(TOP_SIZE, size);
        put(add(chunk, 4), size | PINUSE);
        if (chunk === u32(DV)) {
          put(DV_SIZE, 0);
          put(DV, 0);
        }
        return;
      } else if (next === u32(DV)) {
        put(DV, chunk);
        size = (u32(DV_SIZE) + size) >>> 0;
        put(DV_SIZE, size);
        put(add(chunk, 4), size | PINUSE);
        put(add(chunk, size), size);
        return;
      } else {
        size = (size + (nextHead & SIZE_MASK)) >>> 0;
        unlinkChunk(next);
        put(add(chunk, 4), size | PINUSE);
        put(add(chunk, size), size);
        if (chunk === u32(DV)) {
          put(DV_SIZE, size);
          return;
        }
      }

      if (size <= 255) insertSmall(chunk, size);
      else insertTree(chunk, size);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({286: releaseBlock});
}
