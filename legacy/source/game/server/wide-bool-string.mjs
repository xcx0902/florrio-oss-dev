/** Recovered sp_server wide boolean string writers (original 496, 497).
 *
 * Each constructs a wide string at `destination` through 131 from the fixed
 * literals at 13580 ("false") or 13560 ("true").
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([496, 497]);

export function createWideBoolStringHooks(runtime) {
  return Object.freeze({
    496(destination) {
      runtime.call(131, destination, 13580);
    },
    497(destination) {
      runtime.call(131, destination, 13560);
    },
  });
}
