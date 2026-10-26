/** Recovered sp_server cleanup chain (original 241, 259).
 *
 * 259 runs the object cleanup 242 and discards its result. 241 advances to the
 * payload at +8, runs 259 and returns the original object.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([241, 259]);

export function createObjectCleanupChainHooks(runtime) {
  return Object.freeze({
    241(record) {
      runtime.call(259, (record >>> 0) + 8);
      return record;
    },
    259(payload) {
      runtime.call(242, payload);
    },
  });
}
