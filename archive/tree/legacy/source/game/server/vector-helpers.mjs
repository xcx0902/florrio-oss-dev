/** Recovered sp_server vector helper (original function 306).
 *
 * Appends `count` zeroed 32-bit slots to the global vector at 8572320 by
 * clearing each slot at the current end and advancing the end pointer. The
 * vector header is {begin, end}: only the end word changes.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([306]);
export const VECTOR_HEADER = 8572320;

export function createVectorHelperHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 306: append zeroed slots to the global vector. */
  function appendZeroedSlots(count) {
    try {
      const view = dataView();
      let cursor = view.getUint32(VECTOR_HEADER + 4, true) >>> 0;
      const end = (cursor + Math.imul(count >>> 0, 4)) >>> 0;
      const frame = (runtime.stackPointer.value - 16) >>> 0;
      view.setUint32(frame, VECTOR_HEADER, true);
      view.setUint32(frame + 4, cursor, true);
      view.setUint32(frame + 8, end, true);
      while (cursor !== end) {
        view.setUint32(cursor, 0, true);
        cursor = (cursor + 4) >>> 0;
      }
      view.setUint32(frame + 4, cursor, true);
      view.setUint32(VECTOR_HEADER + 4, cursor, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({306: appendZeroedSlots});
}
