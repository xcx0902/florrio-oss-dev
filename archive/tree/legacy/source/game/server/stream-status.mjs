/** Recovered sp_server stream status probes (original 362, 367).
 *
 * Both probe the stream stored at `handle`: when the get area at +12 equals the
 * end at +16 they call the virtual peek slot at vtable+36, otherwise they load
 * a 32-bit word (362) or unsigned byte (367) at +12. A non-EOF value returns 1
 * only if the handle is already null, otherwise 0. EOF clears the handle and
 * returns 1; a null stream also returns 1.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([362, 367]);

export function createStreamStatusHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function probe(memory, handle, wide) {
    const slot = handle >>> 0;
    const stream = memory.getUint32(slot, true);
    if (stream === 0) return 1;
    const read = memory.getUint32(stream + 12, true);
    let value;
    if (read === memory.getUint32(stream + 16, true)) {
      const table = memory.getUint32(stream, true);
      const method = memory.getUint32(table + 36, true);
      value = runtime.indirect({parameters: ['i32'], results: ['i32']}, method, stream);
    } else {
      value = wide ? memory.getInt32(read, true) : memory.getUint8(read);
    }
    if (value !== -1) return memory.getUint32(slot, true) === 0 ? 1 : 0;
    memory.setUint32(slot, 0, true);
    return 1;
  }

  return Object.freeze({
    362(handle) {
      return probe(memoryView(), handle, true);
    },
    367(handle) {
      return probe(memoryView(), handle, false);
    },
  });
}
