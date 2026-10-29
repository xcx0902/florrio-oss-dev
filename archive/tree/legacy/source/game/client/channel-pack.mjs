/** Recovered client palette and RGB565 channel packers.
 *
 * 2282 and 2283 unpack four masked channels and repack them into RGB565.
 * 2281, 2286 and 2287 look up palettes through the 104976 table, then combine
 * shifted bytes into 16- or 32-bit output. All five are straight-line loops.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([2282, 2283, 2281, 2286, 2287]);

export function createChannelPackHooks(runtime) {
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
  const u16 = address => access('getUint16', address, true);
  const u32At = address => access('getUint32', address, true);
  const set16 = (address, value) => access('setUint16', address, value, true);
  const set32 = (address, value) => access('setUint32', address, value, true);

  function rgb565(p0, p1, p2, p3, p4, keep, greenOutput, greenInput) {
    if (p2 < 1) return (p2 << 2) | 0;
    const shift = offset => u8(at(p4, offset));
    const first = offset => u8(at(p3, offset));
    const mask = offset => u32At(at(p3, offset));
    const channel = [
      [mask(16), first(33), shift(29), shift(33)],
      [mask(12), first(32), shift(28), shift(32)],
      [mask(20), first(34), shift(30), shift(34)],
    ];
    let destination = p0, source = p1;
    for (let index = 0; index < p2; index++) {
      const value = u32At(source);
      let packed = u32At(at(p4, 24));
      for (const [andMask, inputShift, scaleShift, outputShift] of channel) {
        packed |= ((((value & andMask) >>> inputShift) >>> scaleShift) << outputShift) | 0;
      }
      packed = u32(packed);
      const green = ((value & mask(24)) >>> first(35)) | 0;
      const output = ((packed & keep) | ((packed << 16) & greenOutput)
        | ((green << 2) & greenInput)) | 0;
      set32(destination, output & 0xffffffff);
      destination = u32(destination + 4);
      source = u32(source + 4);
    }
    return (p2 << 2) | 0;
  }

  function palette16(p0, p1, p2, p3, p4) {
    if (p2 < 1) return (p2 << 1) | 0;
    const table = offset => u32At(104976 + u8(at(p3, offset)) * 4);
    const highBase = table(30), middleBase = table(29), lowBase = table(28);
    const highMask = u32At(at(p3, 20)), middleMask = u32At(at(p3, 16));
    const lowMask = u32At(at(p3, 12));
    const highIndexShift = u8(at(p3, 34)), highScale = u8(at(p4, 30));
    const middleIndexShift = u8(at(p3, 33)), middleScale = u8(at(p4, 29));
    const lowIndexShift = u8(at(p3, 32)), lowScale = u8(at(p4, 28));
    const highOut = u8(at(p4, 34)), highIn = u8(at(p4, 30));
    const middleOut = u8(at(p4, 33)), middleIn = u8(at(p4, 29));
    const lowOut = u8(at(p4, 32)), lowIn = u8(at(p4, 28));
    const baseOr = u32At(at(p4, 24));
    let destination = p0, source = p1;
    for (let index = 0; index < p2; index++) {
      const value = u32At(source);
      const high = (u8(u32(highBase + ((value & highMask) >>> highIndexShift))) >>> highScale) << highOut;
      const middle = (u8(u32(middleBase + ((value & middleMask) >>> middleIndexShift))) >>> middleScale) << middleOut;
      const low = (u8(u32(lowBase + ((value & lowMask) >>> lowIndexShift))) >>> lowScale) << lowOut;
      set16(destination, (high | middle | baseOr | low) & 0xffff);
      destination = u32(destination + 2);
      source = u32(source + 4);
    }
    return (p2 << 1) | 0;
  }

  function palette32From16(p0, p1, p2, p3, p4) {
    if (p2 < 1) return (p2 << 1) | 0;
    const table = offset => u32At(104976 + u8(at(p3, offset)) * 4);
    const highBase = table(22), middleBase = table(21), lowBase = table(20);
    const highMask = u32At(at(p3, 12)), middleMask = u32At(at(p3, 8));
    const lowMask = u32At(at(p3, 4));
    const highIndexShift = u8(at(p3, 26)), middleIndexShift = u8(at(p3, 25));
    const lowIndexShift = u8(at(p3, 24));
    const highOut = u8(at(p4, 34)), highIn = u8(at(p4, 30));
    const middleOut = u8(at(p4, 33)), middleIn = u8(at(p4, 29));
    const lowOut = u8(at(p4, 32)), lowIn = u8(at(p4, 28));
    const alpha = (u32At(at(p4, 24)) ? 255 : 0);
    const alphaValue = (alpha >>> u8(at(p4, 31))) << u8(at(p4, 35));
    let destination = p0, source = p1;
    for (let index = 0; index < p2; index++) {
      const value = u16(source);
      const high = (u8(u32(highBase + ((value & highMask) >>> highIndexShift))) >>> highIn) << highOut;
      const middle = (u8(u32(middleBase + ((value & middleMask) >>> middleIndexShift))) >>> middleIn) << middleOut;
      const low = (u8(u32(lowBase + ((value & lowMask) >>> lowIndexShift))) >>> lowIn) << lowOut;
      set32(destination, (high | middle | low | alphaValue) | 0);
      destination = u32(destination + 4);
      source = u32(source + 2);
    }
    return (p2 << 1) | 0;
  }

  function palette32From32(p0, p1, p2, p3, p4) {
    if (p2 < 1) return (p2 << 2) | 0;
    const table = offset => u32At(104976 + u8(at(p3, offset)) * 4);
    const highBase = table(22), middleBase = table(21), lowBase = table(20);
    const highMask = u32At(at(p3, 12)), middleMask = u32At(at(p3, 8));
    const lowMask = u32At(at(p3, 4));
    const highIndexShift = u8(at(p3, 26)), middleIndexShift = u8(at(p3, 25));
    const lowIndexShift = u8(at(p3, 24));
    const highOut = u8(at(p4, 34)), highIn = u8(at(p4, 30));
    const middleOut = u8(at(p4, 33)), middleIn = u8(at(p4, 29));
    const lowOut = u8(at(p4, 32)), lowIn = u8(at(p4, 28));
    const alphaOut = u8(at(p4, 35)), alphaIn = u8(at(p4, 31));
    let destination = p0, source = p1;
    for (let index = 0; index < p2; index++) {
      const value = u32At(source);
      const high = (u8(u32(highBase + ((value & highMask) >>> highIndexShift))) >>> highIn) << highOut;
      const middle = (u8(u32(middleBase + ((value & middleMask) >>> middleIndexShift))) >>> middleIn) << middleOut;
      const low = (u8(u32(lowBase + ((value & lowMask) >>> lowIndexShift))) >>> lowIn) << lowOut;
      const alpha = ((value >>> 24) >>> alphaIn) << alphaOut;
      set32(destination, (high | middle | low | alpha) | 0);
      destination = u32(destination + 4);
      source = u32(source + 4);
    }
    return (p2 << 2) | 0;
  }

  return {
    // 2282: RGB565 with a five-bit green field.
    2282: (p0, p1, p2, p3, p4) => rgb565(p0, p1, p2, p3, p4, 0xfc1f, 0x3e00000, 0x3e0),
    // 2283: RGB565 with a six-bit green field.
    2283: (p0, p1, p2, p3, p4) => rgb565(p0, p1, p2, p3, p4, 0xf81f, 0x7e00000, 0x7e0),
    // 2281: three palette bytes to 16-bit output.
    2281: palette16,
    // 2286: three palette bytes from a 16-bit index to 32-bit output.
    2286: palette32From16,
    // 2287: three palette bytes plus source alpha to 32-bit output.
    2287: palette32From32,
  };
}
