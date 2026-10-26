/** Recovered sp_server string assignment adapters (original 27, 535).
 *
 * 27 constructs the libc++ string at `destination` from the NUL-terminated
 * byte string at `text` (original 200). 535 assigns the string object at
 * `source` into `destination` (original 228); the four middle arguments of the
 * six-argument ABI are unused by the original body.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([27, 535]);

export function createStringAssignmentAdapterHooks(runtime) {
  return Object.freeze({
    27(destination, text) {
      runtime.call(200, destination, text);
    },
    535(destination, _p1, _p2, _p3, _p4, source) {
      runtime.call(228, destination, source);
    },
  });
}
