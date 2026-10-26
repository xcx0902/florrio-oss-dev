/** Recovered sp_server delete guard (original 355).
 *
 * Releases a heap pointer through the recovered free (id 14), ignoring null and the two static
 * sentinel addresses 18764 and 18788.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([355]);

export function createDeleteGuardHook(runtime) {
  return Object.freeze({
    355(pointer) {
      const address = pointer >>> 0;
      if (address !== 0 && address !== 18764 && address !== 18788) runtime.call(14, address);
    },
  });
}
