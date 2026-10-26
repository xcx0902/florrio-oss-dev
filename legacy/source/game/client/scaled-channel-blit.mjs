/** Recovered client scaled channel-scaling blitter (original 2200).
 *
 * Descriptor: source +0, scale width +4, scale height +8, source stride +12,
 * destination +20, output width +24, rows +28, destination stride +32, flags
 * +52, channel factors +60..+62, alpha byte +63. A 16.16 horizontal/vertical
 * accumulator resamples the source; bit0 of the flags scales the low/middle/
 * high channels by the +60..+62 factors, and bit1 forces alpha 255 (otherwise
 * the +63 byte supplies alpha). WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2200]);

export function createScaledChannelBlitHooks(runtime) {
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
  const u8 = address => access('getUint8', address);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const scale = (value, factor) => (Math.imul(value, factor) >>> 0) / 255 >>> 0;

  return {
    2200: descriptor => {
      const oldRows = i32At(descriptor + 28);
      set32(descriptor + 28, (oldRows - 1) | 0);
      const width = i32At(descriptor + 24);
      const horizontalStep = (((i32At(descriptor + 4) << 16) | 0) / width) | 0;
      const verticalStep = (((i32At(descriptor + 8) << 16) | 0) / oldRows) | 0;
      if (oldRows === 0) return;
      const flags = i32At(descriptor + 52);
      const alpha = (flags & 2) !== 0 ? (u8(descriptor + 63) << 24) >>> 0 : 4278190080;
      const scaleChannels = (flags & 1) !== 0;
      const factorLow = u8(descriptor + 62);
      const factorMiddle = u8(descriptor + 61);
      const factorHigh = u8(descriptor + 60);
      let destinationRow = u32At(descriptor + 20);
      let sourceRow = 0;
      let vertical = 0;
      let rowState = (oldRows - 1) | 0;
      const sourceBase = u32At(descriptor);
      const sourceStride = i32At(descriptor + 12);
      const destinationStride = i32At(descriptor + 32);
      for (;;) {
        if (vertical >= 65536) {
          const minimum = vertical < 131071 ? vertical : 131071;
          const delta = (vertical - minimum + 65535) | 0;
          vertical = (vertical - (delta & -65536) - 65536) | 0;
          sourceRow = (sourceRow + ((delta >>> 16) + 1)) | 0;
        }
        let destination = destinationRow;
        if (width !== 0) {
          let horizontal = 65536;
          let sampledRow = -1;
          let sourcePixel = 0;
          let remaining = width;
          do {
            remaining = (remaining - 1) | 0;
            if (horizontal >= 65536) {
              const minimum = horizontal < 131071 ? horizontal : 131071;
              const delta = (horizontal - minimum + 65535) | 0;
              const address = (sourceBase
                + Math.imul(sourceStride, sourceRow)
                + Math.imul(sampledRow + ((delta >>> 16) + 1), 4)) >>> 0;
              sampledRow = (sampledRow + ((delta >>> 16) + 1)) | 0;
              sourcePixel = address;
              horizontal = (horizontal - (delta & -65536) - 65536) | 0;
            }
            const word = u32At(sourcePixel);
            let low = word & 255;
            const middle = (word >>> 8) & 255;
            const high = (word >>> 16) & 255;
            if (scaleChannels) {
              low = scale(low, factorLow);
              set32(destination, (alpha
                | (scale(high, factorHigh) << 16)
                | (scale(middle, factorMiddle) << 8)
                | low) >>> 0);
            } else {
              set32(destination, (alpha | (high << 16) | (middle << 8) | low) >>> 0);
            }
            destination = (destination + 4) >>> 0;
            horizontal = (horizontal + horizontalStep) | 0;
          } while (remaining !== 0);
          rowState = i32At(descriptor + 28);
        }
        set32(descriptor + 28, (rowState - 1) | 0);
        destinationRow = (destinationRow + destinationStride) >>> 0;
        if (rowState === 0) break;
        vertical = (vertical + verticalStep) | 0;
        rowState = (rowState - 1) | 0;
      }
      set32(descriptor + 20, destinationRow);
    },
  };
}
