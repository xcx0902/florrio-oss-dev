/** Recovered sp_server locale facet lifecycle (original 225, 301).
 *
 * Releases the facet pointer stored at +8 unless it is the shared global locale
 * object returned by 33, then returns the facet record. 301 releases the facet
 * member and frees the object itself.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([225, 301]);

export function createLocaleFacetReleaseHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    225(record) {
      const memory = memoryView();
      const self = record >>> 0;
      const facet = memory.getUint32(self + 8, true);
      if (facet !== runtime.call(33)) runtime.call(355, facet);
      return self;
    },
    301(record) {
      const memory = memoryView();
      const self = record >>> 0;
      const facet = memory.getUint32(self + 8, true);
      if (facet !== runtime.call(33)) runtime.call(355, facet);
      runtime.call(14, self);
    },
  });
}
