/** Recovered server small memory helpers (originals 19,20,24).
 *
 * 19 destroys a libc++ string and returns it. 20 is the aborting operator new.
 * 24 clears three consecutive words and returns the block.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([19, 20, 24]);

export function createSmallMemoryHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    19(record) {
      const memory = memoryView();
      if ((memory.getUint8((record >>> 0) + 11) & 0x80) !== 0)
        runtime.call(14, memory.getUint32(record >>> 0, true));
      return record;
    },
    20(size) {
      const request = size === 0 ? 1 : size;
      const pointer = runtime.call(16, request);
      if (pointer === 0) {
        runtime.host('a', 'f');
        throw new WebAssembly.RuntimeError('unreachable');
      }
      return pointer;
    },
    24(block) {
      const memory = memoryView();
      for (let index = 0; index < 3; index++)
        memory.setUint32(((block >>> 0) + index * 4) >>> 0, 0, true);
      return block;
    },
  });
}
