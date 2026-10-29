/** Recovered client compositing blitter with four selector wrappers
 * (originals 2192/2197/2209/2214).
 *
 * Each row walks source and destination words, splits B/G/R bytes, selects an
 * operation from `(flags & 112) - 16`, then writes the composed word back. The
 * selector uses a br_table: 16 skips, 17..31 keep the destination, 32 copies the
 * source, everything else saturates at 255. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([2192, 2197, 2209, 2214]);

export function createBlendBlitHooks(runtime) {
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

  function blit(p0, crossed) {
    const oldRows = i32At(at(p0, 28));
    set32(at(p0, 28), (oldRows - 1) | 0);
    if (oldRows === 0) return;

    const mode = i32At(at(p0, 52)) & 112;
    let destinationRow = u32At(at(p0, 20));
    let destination = destinationRow;
    let sourceRow = u32At(p0);
    let source = sourceRow;
    let lastLowByte = (oldRows - 1) | 0;
    let counter;

    for (;;) {
      const width = i32At(at(p0, 24));
      if (width !== 0) {
        let remaining = width;
        do {
          remaining = (remaining - 1) | 0;
          const destinationWord = u32At(destination);
          const sourceWord = u32At(source);
          let destinationBlue = destinationWord & 255;
          let destinationGreen = (destinationWord >>> 8) & 255;
          let destinationRed = (destinationWord >>> 16) & 255;
          const sourceBlue = sourceWord & 255;
          const sourceGreen = (sourceWord >>> 8) & 255;
          const sourceRed = (sourceWord >>> 16) & 255;
          const swapBlue = crossed ? sourceRed : sourceBlue;
          const swapRed = crossed ? sourceBlue : sourceRed;

          if (mode === 16) {
            destinationBlue = swapBlue;
            destinationGreen = sourceGreen;
            destinationRed = swapRed;
          } else if (mode === 32) {
            destinationBlue = Math.min(destinationBlue + swapBlue, 255);
            destinationGreen = Math.min(destinationGreen + sourceGreen, 255);
            destinationRed = Math.min(destinationRed + swapRed, 255);
          } else if (mode === 64) {
            destinationBlue = Math.trunc(destinationBlue * swapBlue / 255) >>> 0;
            destinationGreen = Math.trunc(destinationGreen * sourceGreen / 255) >>> 0;
            destinationRed = Math.trunc(destinationRed * swapRed / 255) >>> 0;
          }

          set32(destination, ((destinationGreen << 8)
            | destinationBlue
            | (destinationRed << 16)) >>> 0);
          destination = u32(destination + 4);
          source = u32(source + 4);
          lastLowByte = destinationBlue;
        } while (remaining !== 0);
        counter = i32At(at(p0, 28));
      } else {
        counter = lastLowByte;
      }

      set32(at(p0, 28), (counter - 1) | 0);
      destinationRow = u32(destinationRow + i32At(at(p0, 32)));
      destination = destinationRow;
      sourceRow = u32(sourceRow + i32At(at(p0, 12)));
      source = sourceRow;
      if (counter === 0) break;
    }
    set32(at(p0, 20), destinationRow);
    set32(p0, sourceRow);
  }

  return {
    2192: p0 => blit(p0, false),
    2197: p0 => blit(p0, true),
    2209: p0 => blit(p0, true),
    2214: p0 => blit(p0, false),
  };
}
