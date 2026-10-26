/** Recovered sp_server wide-string C-string constructor (original 131).
 *
 * Measures the NUL-terminated 32-bit code unit sequence through 354 and builds
 * a libc++ wide string:
 *
 * - up to one unit stays inline and sets the size byte at +11;
 * - longer values allocate `((length+4)&~3)` with the inline-capacity guard,
 *   store pointer at +0, size at +4 and flagged capacity at +8;
 * - `length` units are copied through 112 and a 32-bit terminator is written.
 *
 * Lengths at or above 0x3ffffff0 abort through 58.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([131]);

export function createWideStringConstructorHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    131(destination, text) {
      const memory = memoryView();
      const to = destination >>> 0;
      const length = runtime.call(354, text) >>> 0;
      // The original reserves a 16-byte frame after measuring the length. The
      // allocator's sbrk seed is derived from the stack pointer, so the frame
      // must be live while function 121 runs and is restored on return.
      const savedStack = runtime.stackPointer?.value;
      const frame = savedStack === undefined ? 0 : (savedStack - 16) >>> 0;
      if (savedStack !== undefined) runtime.stackPointer.value = frame;
      try {
        if (length >= 0x3ffffff0) {
          runtime.call(58);
          return;
        }
        let data;
        if (length <= 1) {
          memory.setUint8(to + 11, length);
          data = to;
        } else {
          const rounded = (length + 4) & 0xfffffffc;
          const selected = (rounded - 1) === 2 ? rounded : rounded - 1;
          const allocation = (selected + 1) >>> 0;
          const pointer = runtime.call(121, allocation);
          memory.setUint32(to, pointer, true);
          memory.setUint32(to + 8, (allocation | 0x80000000) >>> 0, true);
          memory.setUint32(to + 4, length, true);
          data = pointer;
        }
        runtime.call(112, data, text, length);
        // The terminator is copied from the frame's zero slot in the original.
        if (savedStack !== undefined) memory.setUint32(frame + 12, 0, true);
        memory.setUint32(data + length * 4, 0, true);
      } finally {
        if (savedStack !== undefined) runtime.stackPointer.value = savedStack;
      }
    },
  });
}
