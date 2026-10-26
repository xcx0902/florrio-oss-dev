/** Recovered client packed-pixel writer with four operation modes (original 952).
 *
 * Arguments: surface, x, y, mode, red, green, blue, alpha. The address is
 * `base + stride*y + x*4`. Mode 1 alpha-blends with `alpha ^ 255` and adds the
 * colour arguments; mode 2 saturates source+bias; mode 4 writes the colour
 * arguments directly; every other mode multiplies source by the colour
 * arguments and divides by 255. The original always returns 0. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([952]);

export function createPixelWriteModesHooks(runtime) {
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
  const i32At = address => access('getInt32', address, true);
  const u32At = address => access('getUint32', address, true);
  const set32 = (address, value) => access('setUint32', address, value, true);

  const mulDiv255 = (left, right) =>
    (Math.imul(left, right) >>> 0) / 255 >>> 0;
  const saturate = value => Math.min(value >>> 0, 255);

  return {
    952: (surface, x, y, mode, red, green, blue, alpha) => {
      const address = (u32At(surface + 20)
        + Math.imul(y, i32At(surface + 16))
        + Math.imul(x, 4)) >>> 0;
      let pixel;
      if (mode === 1) {
        const opacity = (alpha ^ 255) | 0;
        const source = u32At(address);
        const blueOut = (blue + (mulDiv255(source & 255, opacity) | 0)) | 0;
        const greenOut = (green
          + (mulDiv255((source >>> 8) & 255, opacity) | 0)) | 0;
        const redOut = (red
          + (mulDiv255((source >>> 16) & 255, opacity) | 0)) | 0;
        pixel = (blueOut | (greenOut << 8) | (redOut << 16)) | 0;
      } else if (mode === 2) {
        const source = u32At(address);
        pixel = ((saturate((source & 255) + blue) | 0)
          | (saturate(((source >>> 8) & 255) + green) << 8)
          | (saturate(((source >>> 16) & 255) + red) << 16)) | 0;
      } else if (mode === 4) {
        const source = u32At(address);
        pixel = ((mulDiv255(source & 255, blue) | 0)
          | (mulDiv255((source >>> 8) & 255, green) << 8)
          | (mulDiv255((source >>> 16) & 255, red) << 16)) | 0;
      } else {
        pixel = (blue | (green << 8) | (red << 16)) | 0;
      }
      set32(address, pixel);
      return 0;
    },
  };
}
