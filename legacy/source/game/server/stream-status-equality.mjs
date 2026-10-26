/** Recovered sp_server stream status equality (original 48, 49, 363, 368).
 *
 * 363 compares the word-status probes 362 for two handles; 368 does the same
 * with the byte-status probes 367. Both return 1 when the statuses agree.
 * 48 and 49 forward two arguments to 363 and 368 respectively.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([48, 49, 363, 368]);

export function createStreamStatusEqualityHooks(runtime) {
  return Object.freeze({
    48(left, right) {
      return runtime.call(363, left, right);
    },
    49(left, right) {
      return runtime.call(368, left, right);
    },
    363(left, right) {
      return (runtime.call(362, left) ^ runtime.call(362, right)) ^ 1;
    },
    368(left, right) {
      return (runtime.call(367, left) ^ runtime.call(367, right)) ^ 1;
    },
  });
}
