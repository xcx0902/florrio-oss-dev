/** Recovered sp_server string identity/equality predicate (original 69).
 *
 * Compares two records whose +4 word points at a NUL-terminated byte string.
 * With `compareText` clear only the pointers are compared; otherwise distinct
 * records compare their text through 126 and equal pointers short-circuit true.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([69]);

export function createStringIdentityEqualityHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    69(left, right, compareText) {
      const memory = memoryView();
      const a = left >>> 0;
      const b = right >>> 0;
      const leftText = memory.getUint32(a + 4, true);
      const rightText = memory.getUint32(b + 4, true);
      if (!compareText) return leftText === rightText ? 1 : 0;
      if (a === b) return 1;
      return runtime.call(126, leftText, rightText) === 0 ? 1 : 0;
    },
  });
}
