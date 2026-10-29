/** Recovered sp_server stream state primitives (original 430, 625).
 *
 * 430 updates the stream state byte at +74 (bit trick `(value-1)|value`). Flag
 * bit 8 records a hard error (+32) and returns -1; otherwise it zeroes the
 * 64-bit field at +4, resets the get/put cursors from +44 and returns 0.
 *
 * 625 peeks the next input byte without advancing: it lifts +44 to +24, when
 * input is enabled (+48 & 8) and +44 is past +16 it records +16=+44, then reads
 * the byte at +16 while +16 > +12, or returns -1.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([430, 625]);

export function createStreamStatePrimitiveHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    430(state) {
      const memory = memoryView();
      const self = state >>> 0;
      const value = memory.getUint8(self + 74);
      memory.setUint8(self + 74, ((value - 1) | value) & 0xff);
      const flags = memory.getUint32(self, true);
      if ((flags & 8) !== 0) {
        memory.setUint32(self, flags | 32, true);
        return -1;
      }
      memory.setBigUint64(self + 4, 0n, true);
      const cursor = memory.getUint32(self + 44, true);
      memory.setUint32(self + 28, cursor, true);
      memory.setUint32(self + 20, cursor, true);
      memory.setUint32(self + 16, (cursor + memory.getUint32(self + 48, true)) >>> 0, true);
      return 0;
    },
    625(state) {
      const memory = memoryView();
      const self = state >>> 0;
      let position = memory.getUint32(self + 44, true);
      const pending = memory.getUint32(self + 24, true);
      if (position < pending) {
        memory.setUint32(self + 44, pending, true);
        position = pending;
      }
      if ((memory.getUint8(self + 48) & 8) === 0) return -1;
      if (position > memory.getUint32(self + 16, true)) memory.setUint32(self + 16, position, true);
      const read = memory.getUint32(self + 16, true);
      if (read <= memory.getUint32(self + 12, true)) return -1;
      return memory.getUint8(read);
    },
  });
}
