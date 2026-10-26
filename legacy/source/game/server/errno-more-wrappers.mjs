/** Recovered sp_server errno-preserving wrappers (original 52, 340, 477).
 *
 * 52 and 340 save errno through 82 around 188/357 and restore it. 477 reports
 * whether the value at +8 is missing or has errno category 1.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([52, 340, 477]);

export function createErrnoMoreWrapperHooks(runtime) {
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
    52(first, second, third, fourth, fifth) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        memory.setUint32(frame + 12, third, true);
        memory.setUint32(frame + 8, fifth, true);
        const saved = runtime.call(82, frame, frame + 12);
        const result = runtime.call(188, first, second, fourth, memory.getUint32(frame + 8, true));
        restore(memory, saved);
        return result;
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
    340(first, second, third) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        memory.setUint32(frame + 12, second, true);
        memory.setUint32(frame + 8, third, true);
        const saved = runtime.call(82, frame, frame + 12);
        const result = runtime.call(357, first, 2568, memory.getUint32(frame + 8, true));
        restore(memory, saved);
        return result;
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
    477(record) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        const value = memory.getUint32((record >>> 0) + 8, true);
        memory.setUint32(frame + 12, value, true);
        const saved = runtime.call(82, frame + 8, frame + 12);
        restore(memory, saved);
        if (value === 0) return 1;
        return runtime.call(295, value) === 1 ? 1 : 0;
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
  });
}
