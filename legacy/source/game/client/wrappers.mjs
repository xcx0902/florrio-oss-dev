/** Recovered client wrappers whose direct dependencies are recovered functions.
 *
 * 482 delegates to the three-dword zeroing helper 389. 463 compares component
 * record payloads and delegates string comparison to 365. 837 exchanges a
 * global slot with 488. 913 shifts an array of 20-byte records through 363.
 * 582 builds a 128-bit value by shifting through 442.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([482, 463, 582, 837, 913]);

export function createWrapperHooks(runtime) {
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
  const u32At = address => access('getUint32', address, true);
  const u64At = address => access('getBigUint64', address, true);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, value, true);

  return {
    // 482: zero three dwords through 389 and discard the returned pointer.
    482: (p0, p1) => {
      runtime.call(389, p0);
    },

    // 463: compare the payload pointers of two component records.
    463: (p0, p1, p2) => {
      if (!p2) return u32At(at(p0, 4)) === u32At(at(p1, 4)) ? 1 : 0;
      if (u32(p0) === u32(p1)) return 1;
      return runtime.call(365, u32At(at(p0, 4)), u32At(at(p1, 4))) === 0 ? 1 : 0;
    },

    // 582: convert a non-zero u32 to a 128-bit value using 442, then fold the
    // high qword with the exponent adjustment. Zero produces two zero qwords.
    582: (p0, p1) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      if (!p1) {
        set64(at(p0, 0), 0n);
        set64(at(p0, 8), 0n);
        runtime.stackPointer.value = u32(frame + 16);
        return;
      }
      const leading = Math.clz32(u32(p1));
      runtime.call(442, frame, BigInt(u32(p1)), 0n, (leading + 81) | 0);
      const high = BigInt.asUintN(64,
        (u64At(at(frame, 8)) ^ 281474976710656n)
        + (BigInt(u32(16414 - leading)) << 48n));
      set64(at(p0, 0), u64At(frame));
      set64(at(p0, 8), high);
      runtime.stackPointer.value = u32(frame + 16);
    },

    // 837: swap p0 through 488, derive a status word from the exchanged global,
    // then mirror the nonzero value back into the global.
    837: p0 => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set32(at(frame, 12), p0);
      const pointer = runtime.call(488, at(frame, 8), at(frame, 12));
      const status = u32At(u32At(133584)) ? 4 : 1;
      const value = u32At(pointer);
      if (value) {
        u32At(133584);
        set32(133584, value === 0xffffffff ? 7945660 : value);
      }
      runtime.stackPointer.value = u32(frame + 16);
      return status;
    },

    // 913: make room for one more 20-byte record, then shift records down and
    // advance each source pointer by 20.
    913: (p0, p1) => {
      const frame = u32(runtime.stackPointer.value - 256);
      runtime.stackPointer.value = frame;
      if ((p1 | 0) >= 2) {
        set32(u32(p0 + (p1 << 2)), frame);
        runtime.call(363, frame, u32At(p0), 20);
        let index = 0;
        do {
          const slot = u32(p0 + (index << 2));
          const source = u32At(slot);
          const nextSlot = u32(p0 + ((index + 1) << 2));
          runtime.call(363, source, u32At(nextSlot), 20);
          set32(slot, u32(u32At(slot) + 20));
          index++;
        } while ((p1 | 0) !== index);
      }
      runtime.stackPointer.value = u32(frame + 256);
    },
  };
}
