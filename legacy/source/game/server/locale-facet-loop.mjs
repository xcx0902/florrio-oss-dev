/** Recovered sp_server locale facet loop (original 442).
 *
 * Uses the facet at +8 through 221 when it matches the locale facet, otherwise
 * runs the first invoker and then up to the recorded facet count through 287,
 * stopping early when the stream marks byte +54.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([442]);

export function createLocaleFacetLoopHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    442(self, record, first, second) {
      const memory = memoryView();
      const base = self >>> 0;
      if (runtime.call(69, base, memory.getUint32((record >>> 0) + 8, true), 0) !== 0) {
        runtime.call(221, record, first, second);
        return;
      }
      const count = memory.getInt32(base + 12, true);
      const start = base + 16;
      runtime.call(287, start, record, first, second);
      if (count < 2) return;
      const end = start + count * 8;
      for (let slot = base + 24; slot < end; slot += 8) {
        runtime.call(287, slot, record, first, second);
        if (memory.getUint8((record >>> 0) + 54) !== 0) return;
      }
    },
  });
}
