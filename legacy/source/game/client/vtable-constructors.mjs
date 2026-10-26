/** Recovered client vtable-only object constructors (24 original functions).
 *
 * Each constructor calls the native allocator (function 371) and stores a
 * constant vtable pointer at offset 0. A subset also zeroes offset 4 before
 * storing the vtable; the remaining objects leave the second word untouched.
 * WAT SHA-256:
 * d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

const CONSTRUCTORS = Object.freeze({
  709:  {size: 4, vtable: 33200},
  1434: {size: 8, vtable: 34428, zeroSecondWord: true},
  1467: {size: 8, vtable: 34560, zeroSecondWord: true},
  1478: {size: 8, vtable: 34604, zeroSecondWord: true},
  1532: {size: 4, vtable: 34208},
  1543: {size: 4, vtable: 34164},
  1565: {size: 4, vtable: 33944},
  1587: {size: 4, vtable: 34032},
  1598: {size: 4, vtable: 34076},
  1609: {size: 4, vtable: 33900},
  1620: {size: 4, vtable: 33856},
  1631: {size: 4, vtable: 33156},
  1652: {size: 4, vtable: 33244},
  1706: {size: 4, vtable: 33464},
  1728: {size: 4, vtable: 33592},
  1739: {size: 8, vtable: 33636, zeroSecondWord: true},
  1750: {size: 8, vtable: 33680, zeroSecondWord: true},
  1870: {size: 4, vtable: 33768},
  2336: {size: 8, vtable: 90288},
  2351: {size: 8, vtable: 34720},
  2367: {size: 8, vtable: 34900},
  2386: {size: 8, vtable: 90180},
  2389: {size: 8, vtable: 90216},
  2637: {size: 8, vtable: 90324},
  2354: {size: 8, vtable: 34756, copy: 'word'},
  2358: {size: 8, vtable: 34792, copy: 'word'},
  2361: {size: 8, vtable: 34828, copy: 'word'},
  2364: {size: 12, vtable: 34864, copy: 'pair'},
  2370: {size: 12, vtable: 34936, copy: 'pair'},
  2382: {size: 8, vtable: 90144, copy: 'word'},
  2392: {size: 8, vtable: 90252, copy: 'word'},
  2409: {size: 8, vtable: 90360, copy: 'word'},
  2423: {size: 8, vtable: 90396, copy: 'word'},
  2440: {size: 8, vtable: 90576, copy: 'word'},
  2443: {size: 8, vtable: 90612, copy: 'word'},
  2446: {size: 8, vtable: 90648, copy: 'word'},
  4048: {size: 8, vtable: 89964, copy: 'word'},
  4050: {size: 8, vtable: 90000, copy: 'word'},
  4053: {size: 8, vtable: 90036, copy: 'word'},
  4057: {size: 8, vtable: 90072, copy: 'word'},
  1456: {size: 16, vtable: 34516, init: 'pairZero16'},
  1663: {size: 16, vtable: 33288, init: 'pairZero16'},
  1717: {size: 24, vtable: 33548, init: 'tripleZero24'},
  1445: {size: 652, vtable: 34472, init: 'fillZero'},
  2402: {size: 168, vtable: 34648, init: 'fillZero'},
  2429: {size: 48, vtable: 90720, init: 'copyHelper', helper: 1024},
  2452: {size: 48, vtable: 90504, init: 'copyHelper', helper: 1026},
});

export const functionIds = Object.freeze(
  Object.keys(CONSTRUCTORS).map(Number).sort((left, right) => left - right));

export function createVtableConstructorHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const u32At = address => {
    try {
      return dataView().getUint32(address, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  };
  function set32(address, value) {
    try {
      dataView().setUint32(address, value, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  function set64(address, value) {
    try {
      dataView().setBigUint64(address, value, true);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function set8(address, value) {
    try {
      dataView().setUint8(address, value);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  const hooks = {};
  for (const id of functionIds) {
    const shape = CONSTRUCTORS[id];
    hooks[id] = input => {
      const object = runtime.call(371, shape.size) >>> 0;
      if (shape.zeroSecondWord) set32((object + 4) >>> 0, 0);
      if (shape.init === 'pairZero16') {
        set64(object, 0n); set64((object + 8) >>> 0, 0n);
        set8((object + 4) >>> 0, 0); set8((object + 8) >>> 0, 0);
      }
      if (shape.init === 'tripleZero24') {
        set64(object, 0n); set64((object + 8) >>> 0, 0n); set64((object + 16) >>> 0, 0n);
        set8((object + 8) >>> 0, 0);
      }
      if (shape.init === 'fillZero') {
        runtime.call(382, object, 0, shape.size);
      }
      set32(object, shape.vtable);
      if (shape.init === 'pairZero16') set32((object + 12) >>> 0, 0);
      if (shape.init === 'fillZero') set32((object + 4) >>> 0, 0);
      if (shape.init === 'copyHelper') runtime.call(shape.helper, (object + 8) >>> 0, (input + 8) >>> 0);
      if (shape.copy === 'word') set32((object + 4) >>> 0, u32At((input + 4) >>> 0));
      if (shape.copy === 'pair') {
        set32((object + 4) >>> 0, u32At((input + 4) >>> 0));
        set32((object + 8) >>> 0, u32At((input + 8) >>> 0));
      }
      return object;
    };
  }
  return hooks;
}
