/** Recovered sp_server string length setter (original 23).
 *
 * Forwards `(string, size)` to the resize routine 387, which grows with NUL
 * fill or shrinks with a new terminator.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([23]);

export function createStringLengthSetterHook(runtime) {
  return Object.freeze({
    23(string, size) {
      runtime.call(387, string, size);
    },
  });
}
