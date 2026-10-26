/** Recovered sp_server sequence/table helpers (40, 350, 354, 454, 457, 459,
 * 463, 472). Call-free bodies recovered instruction-for-instruction.
 *
 * 40/350 build a two-word pair; 354 counts non-zero words until a terminator;
 * 454 copies bytes and returns the end pointer; 463 widens signed bytes to
 * i32; 457/459 decode through the tables at 10352/11888 with signed narrowing;
 * 472 tests a bit in the 16-bit table at 9328.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([40, 350, 354, 454, 457, 459, 463, 472]);

export function createSequenceAndTableHelperHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    40(output, first, secondPointer) {
      const memory = memoryView();
      memory.setUint32(output >>> 0, first, true);
      memory.setUint32((output >>> 0) + 4, memory.getUint32(secondPointer >>> 0, true), true);
      return output;
    },
    350(output, secondPointer) {
      const memory = memoryView();
      memory.setUint32(output >>> 0, 0, true);
      memory.setUint32((output >>> 0) + 4, memory.getUint32(secondPointer >>> 0, true), true);
      return output;
    },
    354(words) {
      const memory = memoryView();
      let cursor = words >>> 0;
      let previous = cursor;
      do {
        previous = cursor;
        cursor += 4;
      } while (memory.getUint32(previous, true) !== 0);
      return (previous - (words >>> 0)) >> 2;
    },
    454(_self, begin, end, output) {
      const memory = memoryView();
      let source = begin >>> 0;
      let destination = output >>> 0;
      while (source !== (end >>> 0)) {
        memory.setUint8(destination, memory.getUint8(source));
        destination++;
        source++;
      }
      return end;
    },
    457(_self, value) {
      const memory = memoryView();
      const decoded = value >= 0
        ? memory.getInt32(10352 + ((value & 255) << 2), true)
        : value;
      return (decoded << 24) >> 24;
    },
    459(_self, value) {
      const memory = memoryView();
      const decoded = value >= 0
        ? memory.getInt32(11888 + ((value & 255) << 2), true)
        : value;
      return (decoded << 24) >> 24;
    },
    463(_self, begin, end, output) {
      const memory = memoryView();
      let source = begin >>> 0;
      let destination = output >>> 0;
      while (source !== (end >>> 0)) {
        memory.setInt32(destination, memory.getInt8(source), true);
        destination += 4;
        source++;
      }
      return end;
    },
    472(_self, mask, index) {
      const memory = memoryView();
      if ((index >>> 0) > 127) return 0;
      const bits = memory.getUint16(9328 + (index << 1), true);
      return (bits & mask) !== 0 ? 1 : 0;
    },
  });
}
