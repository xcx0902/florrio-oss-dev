/** Recovered sp_server two-digit year writers (original 329, 332).
 *
 * Reads the year through 87/88, applies the locale two-digit expansion unless
 * the flags byte has bit 2 set, and stores year-1900.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([329, 332]);

export function createTwoDigitYearHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function write(destination, year, flags, memory) {
    if ((memory.getUint8(flags >>> 0) & 4) === 0) {
      const expanded = year < 100 ? year + 1900 : year;
      const chosen = year < 69 ? expanded : year;
      memory.setUint32(destination >>> 0, (chosen - 1900) | 0, true);
    }
  }

  return Object.freeze({
    329(destination, first, second, flags, last) {
      const memory = memoryView();
      write(destination, runtime.call(87, first, second, flags, last, 4), flags, memory);
    },
    332(destination, first, second, flags, last) {
      const memory = memoryView();
      write(destination, runtime.call(88, first, second, flags, last, 4), flags, memory);
    },
  });
}
