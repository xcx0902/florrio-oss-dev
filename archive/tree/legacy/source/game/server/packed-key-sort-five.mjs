/** Recovered sp_server five-key packed sort (original function 253).
 *
 * Runs the recovered four-key network (function 252) over the first four key
 * references, then inserts the fifth from the right. Keys are ordered by the
 * low 14-bit field first and the high 18-bit field as tie-break, i.e. by
 * `((key & 0x3fff) << 18) | (key >>> 14)` unsigned. The return value is the
 * total number of pair exchanges, including those made by the four-key network.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

import {createPackedKeySortHook} from './packed-key-sort.mjs';

export const functionIds = Object.freeze([253]);
const MINOR_MASK = 0x3fff;

function sortKey(word) {
  return (((word & MINOR_MASK) << 18) | (word >>> 14)) >>> 0;
}

export function createFiveKeySortHook(runtime) {
  const {252: sortFour} = createPackedKeySortHook(runtime);
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 253: sort five referenced u32 keys, returning exchange count. */
  function sortFivePackedKeys(first, second, third, fourth, fifth) {
    try {
      const view = dataView();
      const slots = [first, second, third, fourth, fifth].map(slot => slot >>> 0);
      let exchanges = sortFour(...slots.slice(0, 4));
      for (let index = 4; index > 0; index--) {
        const current = view.getUint32(slots[index], true) >>> 0;
        const previous = view.getUint32(slots[index - 1], true) >>> 0;
        if (sortKey(current) >= sortKey(previous)) break;
        view.setUint32(slots[index], previous, true);
        view.setUint32(slots[index - 1], current, true);
        exchanges++;
      }
      return exchanges;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({253: sortFivePackedKeys});
}
