/** Recovered sp_server four-record comparison-sort network (original function 159).
 *
 * Sorts up to four 8-byte records by their f32 key at +4, carrying the byte tag
 * at +0. The original is an insertion-style three-element network followed by
 * an insertion of the fourth record, with early exits; the return value is the
 * number of compare-and-swap steps that actually exchanged a pair.
 *
 * Records are independent pointers, so the routine sorts the four referenced
 * records in place rather than a contiguous array. Only the tag byte and the
 * f32 key are exchanged; bytes 1..3 of each record are untouched.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([159]);

export function createFourRecordSortHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 159: sort four referenced records by key, returning swap count. */
  function sortFourRecords(first, second, third, fourth) {
    const view = dataView();
    const key = (record) => view.getFloat32((record + 4) >>> 0, true);
    const tag = (record) => view.getUint8(record >>> 0);
    const setTag = (record, value) => view.setUint8(record >>> 0, value);
    const setKey = (record, value) => view.setFloat32((record + 4) >>> 0, value, true);

    function swap(left, right) {
      const leftTag = tag(left);
      const leftKey = key(left);
      setTag(left, tag(right));
      setKey(left, key(right));
      setTag(right, leftTag);
      setKey(right, leftKey);
    }

    let lastKey;
    let middleKey;
    let firstKey;
    let swaps = 0;

    // Sort the first three records with the original branching network.
    outer: {
      middleKey = key(second);
      firstKey = key(first);
      if (!(middleKey < firstKey)) {
        if (!(middleKey > key(third))) {
          lastKey = key(third);
          break outer;
        }
        swap(second, third);
        swaps = 1;
        lastKey = key(third);
        middleKey = key(second);
        firstKey = key(first);
        if (!(middleKey < firstKey)) break outer;
        swap(first, second);
        lastKey = key(third);
        swaps = 2;
        break outer;
      }

      if (middleKey > key(third)) {
        swap(first, third);
        swaps = 1;
      } else {
        swap(first, second);
        swaps = 1;
        lastKey = key(third);
        if (!(lastKey < firstKey)) break outer;
        swap(second, third);
        swaps = 2;
      }
      lastKey = firstKey;
    }

    // Insert the fourth record, counting each exchange it needs.
    if (lastKey > key(fourth)) {
      swap(third, fourth);
      lastKey = key(third);
      middleKey = key(second);
      if (!(lastKey < middleKey)) return swaps + 1;
      swap(second, third);
      lastKey = key(second);
      middleKey = key(first);
      if (!(lastKey < middleKey)) return swaps + 2;
      swap(first, second);
      return swaps + 3;
    }
    return swaps;
  }

  return Object.freeze({159: sortFourRecords});
}
