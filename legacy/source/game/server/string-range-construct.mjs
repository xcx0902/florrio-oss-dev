/** Recovered sp_server string range constructors (original 607, 610).
 *
 * Both forward the destination and the source range to a string constructor
 * (351 for wide characters, 187 for bytes), discarding the returned pointer.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([607, 610]);

export function createStringRangeConstructHooks(runtime) {
  return Object.freeze({
    607(destination, ignored, first, last) {
      runtime.call(351, destination, first, last);
    },
    610(destination, ignored, first, last) {
      runtime.call(187, destination, first, last);
    },
  });
}
