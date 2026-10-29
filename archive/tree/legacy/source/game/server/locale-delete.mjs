/** Recovered sp_server locale object deleter (original 620).
 *
 * Resets the object through 239 and then frees it.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([620]);

export function createLocaleDeleteHook(runtime) {
  return Object.freeze({
    620(record) {
      runtime.call(239, record);
      runtime.call(14, record);
    },
  });
}
