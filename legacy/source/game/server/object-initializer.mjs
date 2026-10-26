/** Recovered sp_server object initializer (original 185).
 *
 * Publishes three vtable words, initializes the payload at +12 through 239, runs
 * the cleanup chain 259 on the header at -64 and returns the object.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([185]);

export function createObjectInitializerHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    185(record) {
      const memory = memoryView();
      const self = record >>> 0;
      memory.setUint32(self + 64, 8524, true);
      memory.setUint32(self, 8484, true);
      memory.setUint32(self + 8, 8504, true);
      runtime.call(239, self + 12);
      runtime.call(259, self - 64);
      return record;
    },
  });
}
