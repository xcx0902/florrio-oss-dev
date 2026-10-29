/** Recovered sp_server string member assignments (original 492, 498).
 *
 * Copies the string record at `source` into the member at +12 (492) or +16
 * (498) of `destination` using the string assignment 228.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([492, 498]);

export function createStringMemberAssignHooks(runtime) {
  return Object.freeze({
    492(destination, source) {
      runtime.call(228, destination, (source >>> 0) + 12);
    },
    498(destination, source) {
      runtime.call(228, destination, (source >>> 0) + 16);
    },
  });
}
