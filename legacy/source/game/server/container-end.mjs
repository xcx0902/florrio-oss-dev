/** Recovered sp_server container end-pointer accessors (functions 109 and 111).
 *
 * Both read a container whose byte at +11 has 0x80 set for heap storage:
 * heap storage keeps the payload pointer at +0 and element count at +4;
 * inline storage starts at +0 and keeps the count in the low seven bits of
 * byte +11. Function 109 returns data + count*4 (32-bit elements), function 111
 * returns data + count (bytes). Each also leaves the computed pointer in its
 * 16-byte stack frame at frame+8, which is reproduced.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([109, 111]);

export function createContainerEndHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function storage(view, container) {
    const flags = view.getUint8(container + 11);
    if ((flags & 0x80) !== 0) {
      return {base: view.getUint32(container, true) >>> 0,
        count: view.getUint32(container + 4, true) >>> 0};
    }
    return {base: container >>> 0, count: flags & 0x7f};
  }

  function recordAndReturn(view, value) {
    view.setUint32((runtime.stackPointer.value - 8) >>> 0, value, true);
    return value;
  }

  /** Original 109: end pointer for 32-bit elements. */
  function endOfWordContainer(container) {
    try {
      const view = dataView();
      const {base, count} = storage(view, container);
      return recordAndReturn(view, (base + Math.imul(count, 4)) >>> 0);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  /** Original 111: end pointer for byte elements. */
  function endOfByteContainer(container) {
    try {
      const view = dataView();
      const {base, count} = storage(view, container);
      return recordAndReturn(view, (base + count) >>> 0);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  return Object.freeze({109: endOfWordContainer, 111: endOfByteContainer});
}
