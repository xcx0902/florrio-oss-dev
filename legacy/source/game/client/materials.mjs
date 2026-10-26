/** Recovered client material initialisers, in-place table maps and hash fills.
 *
 * Six material factories share one layout and differ only in their two f32
 * constants. Four maps rewrite bytes or dwords through the same lookup tables
 * used by the conditional functions. Two deterministic 25-byte fills advance a
 * 32-bit state with `(x * 110578 + 1148) % 2147179305`. 2334 reads a global
 * singleton and tests one word.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;
const MIX_MODULUS = 2147179305n;

export const functionIds = Object.freeze([
  461, 1122, 1311, 1783, 1785, 1792, 1794, 2334, 3357, 3408, 3441, 3541, 4070,
]);

export function createMaterialHooks(runtime) {
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
  const i8 = address => access('getInt8', address);
  const u32At = address => access('getUint32', address, true);
  const set8 = (address, value) => access('setUint8', address, value);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const setF32 = (address, value) => access('setFloat32', address, value, true);

  function material(initial, alternate) {
    return (p0, p1, p2) => {
      set32(at(p0, 0), 1115815936);
      set8(at(p0, 4), 0);
      const component = u32At(at(p2, 4));
      if (!component) return;
      const flags = u8(at(component, 10));
      let value = initial;
      if (!(flags & 1)) {
        value = alternate;
        if (!(flags & 2)) return;
      }
      setF32(at(p0, 0), value);
    };
  }

  function mapBytes(table) {
    return (p0, p1, p2) => {
      let cursor = u32(p1);
      while (cursor !== u32(p2)) {
        const value = i8(cursor);
        const mapped = value >= 0 ? u32At(u32(value * 4 + table)) : value;
        set8(cursor, mapped);
        cursor = u32(cursor + 1);
      }
      return p2 | 0;
    };
  }

  function mapDwords(table) {
    return (p0, p1, p2) => {
      let cursor = u32(p1);
      while (cursor !== u32(p2)) {
        const value = u32At(cursor);
        const mapped = value <= 127 ? u32At(u32(value * 4 + table)) : value;
        set32(cursor, mapped);
        cursor = u32(cursor + 4);
      }
      return p2 | 0;
    };
  }

  function fill25(p1, stateOffset) {
    for (let index = 0; index !== 25; index++) {
      const state = u32At(at(p1, 4));
      const statePointer = u32At(at(state, 8));
      const previous = u32At(at(statePointer, stateOffset));
      const next = Number((BigInt(previous) * 110578n + 1148n) % MIX_MODULUS);
      set32(at(statePointer, stateOffset), next);
      set8(u32(u32At(p1) + index), next & 255);
    }
  }

  return {
    461: material(130, 40),
    1122: material(145, 40),
    3408: material(120, 50),
    3441: material(110, 55),
    3541: material(140, 40),
    4070: material(100, 65),

    // 1783/1785 rewrite signed bytes in place; negative values stay unchanged.
    1783: mapBytes(123072),
    1785: mapBytes(124608),

    // 1792/1794 rewrite dwords in place; values above 127 stay unchanged.
    1792: mapDwords(123072),
    1794: mapDwords(124608),

    // 1311 and 3357 use the same generator with the state word at +4 or +0.
    1311: (p0, p1) => fill25(p1, 4),
    3357: (p0, p1) => fill25(p1, 0),

    // 2334: test the singleton behind globals 441664 and 441672.
    2334: p0 => {
      if (!u32At(441664)) return 0;
      const object = u32At(u32At(441672));
      if (!object) return 0;
      return u32At(at(object, 144)) !== 0 ? 1 : 0;
    },
  };
}
