/** Recovered sp_server facet write adapter (original 51).
 *
 * Writes `count` bytes through the stream block writer 274 unless bit 5 (32) of
 * the facet flags at +0 is set.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([51]);

export function createFacetWriteHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    51(facet, source, count) {
      const memory = memoryView();
      if ((memory.getUint8(facet >>> 0) & 32) === 0) runtime.call(274, source, count, facet);
    },
  });
}
