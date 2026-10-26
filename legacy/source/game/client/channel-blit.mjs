/** Recovered client four-channel row blitters (originals 2109, 2130, 2147, 2168).
 *
 * Each row loop scales three of the four 8-bit channels, writes the remaining
 * channel into the low byte, and places a fourth channel in bits 24-31. When
 * bit 1 of field52 is set that high channel is scaled by byte +63; otherwise it
 * is copied raw. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([2109, 2130, 2147, 2168]);

export function createChannelBlitHooks(runtime) {
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

  const profiles = {
    2109: { read: w => ({a: w >>> 24, g: (w >>> 8) & 255, r: (w >>> 16) & 255, b: w & 255}),
      scale: {a: 'm62', g: 'm60', r: 'm61'}, high: 'b',
      store: c => ((c.r << 8) | (c.g << 16) | c.a) },
    2130: { read: w => ({b: w & 255, g: (w >>> 8) & 255, r: (w >>> 16) & 255, a: w >>> 24}),
      scale: {g: 'm61', b: 'm60', r: 'm62'}, high: 'a',
      store: c => ((c.g << 8) | (c.b << 16) | c.r) },
    2147: { read: w => ({a: w >>> 24, g: (w >>> 8) & 255, r: (w >>> 16) & 255, b: w & 255}),
      scale: {g: 'm62', a: 'm60', r: 'm61'}, high: 'b',
      store: c => ((c.r << 8) | (c.a << 16) | c.g) },
    2168: { read: w => ({b: w & 255, g: (w >>> 8) & 255, r: (w >>> 16) & 255, a: w >>> 24}),
      scale: {b: 'm62', g: 'm61', r: 'm60'}, high: 'a',
      store: c => ((c.g << 8) | (c.r << 16) | c.b) },
  };

  function blit(p0, profile) {
    let oldRows = u32At(at(p0, 28));
    let l2 = (oldRows - 1) | 0;
    set32(at(p0, 28), l2);
    if (oldRows === 0) return;
    const flags = u32At(at(p0, 52));
    const scaleFlag = flags & 1;
    const scaleHigh = flags & 2;
    const m60 = u8(at(p0, 60)), m61 = u8(at(p0, 61));
    const m62 = u8(at(p0, 62)), m63 = u8(at(p0, 63));
    const multipliers = {m60, m61, m62, m63};
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
          const channels = profile.read(u32At(source));
          if (scaleFlag) {
            for (const key of ['a', 'b', 'g', 'r']) {
              if (profile.scale[key])
                channels[key] = Math.floor((channels[key] * multipliers[profile.scale[key]]) / 255);
            }
          }
          const high = channels[profile.high];
          const placedHigh = scaleHigh
            ? Math.floor((high * m63) / 255)
            : high;
          set32(destination, u32(profile.store(channels) | (placedHigh << 24)));
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
    2109: p0 => blit(p0, profiles[2109]),
    2130: p0 => blit(p0, profiles[2130]),
    2147: p0 => blit(p0, profiles[2147]),
    2168: p0 => blit(p0, profiles[2168]),
  };
}
