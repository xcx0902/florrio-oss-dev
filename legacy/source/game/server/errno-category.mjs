/** Recovered sp_server errno category query (original 295).
 *
 * Saves the caller's errno through 82, then restores the previous errno into the
 * global slot and reports 4 when the current errno object has a category word,
 * otherwise 1.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([295]);

export function createErrnoCategoryHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    295(value) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        memory.setUint32(frame + 12, value, true);
        const saved = runtime.call(82, frame + 8, frame + 12);
        const errnoPointer = memory.getUint32(22540, true);
        const category = memory.getUint32(errnoPointer, true) !== 0 ? 4 : 1;
        const previous = memory.getUint32(saved, true);
        if (previous !== 0) {
          memory.setUint32(22540, previous === 0xffffffff ? 8570492 : previous, true);
        }
        return category;
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
  });
}
