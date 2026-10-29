/** Recovered client RGBA8888 pixel writer with four operation modes (original 951).
 *
 * Arguments: surface, x, y, mode, red, green, blue, alpha. The destination is
 * `base + stride*y + x*4`. Mode 1 alpha-blends with `alpha ^ 255` (the high byte
 * is blended with the original alpha argument), mode 2 saturates the low three
 * bytes while preserving the high byte, mode 4 multiplies the low three bytes
 * while preserving the high byte, and every other mode copies RGBA. The
 * original always returns 0. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([951]);

export function createRgba8888WriteModesHooks(runtime) {
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
    951: (surface, x, y, mode, red, green, blue, alpha) => {
      const address = (u32At(surface + 20)
        + Math.imul(y, i32At(surface + 16))
        + Math.imul(x, 4)) >>> 0;
      let pixel;
      if (mode === 1) {
        const opacity = (alpha ^ 255) | 0;
        const source = u32At(address);
        const highOut = ((((mulDiv255(source >>> 24, opacity) | 0) + alpha) << 24)) | 0;
        const blueOut = (mulDiv255(source & 255, opacity) | 0) + blue | 0;
        const greenOut = ((((mulDiv255((source >>> 16) & 255, opacity) | 0)
          + red) << 16)) | 0;
        const alphaOut = ((((mulDiv255((source >>> 8) & 255, opacity) | 0)
          + green) << 8)) | 0;
        pixel = (highOut | greenOut | alphaOut | blueOut) | 0;
      } else if (mode === 2) {
        const source = u32At(address);
        pixel = ((source & 0xff000000)
          | (saturate(((source >>> 16) & 255) + red) << 16)
          | (saturate(((source >>> 8) & 255) + green) << 8)
          | saturate((source & 255) + blue)) | 0;
      } else if (mode === 4) {
        const source = u32At(address);
        pixel = ((source & 0xff000000)
          | ((mulDiv255((source >>> 16) & 255, red) | 0) << 16)
          | ((mulDiv255((source >>> 8) & 255, green) | 0) << 8)
          | (mulDiv255(source & 255, blue) | 0)) | 0;
      } else {
        pixel = ((alpha << 24) | (red << 16) | (green << 8) | blue) | 0;
      }
      set32(address, pixel);
      return 0;
    },
  };
}
