/** Recovered sp_server string constructor from a byte range (original 214).
 *
 * Short strings (<=10 bytes) store the size in the SSO byte, copy through 75 and
 * append a null terminator; longer strings allocate through 173, which copies the
 * prefix and the remaining range.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([214]);

export function createStringFillConstructHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    214(destination, source, length) {
      const memory = memoryView();
      const self = destination >>> 0;
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        if (length <= 10) {
          memory.setUint8(self + 11, length);
          runtime.call(75, self, source, length);
          memory.setUint8(frame + 15, 0);
          memory.setUint8(self + length, memory.getUint8(frame + 15));
          return;
        }
        const oldSize = memory.getUint8(self + 11);
        runtime.call(173, self, 10, length - 10, oldSize, 0, oldSize, length, source);
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
  });
}
