/** Recovered sp_server abort helpers (original 42, 58).
 *
 * 42 invokes the abort import (5) and then traps. 58 delegates to 42 and then
 * traps as well.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([42, 58]);

export function createAbortHelperHooks(runtime) {
  return Object.freeze({
    42() {
      runtime.call(5);
      throw new Error('unreachable');
    },
    58() {
      runtime.call(42);
      throw new Error('unreachable');
    },
  });
}
