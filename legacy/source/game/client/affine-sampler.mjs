/** Recovered client affine texture sampler (originals 2113,2133,2150,2188,2204).
 *
 * The sampler walks a destination row with a 16.16 fixed-point x accumulator and
 * advances a 16.16 y accumulator per row. Both accumulators normalize carries
 * into a source column/row index before each lookup. The five variants differ
 * only in the channel transform applied to each sampled word. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([663, 743, 965, 966, 967, 968, 2108, 2113, 2129, 2133, 2146, 2150, 2167, 2188, 2204]);

export function createAffineSamplerHooks(runtime) {
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
  const u8 = address => access('getUint8', address);

  const transforms = {
    743: value => value >>> 0,
    966: value => value >>> 8,
    967: value => (value & 0xffffff) >>> 0,
    965: value => ((((value >>> 8) & 0xff00)
      | (value >>> 24)
      | ((value << 8) & 0xff0000)) >>> 0),
    663: value => ((((value << 16) & 0xff0000)
      | (value & 0xff00)
      | ((value >>> 16) & 0xff)) >>> 0),
    2204: value => (value | 0xff000000) >>> 0,
    2133: value => (((value & 0xff00ff00)
      | ((value << 16) & 0xff0000)
      | ((value >>> 16) & 0xff)) >>> 0),
    2188: value => (((value << 16)
      | (value & 0xff00)
      | ((value >>> 16) & 0xff)
      | 0xff000000) >>> 0),
    2150: value => {
      const rotated = ((value << 24) | (value >>> 8)) >>> 0;
      const high = (value >>> 8) | 0;
      return ((rotated & 0xffff0000) | (high & 0xff00) | (high & 0xff)) >>> 0;
    },
    2113: value => (((value << 24)
      | ((value << 8) & 0xff0000)
      | ((value >>> 8) & 0xff00)
      | (value >>> 24)) >>> 0),
  };

  function sample(p0, transform, scaleChannels = false, packer = null) {
    const oldRows = i32At(at(p0, 28));
    set32(at(p0, 28), (oldRows - 1) | 0);
    let width = i32At(at(p0, 24));
    if (width === 0) throw new WebAssembly.RuntimeError('divide by zero');
    if (oldRows === 0) throw new WebAssembly.RuntimeError('divide by zero');
    const stepX = Math.trunc(((i32At(at(p0, 4)) << 16) | 0) / width) | 0;
    const stepY = Math.trunc(((i32At(at(p0, 8)) << 16) | 0) / oldRows) | 0;
    const scale = scaleChannels
      ? { enabled: (i32At(at(p0, 52)) & 1) !== 0, low: u8(at(p0, 60)), middle: u8(at(p0, 61)), high: u8(at(p0, 62)) }
      : null;
    let destinationStart = u32At(at(p0, 20));
    let destination = destinationStart;
    let y = 0, sourceRow = 0, x = 0;
    for (;;) {
      if (y >= 65536) {
        const minimum = y < 131071 ? y : 131071;
        const carry = (y - minimum + 65535) | 0;
        y = (y - (carry & -65536) - 65536) | 0;
        sourceRow = (sourceRow + (carry >>> 16) + 1) | 0;
      }
      if (width !== 0) {
        let sourceColumn = -1, address = 0;
        x = 65536;
        let remaining = width;
        do {
          remaining = (remaining - 1) | 0;
          if (x >= 65536) {
            const base = (u32At(p0) + Math.imul(i32At(at(p0, 12)), sourceRow)) >>> 0;
            const minimum = x < 131071 ? x : 131071;
            const carry = (x - minimum + 65535) | 0;
            sourceColumn = (sourceColumn + (carry >>> 16) + 1) | 0;
            address = u32(base + (sourceColumn << 2));
            x = (x - (carry & -65536) - 65536) | 0;
          }
          let value = packer === null ? transform(u32At(address)) : packer(u32At(address));
          if (scale !== null && scale.enabled) {
            const low = (Math.imul(value & 255, scale.low) >>> 0) / 255 >>> 0;
            const middle = (Math.imul((value >>> 8) & 255, scale.middle) >>> 0) / 255 >>> 0;
            const high = (Math.imul((value >>> 16) & 255, scale.high) >>> 0) / 255 >>> 0;
            value = ((high << 16) | (middle << 8) | low) >>> 0;
          }
          set32(destination, value);
          destination = u32(destination + 4);
          x = (x + stepX) | 0;
        } while (remaining !== 0);
        x = i32At(at(p0, 28));
      }
      set32(at(p0, 28), (x - 1) | 0);
      destinationStart = u32(destinationStart + i32At(at(p0, 32)));
      if (x === 0) break;
      y = (y + stepY) | 0;
      width = i32At(at(p0, 24));
      x = (x - 1) | 0;
      destination = destinationStart;
    }
    set32(at(p0, 20), destinationStart);
  }

  function channelPacker(p0, components) {
    const flags = i32At(at(p0, 52));
    const scaleLow = (flags & 1) !== 0, scaleHigh = (flags & 2) !== 0;
    const factors = [u8(at(p0, 60)), u8(at(p0, 61)), u8(at(p0, 62)), u8(at(p0, 63))];
    return value => {
      const channels = [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
      const out = [0, 0, 0, 0];
      for (let index = 0; index < 4; index++) {
        let channel = channels[components[index]];
        if (index < 3 && scaleLow)
          channel = (Math.imul(channel, factors[2 - index]) >>> 0) / 255 >>> 0;
        if (index === 3 && scaleHigh)
          channel = (Math.imul(channel, factors[3]) >>> 0) / 255 >>> 0;
        out[index] = channel;
      }
      return ((out[3] << 24) | (out[2] << 16) | (out[1] << 8) | out[0]) >>> 0;
    };
  }

  return {
    663: p0 => sample(p0, transforms[663]),
    743: p0 => sample(p0, transforms[743]),
    965: p0 => sample(p0, transforms[965]),
    966: p0 => sample(p0, transforms[966]),
    967: p0 => sample(p0, transforms[967]),
    968: p0 => sample(p0, transforms[967], true),
    2108: p0 => sample(p0, null, false, channelPacker(p0, [0, 1, 2, 3])),
    2129: p0 => sample(p0, null, false, channelPacker(p0, [1, 2, 3, 0])),
    2146: p0 => sample(p0, null, false, channelPacker(p0, [2, 1, 0, 3])),
    2167: p0 => sample(p0, null, false, channelPacker(p0, [3, 2, 1, 0])),
    2113: p0 => sample(p0, transforms[2113]),
    2133: p0 => sample(p0, transforms[2133]),
    2150: p0 => sample(p0, transforms[2150]),
    2188: p0 => sample(p0, transforms[2188]),
    2204: p0 => sample(p0, transforms[2204]),
  };
}
