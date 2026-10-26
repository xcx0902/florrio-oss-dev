/** Recovered client configuration readers and buffer appenders.
 *
 * 1802 looks up a component status through 837. 1771 and 1766 compare a
 * component through 463 and then call 711/712. 2308/2309 read decimal
 * defaults through 545. 2304 classifies a value through 415. 2331 clamps a
 * decimal to 0..2. 1978 scans through 733 and moves bytes through 363. 1804
 * swaps through 488 and mirrors the status with 837.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([1802, 1771, 1766, 2308, 2309, 2304, 2331, 1978, 1804]);

export function createConfigIoHooks(runtime) {
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

  return {
    // 1802: component lookup; absent components report status 1.
    1802: p0 => {
      const object = u32At(at(p0, 8));
      return object ? runtime.call(837, object) | 0 : 1;
    },

    // 1771: compare with p2=0, then move through 711 when equal.
    1771: (p0, p1, p2, p3) => {
      if (runtime.call(463, p0, u32At(at(p1, 8)), 0)) runtime.call(711, p1, p2, p3);
    },

    // 1766: compare through 463 with the caller flags, then update through 712.
    1766: (p0, p1, p2, p3, p4, p5) => {
      if (runtime.call(463, p0, u32At(at(p1, 8)), p5)) runtime.call(712, p1, p2, p3, p4);
    },

    // 2308: decimal field with default 32.
    2308: (p0, p1, p2, p3) => {
      let value = 32;
      if (p3 && u8(p3) !== 0) value = runtime.call(545, p3) | 0;
      set32(at(p0, 116), value);
    },

    // 2309: decimal field with default 500.
    2309: (p0, p1, p2, p3) => {
      let value = 500;
      if (p3 && u8(p3) !== 0) value = runtime.call(545, p3) | 0;
      set32(at(p0, 112), value);
    },

    // 2304: zero only for the literal "0" or a case-insensitive match at 16083.
    2304: (p0, p1, p2, p3) => {
      let value = 1;
      if (p3) {
        value = 0;
        if (u8(p3) !== 48 && runtime.call(415, p3, 16083) !== 0) value = 1;
      }
      set32(at(p0, 120), value);
    },

    // 2331: clamp a decimal option into 0..2 at the fixed global.
    2331: (p0, p1, p2, p3) => {
      let value = 0;
      if (p3 && u8(p3) !== 0) {
        const parsed = runtime.call(545, p3) | 0;
        const limited = parsed < 2 ? parsed : 2;
        value = limited > 0 ? limited : 0;
      }
      set32(7941628, value);
    },

    // 1978: append up to p2 bytes from the scan buffer through 363.
    1978: (p0, p1, p2) => {
      const start = u32At(at(p0, 84));
      const limit = u32(start + 256);
      const found = runtime.call(733, start, 256) | 0;
      const extent = found ? u32(found - start) : limit;
      const length = u32(p2) > extent ? extent : u32(p2);
      runtime.call(363, p1, start, length);
      set32(at(p0, 84), u32(start + extent));
      set32(at(p0, 8), u32(start + extent));
      set32(at(p0, 4), u32(start + length));
      return length | 0;
    },

    // 1804: exchange through 488, mirror the status with 837.
    1804: p0 => {
      const object = u32At(at(p0, 8));
      const frame = u32(runtime.stackPointer.value - 16);
      runtime.stackPointer.value = frame;
      set32(at(frame, 12), object);
      const slot = runtime.call(488, at(frame, 8), at(frame, 12)) | 0;
      const value = u32At(slot);
      if (value) {
        u32At(133584);
        if (value) set32(133584, value === 0xffffffff ? 7945660 : value);
      }
      runtime.stackPointer.value = u32(frame + 16);
      const component = u32At(at(p0, 8));
      if (!component) return 1;
      return (runtime.call(837, component) | 0) === 1 ? 1 : 0;
    },
  };
}
