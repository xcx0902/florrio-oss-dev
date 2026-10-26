/** Recovered client packed-pixel channel extractor (original 530).
 *
 * Samples up to four 8-bit planes through the global 4-byte base table at
 * 104976, composes a 32-bit packed colour with per-plane shifts, then writes
 * each channel minus one to four caller pointers. It also reports the index of
 * the first zero channel (or 3 when all channels are nonzero) through an
 * optional sixth pointer. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const BASE_TABLE = 104976;
const PACKED_MASK = 67305985; // 0x04030201

export const functionIds = Object.freeze([530]);

export function createPixelChannelExtractHooks(runtime) {
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
  const i32At = address => access('getInt32', address, true);
  const u32At = address => access('getUint32', address, true);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const tableBase = index => u32At(BASE_TABLE + ((index & 255) << 2));
  const planeAddress = (descriptor, field, indexField, shiftField) =>
    tableBase(u8(descriptor + indexField))
    + (((u32At(descriptor + field) & PACKED_MASK) >>> u8(descriptor + shiftField)) >>> 0);

  return {
    530: (descriptor, format, out0, out1, out2, out3, outMode) => {
      const plane0 = planeAddress(descriptor, 20, 30, 34);
      const plane1 = planeAddress(descriptor, 16, 29, 33);
      const plane2 = planeAddress(descriptor, 12, 28, 32);

      const alphaWord = i32At(descriptor + 24);
      const alpha = alphaWord === 0 ? 0 : u8(tableBase(u8(descriptor + 31))
        + (((alphaWord & PACKED_MASK) >>> u8(descriptor + 35)) >>> 0));
      const hasAlphaPlane = alphaWord !== 0;

      let pixel = (((u8(plane0) >>> u8(format + 30)) << u8(format + 34))
        | ((u8(plane2) >>> u8(format + 28)) << u8(format + 32))
        | ((u8(plane1) >>> u8(format + 29)) << u8(format + 33))) | 0;

      if (i32At(format + 24) !== 0 && hasAlphaPlane) {
        pixel = (pixel | ((alpha >>> u8(format + 31)) << u8(format + 35))) | 0;
      }

      let channel3 = (pixel >>> 24) & 255;
      let channel2 = (pixel >>> 16) & 255;
      let channel1 = (pixel >>> 8) & 255;
      let channel0 = pixel & 255;
      let mode;

      if (channel0 === 0) {
        channel0 = 1;
        mode = 0;
      } else if (channel1 === 0) {
        channel1 = 1;
        mode = 1;
      } else if (channel2 === 0) {
        channel2 = 1;
        mode = 2;
      } else if ((pixel >>> 0) < 16777216) {
        channel3 = 1;
        mode = 0;
      } else {
        mode = 3;
      }

      set32(out0, (channel0 - 1) | 0);
      set32(out1, (channel1 - 1) | 0);
      set32(out2, (channel2 - 1) | 0);
      set32(out3, (channel3 - 1) | 0);
      if (outMode !== 0) set32(outMode, mode);
    },
  };
}
