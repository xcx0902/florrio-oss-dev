/** Recovered sp_server int64 parse wrappers (original 236, 352).
 *
 * Both forward to 373 with the argument span and a fixed inclusive limit:
 * -1 (236) or the minimum signed 64-bit value (352).
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([236, 352]);

export function createInt64ParseLimitHooks(runtime) {
  return Object.freeze({
    236(destination, begin, end) {
      return runtime.call(373, destination, begin, end, -1n);
    },
    352(destination, begin, end) {
      return runtime.call(373, destination, begin, end, -9223372036854775808n);
    },
  });
}
