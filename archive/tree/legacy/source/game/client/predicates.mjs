/** Recovered client predicates, scan loops and small field readers (no calls).
 *
 * This group covers a flag-to-size mapping, two material initialisers, dword
 * and byte scans, byte widening, a global id counter, three component
 * predicates, and a global flag derived from a text byte.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const u32 = value => value >>> 0;
const at = (base, offset = 0) => u32(base) + offset;

export const functionIds = Object.freeze([
  503, 708, 721, 724, 1789, 1935, 2299, 2300, 2301, 2313,
]);

export function createPredicateHooks(runtime) {
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
  const set8 = (address, value) => access('setUint8', address, value);
  const set32 = (address, value) => access('setUint32', address, value, true);
  const sameComponent = (p0, p1, kinds) => {
    if (u32At(p1) !== 512) return 1;
    const kind = u8(at(p1, 12));
    if (!kinds(kind)) return 1;
    return u32At(at(p1, 8)) === u32At(at(p0, 8)) ? 0 : 1;
  };

  return {
    // 503: decode bits 1, 3 and 6 of the word at p0+4.
    503: p0 => {
      const flags = u32At(at(p0, 4)) & 74;
      if (flags === 64) return 8;
      if (flags === 8) return 16;
      if (flags !== 0) return 10;
      return 0;
    },

    // 708: initialise a small material record; a nonzero component whose byte
    // +10 has any of bits 0..1 set replaces the initial value with -1.0f.
    708: (p0, p1, p2) => {
      set32(at(p0, 0), 1115815936);
      set8(at(p0, 4), 0);
      const component = u32At(at(p2, 4));
      if (component && (u8(at(component, 10)) & 3))
        set32(at(p0, 0), -1082130432);
    },

    // 721: scan the dword range [p0,p1) for the word at *p2. The end pointer is
    // returned when no match exists.
    721: (p0, p1, p2) => {
      const target = u32At(p2);
      let cursor = u32(p0);
      while (cursor !== u32(p1)) {
        if (u32At(cursor) === target) return cursor | 0;
        cursor = u32(cursor + 4);
      }
      return p1 | 0;
    },

    // 724: the byte-wise equivalent of 721.
    724: (p0, p1, p2) => {
      const target = u8(p2);
      let cursor = u32(p0);
      while (cursor !== u32(p1)) {
        if (u8(cursor) === target) return cursor | 0;
        cursor = u32(cursor + 1);
      }
      return p1 | 0;
    },

    // 1789: widen dwords to bytes, substituting p3 for values >= 128.
    1789: (p0, p1, p2, p3, p4) => {
      let source = u32(p1), destination = u32(p4);
      while (source !== u32(p2)) {
        const value = u32At(source);
        set8(destination, (value >>> 0) < 128 ? value : p3);
        destination = u32(destination + 1);
        source = u32(source + 4);
      }
      return p2 | 0;
    },

    // 1935: increment the global counter and publish it at p0+4.
    1935: p0 => {
      const destination = u32(p0);
      const next = (u32At(7945880) + 1) | 0;
      set32(7945880, next);
      set32(at(destination, 4), next);
    },

    // 2299/2300/2301: component identity tests for kinds 3, 4 and 5/6. A
    // matching tag 512 plus equal +8 words yields 0; every other case yields 1.
    2299: (p0, p1) => sameComponent(p0, p1, kind => kind === 3),
    2300: (p0, p1) => sameComponent(p0, p1, kind => kind === 4),
    2301: (p0, p1) => sameComponent(p0, p1, kind => ((kind - 5) & 255) <= 1),

    // 2313: set the global byte at 7944456 to 1 when p3 starts with '1'.
    2313: (p0, p1, p2, p3) => {
      set8(7944456, p3 && u8(p3) === 49 ? 1 : 0);
    },
  };
}
