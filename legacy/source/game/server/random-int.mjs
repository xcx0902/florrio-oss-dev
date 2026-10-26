/** Recovered sp_server random integer fetch (original 130).
 *
 * Fills a 4-byte stack slot through the random import (13), aborts through 42 on
 * failure, and returns the signed value.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([130]);

export function createRandomIntHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    130() {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        if (runtime.host('a', 'n', frame + 12, 4) !== 0) {
          runtime.call(42);
          throw new Error('unreachable');
        }
        return memory.getInt32(frame + 12, true);
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
  });
}
