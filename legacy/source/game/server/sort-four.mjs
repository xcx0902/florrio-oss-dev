/** Recovered sp_server four-element ordering step (original 244).
 *
 * Runs 137 on the first three elements, then inserts the fourth value into the
 * already ordered prefix and returns 137's swap count plus the number of extra
 * swaps.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([244]);

export function createSortFourHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function swap(memory, left, right) {
    const first = memory.getUint32(left >>> 0, true);
    memory.setUint32(left >>> 0, memory.getUint32(right >>> 0, true), true);
    memory.setUint32(right >>> 0, first, true);
  }

  return Object.freeze({
    244(first, second, third, fourth) {
      const memory = memoryView();
      let swaps = runtime.call(137, first, second, third);
      if (memory.getUint32(fourth >>> 0, true) >= memory.getUint32(third >>> 0, true)) return swaps;
      swap(memory, third, fourth);
      if (memory.getUint32(third >>> 0, true) >= memory.getUint32(second >>> 0, true)) return swaps + 1;
      swap(memory, second, third);
      if (memory.getUint32(second >>> 0, true) >= memory.getUint32(first >>> 0, true)) return swaps + 2;
      swap(memory, first, second);
      return swaps + 3;
    },
  });
}
