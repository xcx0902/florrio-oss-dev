/** Recovered client span blend (8 originals).
 *
 * Each original blends a source rectangle onto the destination buffer one pixel
 * at a time, then advances both pointers by their row strides.
 *
 * State layout:
 *   +0   source pointer        +12  source row stride
 *   +20  destination pointer   +32  destination row stride
 *   +24  pixels per row        +28  rows left (decremented per row)
 *   +52  mode: bit 4/5 select alpha modulation, bits 4..6 select the blend
 *
 * Blend modes: 16 screen, 32 additive with clamping, 64 multiply, anything else
 * screen as well.  The eight bodies differ only in whether the source alpha is
 * the low or the high byte of the pixel.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2119, 2126, 2138, 2142, 2157, 2163, 2174, 2179]);

/** id -> whether the alpha channel is the high byte. */
const variants = Object.freeze({
  2119: false,
  2126: false,
  2157: false,
  2163: false,
  2138: true,
  2142: true,
  2174: true,
  2179: true,
});

export { variants as spanBlendVariants };

const SOURCE_POINTER = 0;
const SOURCE_STRIDE = 12;
const DESTINATION_POINTER = 20;
const PIXELS_PER_ROW = 24;
const ROWS = 28;
const DESTINATION_STRIDE = 32;
const MODE = 52;

const ALPHA_MODULATION = 48;
const BLEND_MASK = 112;
const BLEND_SCREEN = 16;
const BLEND_ADDITIVE = 32;
const BLEND_MULTIPLY = 64;

/** Per-function channel plan recovered from the eight WAT bodies.
 *
 * The packed pixel is BGRA in memory but these functions pair the source
 * channels to destination channels differently:
 *   - alpha-low variants use the low byte as the modulation multiplier and one
 *     of the two outer bytes as red;
 *   - alpha-high variants use the high byte as the multiplier and map red,
 *     green and blue through the remaining bytes.
 * `G` is bits 8..15 for the low-alpha variants and bits 8..15 for 2138/2142
 * while 2174/2179 use the same channel pairings as 2142/2138 respectively.
 */
const channelPlans = Object.freeze({
  2119: { multiplier: 'low', red: 'high', green: 'bits16', blue: 'bits8' },
  2126: { multiplier: 'low', red: 'bits8', green: 'bits16', blue: 'high' },
  2157: { multiplier: 'low', red: 'bits8', green: 'bits16', blue: 'high' },
  2163: { multiplier: 'low', red: 'high', green: 'bits16', blue: 'bits8' },
  2138: { multiplier: 'high', red: 'bits16', green: 'bits8', blue: 'low' },
  2142: { multiplier: 'high', red: 'low', green: 'bits8', blue: 'bits16' },
  2174: { multiplier: 'high', red: 'low', green: 'bits8', blue: 'bits16' },
  2179: { multiplier: 'high', red: 'bits16', green: 'bits8', blue: 'low' },
});
export function createSpanBlendHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function readUint32(address) {
    try {
      return dataView().getUint32(address >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function writeUint32(address, value) {
    try {
      dataView().setUint32(address >>> 0, value >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const scale = (value, factor) => Math.floor((value * factor) / 255);

  const hooks = {};
  for (const id of functionIds) {
    const plan = channelPlans[id];
    hooks[id] = (state) => {
      const rows = readUint32(state + ROWS);
      writeUint32(state + ROWS, (rows - 1) >>> 0);
      if (rows === 0) return;

      const mode = readUint32(state + MODE);
      const modulate = (mode & ALPHA_MODULATION) !== 0;
      const blend = mode & BLEND_MASK;
      const destinationStride = readUint32(state + DESTINATION_STRIDE);
      const sourceStride = readUint32(state + SOURCE_STRIDE);
      let destination = readUint32(state + DESTINATION_POINTER);
      let source = readUint32(state + SOURCE_POINTER);

      for (;;) {
        let pixels = readUint32(state + PIXELS_PER_ROW);
        let destinationCursor = destination;
        let sourceCursor = source;
        while (pixels !== 0) {
          const pixel = readUint32(sourceCursor);
          const low = pixel & 255;
          const high = pixel >>> 24;
          const bits8 = (pixel >>> 8) & 255;
          const bits16 = (pixel >>> 16) & 255;
          const multiplier = plan.multiplier === 'low' ? low : high;
          const channels = { low, high, bits8, bits16 };
          const target = readUint32(destinationCursor);
          let red = (target >>> 16) & 255;
          let green = (target >>> 8) & 255;
          let blue = target & 255;

          if (modulate && multiplier !== 255) {
            // All three source channels are scaled by the multiplier. The
            // multiplier byte itself is not written back.
            channels.low = scale(channels.low, multiplier);
            channels.high = scale(channels.high, multiplier);
            channels.bits8 = scale(channels.bits8, multiplier);
            channels.bits16 = scale(channels.bits16, multiplier);
          }
          const sourceR = channels[plan.red];
          const sourceG = channels[plan.green];
          const sourceB = channels[plan.blue];

          if (blend === BLEND_SCREEN) {
            const inverse = 255 ^ multiplier;
            red = sourceR + scale(red, inverse);
            green = sourceG + scale(green, inverse);
            blue = sourceB + scale(blue, inverse);
          } else if (blend === BLEND_ADDITIVE) {
            red = Math.min(255, red + sourceR);
            green = Math.min(255, green + sourceG);
            blue = Math.min(255, blue + sourceB);
          } else if (blend === BLEND_MULTIPLY) {
            // The original keeps only the low 16 bits of the product before
            // dividing by 255.
            red = (((red * sourceR) & 65535) / 255) | 0;
            green = (((green * sourceG) & 65535) / 255) | 0;
            blue = (((blue * sourceB) & 65535) / 255) | 0;
          }

          writeUint32(destinationCursor, ((green << 8) | blue | (red << 16)) >>> 0);
          destinationCursor = (destinationCursor + 4) >>> 0;
          sourceCursor = (sourceCursor + 4) >>> 0;
          pixels -= 1;
        }

        const current = readUint32(state + ROWS);
        writeUint32(state + ROWS, (current - 1) >>> 0);
        destination = (destination + destinationStride) >>> 0;
        source = (source + sourceStride) >>> 0;
        if (current === 0) break;
      }

      writeUint32(state + DESTINATION_POINTER, destination);
      writeUint32(state + SOURCE_POINTER, source);
    };
  }
  return Object.freeze(hooks);
}
