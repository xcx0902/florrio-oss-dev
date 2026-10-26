/** Recovered sp_server libc++ string copy constructor (original 534).
 *
 * Copies the string object at `source` into `dest`:
 *
 * - short representation (byte +11 sign bit clear): copy the inline i64 and the
 *   size word from +8;
 * - long representation, size <= 1: store the size byte and copy size+1 bytes
 *   inline;
 * - long representation, size >= 2: round the allocation up with the libc++
 *   rule `((size + 4) & ~3) - 1` (mapping 2 to 1), allocate cap+1 bytes with
 *   original 121, write data/capacity/size and copy size+1 bytes with original
 *   112;
 * - size >= 0x3ffffff0 aborts through original 58.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([534]);

export function createStringCopyConstructorHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    534(dest, _p1, _p2, _p3, _p4, source) {
      const memory = memoryView();
      dest >>>= 0;
      source >>>= 0;
      if ((memory.getUint8(source + 11) & 0x80) === 0) {
        memory.setBigUint64(dest, memory.getBigUint64(source, true), true);
        memory.setUint32(dest + 8, memory.getUint32(source + 8, true), true);
        return;
      }

      const data = memory.getUint32(source, true);
      const size = memory.getUint32(source + 4, true);
      if (size <= 1) {
        memory.setUint8(dest + 11, size);
        runtime.call(112, dest, data, size + 1);
        return;
      }
      if (size >= 0x3ffffff0) {
        runtime.call(58);
        return;
      }
      const rounded = ((size + 4) & ~3) - 1;
      const capacity = rounded === 2 ? 1 : rounded;
      const allocation = capacity + 1;
      const allocated = runtime.call(121, allocation) >>> 0;
      memory.setUint32(dest, allocated, true);
      memory.setUint32(dest + 8, (allocation | 0x80000000) >>> 0, true);
      memory.setUint32(dest + 4, size, true);
      runtime.call(112, allocated, data, size + 1);
    },
  });
}
