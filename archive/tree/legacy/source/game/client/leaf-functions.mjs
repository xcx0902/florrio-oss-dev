/** Recovered straight-line leaf functions from client.wasm.
 *
 * Each function below is a complete replacement for one shipped WASM body.
 * They have no calls, no branches, and no loops: only constants, argument
 * forwarding, stack-pointer access, and checked linear-memory transfers.
 * Function ids and line references come from reports/wasm/client-functions.json
 * and source/wasm/client.wat (SHA-256 d186265b...).
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([
  361, 367, 394, 432, 462, 494, 522, 638, 639, 714, 741, 750, 754, 816, 823,
  835, 836, 840, 874, 907, 1123, 1777, 1820, 1821, 1956, 1957, 1965, 1967,
  1968, 1969, 1985, 1997, 2041, 2276, 2277, 2278, 2279, 2314, 2317, 2324,
  2335, 2350, 2353, 2356, 2357, 2359, 2360, 2363, 2365, 2369, 2381, 2384,
  2388, 2391, 2408, 2439, 2442, 2445, 2491, 2613, 2631, 2673, 2682, 2693,
  2710, 3364, 3475, 3809, 4047, 4052, 4055, 4058, 4060, 4366,
]);

export function createLeafHooks(runtime) {
  // DataView performs the same bounds check as a WASM load/store. The native
  // trap wording is preserved so callers see an identical RuntimeError.
  function access(method, address, ...args) {
    try {
      return new DataView(runtime.memory.buffer)[method](address, ...args);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  const u8 = address => access('getUint8', address);
  const i8 = address => access('getInt8', address);
  const u16 = address => access('getUint16', address, true);
  const i32 = address => access('getInt32', address, true);
  const u32At = address => access('getUint32', address, true);
  const u64 = address => access('getBigUint64', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set16 = (address, value) => access('setUint16', address, value, true);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const set64 = (address, value) => access('setBigUint64', address, value, true);

  // Every vtable writer stores the class descriptor and, in the seven-line
  // variants, copies the source field at +4. The store order is significant
  // when source and destination overlap.
  const setVtable = id => (_source, destination) => set32(u32(destination), id);
  const setVtableAndCopy = id => (source, destination) => {
    set32(u32(destination), id);
    set32(at(destination, 4), u32At(at(source, 4)));
  };
  const copyThenSetVtable = id => (source, destination) => {
    set32(at(destination, 4), u32At(at(source, 4)));
    set32(u32(destination), id);
  };

  return {
    361: (left, right) => {},                                      // nop
    367: (first, second, third) => {},                             // nop
    394: value => {},                                              // nop
    432: value => 0,
    462: value => value,                                           // identity
    494: value => 1,
    522: (address, value) => set32(u32(address), 0x04000302),      // i32.store align=1
    638: value => 0x7fffffff,
    639: value => 127,
    714: (p0, p1, value, p3, destination) => {
      set32(u32(destination), u32(value));
      return 3;
    },
    741: (left, right) => 0,
    750: (left, middle, right) => -1,
    754: value => { throw new WebAssembly.RuntimeError('unreachable'); },
    816: base => u8(at(base, 212)),
    823: (first, second, third, fourth) => {},                     // nop
    835: (first, second) => second,
    836: (p0, p1, value, p3, destination, secondValue, p6, secondDestination) => {
      set32(u32(destination), u32(value));
      set32(u32(secondDestination), u32(secondValue));
      return 3;
    },
    840: value => 4,
    874: value => 2,
    907: (left, right) => -1,
    1123: value => 1,
    1777: () => { throw new WebAssembly.RuntimeError('unreachable'); },
    1820: base => i8(at(base, 9)),
    1821: base => i8(at(base, 8)),
    1956: base => i32(at(base, 12)),
    1957: base => i32(at(base, 8)),
    1965: value => -1,
    1967: (base, p1, p2, p3) => {
      set64(at(base, 8), 0xffffffffffffffffn);
      set64(u32(base), 0n);
    },
    1968: (base, p1, p2, p3, p4) => {
      set64(at(base, 8), 0xffffffffffffffffn);
      set64(u32(base), 0n);
    },
    1969: (first, second, third) => first,
    1985: (p0, p1, p2) => 0n,
    1997: (p0, source, destination) => {
      const value = u32At(u32(source));
      set32(at(destination, 32), value);
      return 0;
    },
    2041: (p0, p1, p2) => 0,
    2276: base => i32(u32(base)),
    2277: base => (u16(u32(base)) | (u8(at(base, 2)) << 16)) | 0,
    2278: base => u16(u32(base)),
    2279: base => u8(u32(base)),
    2314: () => {},                                                // nop
    2317: (p0, p1, p2, p3) => 0,
    2324: base => i32(at(u32At(at(base, 96)), 8)),
    2335: setVtable(90288),
    2350: setVtable(34720),
    2353: setVtableAndCopy(34756),
    2356: base => set16(at(u32At(at(base, 4)), 132), 257),
    2357: setVtableAndCopy(34792),
    2359: base => set16(at(u32At(at(base, 4)), 132), 1),
    2360: setVtableAndCopy(34828),
    2363: (source, destination) => {
      set32(u32(destination), 34864);
      set64(at(destination, 4), u64(at(source, 4)));
    },
    2365: setVtable(34900),
    2369: (source, destination) => {
      set32(u32(destination), 34936);
      set64(at(destination, 4), u64(at(source, 4)));
    },
    2381: setVtableAndCopy(90144),
    2384: setVtable(90180),
    2388: setVtable(90216),
    2391: setVtableAndCopy(90252),
    2408: copyThenSetVtable(90360),
    2439: setVtableAndCopy(90576),
    2442: setVtableAndCopy(90612),
    2445: setVtableAndCopy(90648),
    2491: (first, second) => { throw new WebAssembly.RuntimeError('unreachable'); },
    2613: value => set8(379572, 0),
    2631: copyThenSetVtable(90396),
    2673: setVtable(90324),
    2682: base => u8(at(base, 848)),
    2693: value => set8(165385, (u32(value) ^ 1) & 0xff),
    2710: () => 0,
    3364: value => { runtime.stackPointer.value = u32(value); },
    3475: () => runtime.stackPointer.value,
    3809: (destination, source) => {
      set32(at(destination, 4), u32At(at(source, 24)));
      set32(u32(destination), 0x41100000);                         // f32 9.0 bits
    },
    4047: setVtableAndCopy(89964),
    4052: setVtableAndCopy(90036),
    4055: setVtableAndCopy(90072),
    4058: setVtableAndCopy(90000),
    4060: base => u8(at(base, 213)),
    4366: base => {
      set8(at(base, 8), 0);
      set32(u32(base), 34472);
      return base | 0;
    },
  };
}
