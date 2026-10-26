/** Recovered sp_server boolean string writers (original 489, 491).
 *
 * Each constructs a short std::string at `destination` through 123 from the
 * fixed literals "false" (3184) or "true" (3170). The second argument is unused.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([489, 491]);

export function createBoolStringHooks(runtime) {
  return Object.freeze({
    489(destination) {
      runtime.call(123, destination, 3184);
    },
    491(destination) {
      runtime.call(123, destination, 3170);
    },
  });
}
