/** Recovered client alpha-blended row blitters (originals 2183 and 2201).
 *
 * Both decrement the row counter, process field24 pixels, optionally scale the
 * RGB channels by bytes +60/+61/+62, and write an alpha byte selected by bit 1
 * of field52. They differ in multiplier assignment and output byte order.
 * WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([2183, 2201]);

export function createAlphaBlitHooks(runtime) {
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
  const set32 = (address, value) => access('setUint32', address, value, true);

  function blit(p0, profile) {
    let oldRows = u32At(at(p0, 28));
    let l2 = (oldRows - 1) | 0;
    set32(at(p0, 28), l2);
    if (oldRows === 0) return;
    const flags = u32At(at(p0, 52));
    const alpha = (flags & 2) ? u8(at(p0, 63)) << 24 : 0xff000000;
    const scale = flags & 1;
    const m0 = u8(at(p0, 62)), m1 = u8(at(p0, 61)), m2 = u8(at(p0, 60));
    const multipliers = {m0, m1, m2};
    let destinationBase = u32At(at(p0, 20));
    let sourceBase = u32At(p0);
    let destination = destinationBase;
    let source = sourceBase;
    for (;;) {
      let remaining = u32At(at(p0, 24));
      let count;
      if (remaining !== 0) {
        do {
          remaining = (remaining - 1) | 0;
          const word = u32At(source);
          const channels = {b: word & 255, g: (word >>> 8) & 255, r: (word >>> 16) & 255};
          if (scale) {
            channels.b = Math.floor((channels.b * multipliers[profile.b]) / 255);
            channels.g = Math.floor((channels.g * multipliers[profile.g]) / 255);
            channels.r = Math.floor((channels.r * multipliers[profile.r]) / 255);
          }
          set32(destination, u32(alpha | profile.store(channels)));
          destination = u32(destination + 4);
          source = u32(source + 4);
        } while (remaining !== 0);
        count = u32At(at(p0, 28));
      } else {
        count = l2;
      }
      l2 = (count - 1) | 0;
      set32(at(p0, 28), l2);
      destinationBase = u32(destinationBase + u32At(at(p0, 32)));
      destination = destinationBase;
      sourceBase = u32(sourceBase + u32At(at(p0, 12)));
      source = sourceBase;
      if (count === 0) break;
    }
    set32(at(p0, 20), destinationBase);
    set32(p0, sourceBase);
  }

  return {
    2183: p0 => blit(p0, {b: 'm2', g: 'm1', r: 'm0',
      store: c => ((c.b << 16) | (c.g << 8) | c.r)}),
    2201: p0 => blit(p0, {b: 'm0', g: 'm1', r: 'm2',
      store: c => ((c.r << 16) | (c.g << 8) | c.b)}),
  };
}
