/** Recovered client functions whose direct dependencies are already recovered.
 *
 * These bodies still call their dependencies through runtime.call, so the
 * original stack, memory and trap behavior stays shared. Function ids and WAT
 * lines come from reports/wasm/client-functions.json and source/wasm/client.wat
 * (SHA-256 d186265b...).
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([866, 1980, 3574, 4207, 3830]);

export function createComposedHooks(runtime) {
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
  const u32At = address => access('getUint32', address, true);
  const u64At = address => access('getBigUint64', address, true);
  const f64At = address => access('getFloat64', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, value, true);
  const f32Bits = new DataView(new ArrayBuffer(4));
  const f64Bits = new DataView(new ArrayBuffer(8));
  function demote(value) {
    if (!Number.isNaN(value)) return Math.fround(value);
    f64Bits.setFloat64(0, value, true);
    const bits = f64Bits.getBigUint64(0, true);
    const fraction = Number((bits >> 29n) & 0x7fffffn);
    f32Bits.setUint32(0, (Number(bits >> 63n) << 31 | 0x7f800000 | fraction
      | (fraction === 0 ? 0x400000 : 0)) >>> 0, true);
    return f32Bits.getFloat32(0, true);
  }

  return {
    // 866: initialise a one-character "-" string in its inline buffer. The
    // fill helper is recovered 865; the terminating zero passes through a
    // 16-byte stack frame, whose scratch byte remains visible.
    866: (p0, p1) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set8(at(p0, 11), 1);
      const filled = u32(runtime.call(865, p0, 1, 45));
      set8(at(frame, 15), 0);
      set8(at(filled, 1), u8(at(frame, 15)));
      runtime.stackPointer.value = u32(frame + 16);
    },

    // 1980: copy min(capacity-end, requested) bytes to the buffer end, advance
    // the end offset, and return the caller's requested byte count.
    1980: (p0, p1, p2) => {
      const end = u32At(at(p0, 20));
      const available = (u32At(at(p0, 16)) - end) | 0;
      const requested = p2 | 0;
      const length = (available >>> 0) > (requested >>> 0) ? requested : available;
      runtime.call(363, end, p1, length);
      set32(at(p0, 20), (end + length) | 0);
      return p2 | 0;
    },

    // 3574: read the clock into a 16-byte frame, then copy its qwords into p0
    // at +8 and +16 in reverse order.
    3574: (p0, p1) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      runtime.call(372, frame);
      set64(at(p0, 16), u64At(at(frame, 8)));
      set64(at(p0, 8), u64At(at(frame, 0)));
      runtime.stackPointer.value = u32(frame + 16);
    },

    // 4207: conditionally read the clock when [p2+144] is nonzero. The frame
    // is still allocated and released when the condition is false.
    4207: (p0, p1, p2) => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      if (u32At(at(p2, 144))) runtime.call(372, frame);
      runtime.stackPointer.value = u32(frame + 16);
    },

    // 3830: elapsed seconds from a timestamp record, with +infinity when the
    // record is invalid and -infinity when the clock output is invalid.
    3830: p0 => {
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      runtime.call(372, frame);
      let elapsed;
      if (!u8(at(p0, 8))) elapsed = Infinity;
      else if (!u8(at(frame, 0))) elapsed = -Infinity;
      else elapsed = demote(f64At(at(p0, 16)) - f64At(at(frame, 8)));
      runtime.stackPointer.value = u32(frame + 16);
      return elapsed;
    },
  };
}
