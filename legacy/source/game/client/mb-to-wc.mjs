/** Recovered client multibyte-to-wide-character conversion (original 651).
 *
 * Arguments: output pointer, input bytes, byte count, optional state pointer.
 * A null state pointer selects the global state at 7945608. The function follows
 * the C-locale fast path, otherwise decodes through the lead table at 125632.
 * Incomplete sequences save the state and return -2; illegal sequences clear
 * the state, store errno 25 and return -1. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const GLOBAL_STATE = 7945608;
const LOCALE_FLAG = 133584;
const LEAD_TABLE = 125632;
const ERRNO = 7944552;

export const functionIds = Object.freeze([651]);

export function createMbToWcHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function access(method, address, ...args) {
    try {
      return dataView()[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const u8 = address => access('getUint8', address);
  const i8 = address => access('getInt8', address);
  const i32At = address => access('getInt32', address, true);
  const u32At = address => access('getUint32', address, true);
  const set32 = (address, value) => access('setInt32', address, value, true);

  return {
    651: (outputValue, inputValue, count, statePointerValue) => {
      const stack = runtime.stackPointer.value;
      runtime.stackPointer.value = (stack - 16) | 0;
      const statePointer = statePointerValue === 0 ? GLOBAL_STATE : statePointerValue;
      let state = i32At(statePointer);
      let input = inputValue >>> 0;
      const output = outputValue === 0 ? (stack - 4) | 0 : outputValue;
      let result = -2;

      const illegal = () => {
        set32(statePointer, 0);
        set32(ERRNO, 25);
        result = -1;
        runtime.stackPointer.value = stack;
        return result;
      };
      const incomplete = () => {
        set32(statePointer, state);
        result = -2;
        runtime.stackPointer.value = stack;
        return result;
      };

      if (inputValue === 0) {
        runtime.stackPointer.value = stack;
        return state !== 0 ? illegal() : 0;
      }
      if (count === 0) {
        runtime.stackPointer.value = stack;
        return -2;
      }

      let remaining = count;
      if (state === 0) {
        const byte = u8(input);
        const signed = i8(input);
        if (signed >= 0) {
          set32(output, byte);
          result = signed === 0 ? 0 : 1;
          runtime.stackPointer.value = stack;
          return result;
        }
        if (i32At(u32At(LOCALE_FLAG)) === 0) {
          set32(output, signed & 57343);
          runtime.stackPointer.value = stack;
          return 1;
        }
        if (((byte - 194) >>> 0) > 50) return illegal();
        state = i32At(LEAD_TABLE + ((byte - 194) * 4));
        if (count - 1 === 0) return incomplete();
        remaining = (count - 1) | 0;
        input = (input + 1) | 0;
      }

      for (;;) {
        const byte = u8(input);
        const shifted = byte >>> 3;
        if ((((shifted - 16) | ((state >> 26) + shifted)) >>> 0) > 7)
          return illegal();
        remaining = (remaining - 1) | 0;
        state = ((byte - 128) | (state << 6)) | 0;
        if (state >= 0) {
          set32(statePointer, 0);
          set32(output, state);
          result = (count - remaining) | 0;
          runtime.stackPointer.value = stack;
          return result;
        }
        if (remaining === 0) return incomplete();
        input = (input + 1) | 0;
        const next = u8(input);
        if ((next & 192) !== 128) return illegal();
      }
    },
  };
}
