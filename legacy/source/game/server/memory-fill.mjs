/** Recovered sp_server memory fill (original 325).
 *
 * Fills `count` bytes at `destination` with the low byte of `value` and returns
 * destination. A zero count leaves memory untouched.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([325]);

export function createMemoryFillHook(runtime) {
  return Object.freeze({
    325(destination, count, value) {
      if (count !== 0) new Uint8Array(runtime.memory.buffer).fill(value & 0xff, destination >>> 0, (destination + count) >>> 0);
      return destination;
    },
  });
}
