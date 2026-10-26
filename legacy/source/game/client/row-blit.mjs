/** Recovered client scaled-color row blitters.
 *
 * Eight functions share one row loop: decrement the row counter, process
 * field24 pixels per row while optionally scaling three 8-bit channels through
 * the bytes at +60/+61/+62, then advance by the destination/source strides.
 * The profiles differ in channel extraction, multiplier assignment and output
 * byte order. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([969, 971, 973, 975, 2117, 2124, 2154, 2161]);

export function createRowBlitHooks(runtime) {
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

  const BGR = value => ({ b: value & 255, g: (value >>> 8) & 255, r: (value >>> 16) & 255 });
  const AGR = value => ({ a: value >>> 24, g: (value >>> 8) & 255, r: (value >>> 16) & 255 });

  const profiles = {
    969: { read: BGR, b: 'm2', g: 'm1', r: 'm0', store: c => ((c.g << 8) | c.b | (c.r << 16)) },
    971: { read: BGR, b: 'm2', g: 'm1', r: 'm0', store: c => ((c.g << 8) | (c.b << 16) | c.r) },
    973: { read: BGR, b: 'm0', g: 'm1', r: 'm2', store: c => ((c.b << 16) | (c.g << 8) | c.r) },
    975: { read: BGR, b: 'm0', g: 'm1', r: 'm2', store: c => ((c.g << 8) | c.b | (c.r << 16)) },
    2117: { read: AGR, a: 'm0', g: 'm2', r: 'm1', store: c => ((c.r << 8) | c.g | (c.a << 16)) },
    2124: { read: AGR, a: 'm0', g: 'm2', r: 'm1', store: c => ((c.r << 8) | (c.g << 16) | c.a) },
    2154: { read: AGR, a: 'm2', g: 'm0', r: 'm1', store: c => ((c.r << 8) | c.a | (c.g << 16)) },
    2161: { read: AGR, a: 'm2', g: 'm0', r: 'm1', store: c => ((c.r << 8) | (c.a << 16) | c.g) },
  };

  function blit(p0, profile) {
    let oldRows = u32At(at(p0, 28));
    let l1 = (oldRows - 1) | 0;
    set32(at(p0, 28), l1);
    if (oldRows === 0) return;
    const scale = u32At(at(p0, 52)) & 1;
    const m0 = u8(at(p0, 62)), m1 = u8(at(p0, 61)), m2 = u8(at(p0, 60));
    const multipliers = {m0, m1, m2};
    let destinationBase = u32At(at(p0, 20));
    let sourceBase = u32At(p0);
    let destination = destinationBase;
    let source = sourceBase;
    for (;;) {
      let remaining = u32At(at(p0, 24));
      let l2;
      if (remaining !== 0) {
        do {
          remaining = (remaining - 1) | 0;
          const value = u32At(source);
          const channels = profile.read(value);
          if (scale) {
            for (const key of ['a', 'b', 'g', 'r']) {
              if (profile[key])
                channels[key] = Math.floor((channels[key] * multipliers[profile[key]]) / 255);
            }
          }
          set32(destination, profile.store(channels));
          destination = u32(destination + 4);
          source = u32(source + 4);
        } while (remaining !== 0);
        l2 = u32At(at(p0, 28));
      } else {
        l2 = l1;
      }
      l1 = (l2 - 1) | 0;
      set32(at(p0, 28), l1);
      destinationBase = u32(destinationBase + u32At(at(p0, 32)));
      destination = destinationBase;
      sourceBase = u32(sourceBase + u32At(at(p0, 12)));
      source = sourceBase;
      if (l2 === 0) break;
    }
    set32(at(p0, 20), destinationBase);
    set32(p0, sourceBase);
  }

  return {
    969: p0 => blit(p0, profiles[969]),
    971: p0 => blit(p0, profiles[971]),
    973: p0 => blit(p0, profiles[973]),
    975: p0 => blit(p0, profiles[975]),
    2117: p0 => blit(p0, profiles[2117]),
    2124: p0 => blit(p0, profiles[2124]),
    2154: p0 => blit(p0, profiles[2154]),
    2161: p0 => blit(p0, profiles[2161]),
  };
}
