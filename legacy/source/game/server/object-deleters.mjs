/** Recovered sp_server deleting destructors (original 460, 495, 499).
 *
 * Each runs the matching vtable destructor (292, 299 or 300) and then releases
 * the object itself through free.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([460, 495, 499]);

export function createObjectDeleterHooks(runtime) {
  return Object.freeze({
    460(record) {
      runtime.call(292, record);
      runtime.call(14, record);
    },
    495(record) {
      runtime.call(299, record);
      runtime.call(14, record);
    },
    499(record) {
      runtime.call(300, record);
      runtime.call(14, record);
    },
  });
}
