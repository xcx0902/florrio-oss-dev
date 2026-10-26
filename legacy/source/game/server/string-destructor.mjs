/** Recovered sp_server libc++ string destructor (original 37).
 *
 * Releases the heap buffer of a long string (high bit of byte +11 set) through
 * free and returns the string pointer. Short strings need no release.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([37]);

export function createStringDestructorHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    37(string) {
      const memory = memoryView();
      const address = string >>> 0;
      if ((memory.getUint8(address + 11) & 0x80) !== 0) runtime.call(355, memory.getUint32(address, true));
      return address;
    },
  });
}
