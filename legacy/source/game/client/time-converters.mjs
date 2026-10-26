/** Recovered client two-digit year converters (originals 868,871).
 *
 * Parses a time through 500 or 501 and, unless the flag byte holds bit 4, writes
 * the full year (1900 + the two-digit year) to the destination.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([868, 871]);

export function createTimeConverterHooks(runtime) {
  function convert(parser, destination, first, second, third, fourth) {
    const year = runtime.call(parser, first, second, third, fourth, 4);
    if ((new DataView(runtime.memory.buffer).getUint8(third >>> 0) & 4) === 0) {
      const full = year < 69 ? year + 2000 : year < 100 ? year + 1900 : year;
      new DataView(runtime.memory.buffer).setUint32(destination >>> 0, full - 1900, true);
    }
  }

  return Object.freeze({
    868(destination, a, b, flags, c) {
      convert(500, destination, a, b, flags, c);
    },
    871(destination, a, b, flags, c) {
      convert(501, destination, a, b, flags, c);
    },
  });
}
