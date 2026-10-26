/** Recovered sp_server errno-preserving parse wrappers (original 223, 296).
 *
 * Both save errno through 82, call a parser (124/184), then restore the previous
 * errno into the global slot and return the parser result.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([223, 296]);

export function createErrnoParseWrapperHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function restore(memory, saved) {
    const previous = memory.getUint32(saved >>> 0, true);
    if (previous !== 0) {
      memory.setUint32(22540, previous === 0xffffffff ? 8570492 : previous, true);
    }
  }

  return Object.freeze({
    223(first, second, base) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        memory.setUint32(frame + 12, base, true);
        const saved = runtime.call(82, frame + 8, frame + 12);
        const result = runtime.call(124, first, second);
        restore(memory, saved);
        return result;
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
    296(first, second, third, fourth, base) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        memory.setUint32(frame + 12, base, true);
        const saved = runtime.call(82, frame + 8, frame + 12);
        const result = runtime.call(184, first, second, third, fourth);
        restore(memory, saved);
        return result;
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
  });
}
