/** Recovered sp_server small accessors and constants (original 628, 649, 722, 737).
 *
 * - 628 loads the 32-bit field at +8;
 * - 649 returns a zero 64-bit value, ignoring its arguments;
 * - 722 installs the vtable constant 5184 at +0 and returns the record;
 * - 737 returns the constant 0.95f.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([628, 649, 722, 737]);

export function createSmallAccessorHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    628(record) {
      return memoryView().getInt32((record >>> 0) + 8, true);
    },
    649() {
      return 0n;
    },
    722(record) {
      const memory = memoryView();
      const self = record >>> 0;
      memory.setUint32(self, 5184, true);
      return self;
    },
    737() {
      return Math.fround(0.95);
    },
  });
}
