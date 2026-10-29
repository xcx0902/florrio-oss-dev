/** Recovered sp_server string object wrappers (original 238, 617, 618).
 *
 * 238 initializes through 185 and frees the object. 617/618 apply 238/185 to the
 * object header at -8.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([238, 617, 618]);

export function createStringObjectWrapperHooks(runtime) {
  return Object.freeze({
    238(record) {
      runtime.call(185, record);
      runtime.call(14, record);
    },
    617(record) {
      runtime.call(238, (record >>> 0) - 8);
    },
    618(record) {
      return runtime.call(185, (record >>> 0) - 8);
    },
  });
}
