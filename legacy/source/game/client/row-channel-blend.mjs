/** Recovered client row blender with channel-blending modes (original 2185).
 *
 * Arguments: descriptor with destination at +20, source at +0, width at +24,
 * rows at +28, destination stride at +32 and source stride at +12. The selector
 * is `flags & 112` from +52: 16 copies RGB and forces alpha 255, 32 saturates
 * destination red with source blue / destination blue with source red, 64
 * multiplies the same crossed pairs, and every other value rewrites the
 * destination unchanged. 2203 performs the same loops with straight (not
 * crossed) channel pairs. Widths/rows follow the original post-decrement loops.
 * WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2185, 2203]);

export function createRowChannelBlendHooks(runtime) {
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
  const saturate = value => Math.min(value >>> 0, 255);
  const multiply = (left, right) => (Math.imul(left, right) >>> 0) / 255 >>> 0;

  return {
    2185: descriptor => blend(descriptor, true),
    2203: descriptor => blend(descriptor, false),
  };

  function blend(descriptor, crossed) {
      const oldRows = i32At(descriptor + 28);
      set32(descriptor + 28, (oldRows - 1) | 0);
      if (oldRows === 0) return;
      const selector = i32At(descriptor + 52) & 112;
      let destinationRow = u32At(descriptor + 20);
      let sourceRow = u32At(descriptor);
      let rowsLeft = oldRows;
      do {
        let width = i32At(descriptor + 24);
        let destination = destinationRow;
        let source = sourceRow;
        if (width !== 0) {
          do {
            width = (width - 1) | 0;
            const destinationWord = u32At(destination);
            const sourceWord = u32At(source);
            const sourceRed = sourceWord & 255;
            const sourceGreen = (sourceWord >>> 8) & 255;
            const sourceBlue = (sourceWord >>> 16) & 255;
            const destinationRed = (destinationWord >>> 16) & 255;
            const destinationGreen = (destinationWord >>> 8) & 255;
            const destinationBlue = destinationWord & 255;
            let red, green, blue, alpha;
            if (selector === 16) {
              alpha = 255;
              red = crossed ? sourceRed : sourceBlue;
              green = sourceGreen;
              blue = crossed ? sourceBlue : sourceRed;
            } else if (selector === 32) {
              alpha = destinationWord >>> 24;
              blue = crossed
                ? saturate(destinationBlue + sourceBlue)
                : saturate(destinationBlue + sourceRed);
              green = saturate(destinationGreen + sourceGreen);
              red = crossed
                ? saturate(destinationRed + sourceRed)
                : saturate(destinationRed + sourceBlue);
            } else if (selector === 64) {
              alpha = destinationWord >>> 24;
              blue = crossed
                ? multiply(destinationBlue, sourceBlue)
                : multiply(destinationBlue, sourceRed);
              green = multiply(destinationGreen, sourceGreen);
              red = crossed
                ? multiply(destinationRed, sourceRed)
                : multiply(destinationRed, sourceBlue);
            } else {
              alpha = destinationWord >>> 24;
              red = destinationRed;
              green = destinationGreen;
              blue = destinationBlue;
            }
            set32(destination, ((alpha << 24) | (red << 16) | (green << 8) | blue) >>> 0);
            destination = (destination + 4) >>> 0;
            source = (source + 4) >>> 0;
          } while (width !== 0);
        }
        rowsLeft = (rowsLeft - 1) | 0;
        set32(descriptor + 28, (rowsLeft - 1) | 0);
        destinationRow = (destinationRow + i32At(descriptor + 32)) >>> 0;
        sourceRow = (sourceRow + i32At(descriptor + 12)) >>> 0;
      } while (rowsLeft !== 0);
      set32(descriptor + 20, destinationRow);
      set32(descriptor, sourceRow);
  }
}
