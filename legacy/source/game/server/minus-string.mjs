/** Recovered sp_server single-character string initializer (original 326).
 *
 * Turns a libc++ string into the one-character short string "-": size 1 at
 * +11, '-' at +0 and a NUL terminator at +1.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([326]);

export function createMinusStringHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    326(string) {
      const memory = memoryView();
      const self = string >>> 0;
      memory.setUint8(self + 11, 1);
      memory.setUint8(self, 45);
      memory.setUint8(self + 1, 0);
    },
  });
}
