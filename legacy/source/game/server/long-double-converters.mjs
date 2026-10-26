/** Recovered sp_server floating conversion wrappers (original 140, 258, 356).
 *
 * 258 flips the sign of the fourth 64-bit operand, converts through 66 and
 * copies the 16-byte result. 140 forwards four arguments to 188. 356 forwards a
 * format id and argument to 357.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([140, 258, 356]);

export function createLongDoubleConverterHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    140(first, second, third, fourth) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        memory.setUint32(frame + 12, fourth, true);
        return runtime.call(188, first, second, third, fourth);
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
    258(destination, first, second, third, fourth) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        runtime.call(66, frame, first, second, third, fourth ^ -9223372036854775808n);
        memory.setBigUint64(destination >>> 0, memory.getBigUint64(frame, true), true);
        memory.setBigUint64((destination >>> 0) + 8, memory.getBigUint64(frame + 8, true), true);
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
    356(destination, argument) {
      const memory = memoryView();
      const stack = runtime.stackPointer.value;
      const frame = (stack - 16) >>> 0;
      runtime.stackPointer.value = frame;
      try {
        memory.setUint32(frame + 12, argument, true);
        return runtime.call(357, destination, 3166, argument);
      } finally {
        runtime.stackPointer.value = stack;
      }
    },
  });
}
