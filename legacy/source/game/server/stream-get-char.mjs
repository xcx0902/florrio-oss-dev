/** Recovered sp_server character fetch (original 633).
 *
 * Calls the virtual peek slot at vtable+36. When it does not report -1, the
 * cursor at +12 is advanced and the byte it previously addressed is returned;
 * otherwise -1 is returned.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([633]);

export function createStreamGetCharHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    633(state) {
      const memory = memoryView();
      const self = state >>> 0;
      const table = memory.getUint32(self, true);
      const method = memory.getUint32(table + 36, true);
      const peeked = runtime.indirect({parameters: ['i32'], results: ['i32']}, method, self);
      if (peeked === -1) return -1;
      const cursor = memory.getUint32(self + 12, true);
      memory.setUint32(self + 12, cursor + 1, true);
      return memory.getUint8(cursor);
    },
  });
}
