/** Recovered sp_server bump allocator (original function 155).
 *
 * Allocates `bytes` from the global bump pointer at 22596, rounded up to a
 * four-byte boundary. Overflow of the pointer or a zero-sized aligned request
 * returns -1; growth past the current memory size asks the host out-of-memory
 * callback (import 4) and returns -1 if it declines.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([155]);
export const BUMP_POINTER = 22596;
const ABORT_OUT_OF_MEMORY = 4;

export function createBumpAllocatorHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 155: allocate an aligned block from the bump pointer. */
  function allocateBump(bytes) {
    try {
      const view = dataView();
      const start = view.getUint32(BUMP_POINTER, true) >>> 0;
      const aligned = ((bytes >>> 0) + 3) & ~3;
      const end = (start + aligned) >>> 0;
      if (end <= start && aligned !== 0) return -1;
      if (end > runtime.memory.buffer.byteLength) {
        if (runtime.call(ABORT_OUT_OF_MEMORY, end) === 0) return -1;
      }
      view.setUint32(BUMP_POINTER, end, true);
      return start;
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({155: allocateBump});
}
