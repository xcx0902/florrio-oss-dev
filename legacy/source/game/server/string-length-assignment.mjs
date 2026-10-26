/** Recovered sp_server libc++ string assignment from bytes (original 269).
 *
 * Assigns `length` bytes from `text` into the string at `destination`:
 *
 * - up to 10 bytes stay inline in the object and set the size byte at +11;
 * - longer strings allocate a rounded capacity (`(length+16)&~15`, plus one),
 *   store the data pointer at +0, size at +4 and flagged capacity at +8;
 * - `length+1` bytes are copied so the terminator is included.
 *
 * Lengths at or above 0xfffffff0 abort through 58. Allocation uses 20 and the
 * copy uses 75.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([269]);

export function createStringLengthAssignmentHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    269(destination, text, length) {
      const memory = memoryView();
      const to = destination >>> 0;
      const count = length >>> 0;
      let data;
      if (count <= 10) {
        memory.setUint8(to + 11, count);
        data = to;
      } else {
        if (count >= 0xfffffff0) {
          runtime.call(58);
          return;
        }
        const rounded = (count + 16) & 0xfffffff0;
        const allocation = (((rounded - 1) === 11 ? rounded + 1 : rounded)) >>> 0;
        const pointer = runtime.call(20, allocation);
        memory.setUint32(to, pointer, true);
        memory.setUint32(to + 8, (allocation | 0x80000000) >>> 0, true);
        memory.setUint32(to + 4, count, true);
        data = pointer;
      }
      runtime.call(75, data, text, (count + 1) >>> 0);
    },
  });
}
