/** Recovered client object constructor/copy with list relinking (original 384).
 *
 * Initializes a fixed 100-byte layout, copies the common fields from the source
 * object, unlinks the source from the 441324 list when needed, inserts the new
 * object at the list head, and copies the trailing fields. WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([384]);

export function createObjectConstructorHooks(runtime) {
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
  const i32 = address => access('getInt32', address, true);
  const u32At = address => access('getUint32', address, true);
  const i64 = address => access('getBigInt64', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set16 = (address, value) => access('setUint16', address, value, true);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const setSigned32 = (address, value) => access('setInt32', address, value, true);
  const set64 = (address, value) => access('setBigInt64', address, value, true);

  return {
    384: (p0, p1) => {
      set64(p0, 1065353216n);
      set8(at(p0, 50), 2);
      set16(at(p0, 68), 1);
      set32(at(p0, 64), -1082130432);
      set64(at(p0, 72), 0n);
      set32(at(p0, 96), -1);
      set64(at(p0, 32), 4575657221408423936n);
      set64(at(p0, 24), 1065353216n);
      set64(at(p0, 16), 0n);
      set64(at(p0, 8), 4575657221408423936n);
      set64(at(p0, 40), 0n);
      set16(at(p0, 48), 1);
      set64(at(p0, 56), 4607182418800017408n);
      set64(at(p0, 88), 0n);
      set8(at(p0, 80), 0);

      set64(at(p0, 8), i64(at(p1, 8)));
      set64(at(p0, 16), i64(at(p1, 16)));
      set64(at(p0, 32), i64(at(p1, 32)));
      set64(at(p0, 40), i64(at(p1, 40)));
      set64(at(p0, 48), i64(at(p1, 48)));
      set64(at(p0, 24), i64(at(p1, 24)));
      set64(at(p0, 56), i64(at(p1, 56)));
      set64(p0, i64(p1));
      set8(at(p0, 68), u8(at(p1, 68)));
      set32(at(p0, 64), u32At(at(p1, 64)));
      set8(at(p0, 69), u8(at(p1, 69)));

      let next = i32(at(p1, 76));
      let previous = i32(at(p1, 72));
      const shouldUnlink = (previous | next) !== 0 || i32(441324) === (p1 | 0);
      if (shouldUnlink) {
        if (next !== 0) {
          setSigned32(at(next, 72), previous);
          previous = i32(at(p1, 72));
        } else if (i32(441324) === (p1 | 0)) {
          setSigned32(441324, previous);
        }
        if (previous !== 0) setSigned32(at(previous, 76), next);
        set64(at(p1, 72), 0n);
        previous = i32(441324);
        if (previous !== 0) {
          setSigned32(at(p0, 72), previous);
          setSigned32(at(previous, 76), p0 | 0);
        }
        setSigned32(441324, p0 | 0);
      }

      set64(at(p0, 80), i64(at(p1, 80)));
      set64(at(p0, 88), i64(at(p1, 88)));
      set32(at(p0, 96), u32At(at(p1, 96)));
      setSigned32(at(p1, 96), -1);
      return p0;
    },
  };
}
