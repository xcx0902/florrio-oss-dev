/** Recovered client RGB555 pixel writer with four operation modes (original 953).
 *
 * Arguments: surface, x, y, mode, red, green, blue, alpha. The destination is
 * `base + stride*y + x*2`, a 16-bit RGB555 word. The six-bit green channel is
 * expanded through the 64-byte table at 132496; red and blue use the 32-byte
 * table at 132560. Mode 1 blends with `alpha ^ 255`, mode 2 saturates, mode 4
 * multiplies by 255, and every other mode copies the colour arguments. WAT
 * SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const GREEN_TABLE = 132496;
const RED_BLUE_TABLE = 132560;

export const functionIds = Object.freeze([953]);

export function createRgb555WriteModesHooks(runtime) {
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
  const u16 = address => access('getUint16', address, true);
  const i32At = address => access('getInt32', address, true);
  const u32At = address => access('getUint32', address, true);
  const set16 = (address, value) => access('setUint16', address, value, true);
  const greenTable = index => u8(GREEN_TABLE + (index & 63));
  const redBlueTable = index => u8(RED_BLUE_TABLE + (index & 31));
  const mulDiv255 = (left, right) =>
    (Math.imul(left, right) >>> 0) / 255 >>> 0;
  const saturate = value => Math.min(value >>> 0, 255);

  return {
    953: (surface, x, y, mode, red, green, blue, alpha) => {
      const address = (u32At(surface + 20)
        + Math.imul(y, i32At(surface + 16))
        + Math.imul(x, 2)) >>> 0;
      let pixel;
      if (mode === 1) {
        const opacity = (alpha ^ 255) | 0;
        const source = u16(address);
        const blueOut = ((mulDiv255(redBlueTable(source & 31), opacity) | 0)
          + blue) >>> 3;
        const greenOut = ((((mulDiv255(greenTable((source >>> 5) & 63), opacity) | 0)
          + green) << 3) & 8160) | 0;
        const redOut = ((((mulDiv255(redBlueTable(source >>> 11), opacity) | 0)
          + red) << 8) & 63488) | 0;
        pixel = (redOut | greenOut | blueOut) | 0;
      } else if (mode === 2) {
        const source = u16(address);
        const blueOut = saturate(redBlueTable(source & 31) + blue) >>> 3;
        const greenOut = (saturate(greenTable((source >>> 5) & 63) + green) << 3) & 4064;
        const redOut = (saturate(redBlueTable(source >>> 11) + red) << 8) & 63488;
        pixel = (redOut | greenOut | blueOut) | 0;
      } else if (mode === 4) {
        const source = u16(address);
        const blueOut = (mulDiv255(redBlueTable(source & 31), blue) | 0) >>> 3;
        const greenOut = ((mulDiv255(greenTable((source >>> 5) & 63), green) | 0) << 3) & 4064;
        const redOut = ((mulDiv255(redBlueTable(source >>> 11), red) | 0) << 8) & 63488;
        pixel = (redOut | greenOut | blueOut) | 0;
      } else {
        pixel = ((((green << 3) & 2016)
          | ((red << 8) & 63488)
          | (blue >>> 3))) | 0;
      }
      set16(address, pixel);
      return 0;
    },
  };
}
