/** Recovered sp_server libc++ string copy assignment (original 228).
 *
 * Short sources (the high bit of byte +11 is clear) copy the inline
 * representation verbatim: the first eight bytes plus the size/flag word at +8.
 * Long sources delegate to the heap-aware assignment helper 269 with the data
 * pointer and byte length.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([228]);

export function createStringCopyAssignmentHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    228(destination, source) {
      const memory = memoryView();
      const from = source >>> 0;
      const to = destination >>> 0;
      if ((memory.getUint8(from + 11) & 0x80) === 0) {
        memory.setBigUint64(to, memory.getBigUint64(from, true), true);
        memory.setUint32(to + 8, memory.getUint32(from + 8, true), true);
        return;
      }
      runtime.call(269, destination, memory.getUint32(from, true), memory.getUint32(from + 4, true));
    },
  });
}
