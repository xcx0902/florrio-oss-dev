/** Recovered sp_server range copy (original 174).
 *
 * Copies the byte span between two addresses to a destination through 261 and
 * returns the address just past the copied output.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([174]);

export function createRangeCopyHook(runtime) {
  return Object.freeze({
    174(start, end, destination) {
      const length = (end - start) | 0;
      if (length !== 0) runtime.call(261, destination, start, length);
      return (destination + length) | 0;
    },
  });
}
