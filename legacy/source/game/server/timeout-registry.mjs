/** Recovered sp_server timeout-registry teardown (original function 658).
 *
 * Walks the linked list rooted at 8569340. Each node stores its successor at
 * +0 and an optional timer callback at +12. For a callback, the destructor
 * dispatches through vtable slot 4 when the callback is its own base object,
 * otherwise slot 5, then frees both the callback and the node. Finally the
 * auxiliary block held at 8569332 is released and that slot is cleared.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([658]);
export const dependencyIds = Object.freeze([14]);
const LIST_HEAD = 8569340;
const AUXILIARY = 8569332;

export function createTimeoutRegistryHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  const u32At = address => dataView().getUint32(address >>> 0, true);
  const set32 = (address, value) => dataView().setUint32(address >>> 0, value >>> 0, true);

  /** Original 658: destroy every pending timeout entry. */
  function destroyTimeoutRegistry(_unused) {
    let node = u32At(LIST_HEAD);
    while (node !== 0) {
      const callback = u32At((node + 12) >>> 0);
      set32((node + 12) >>> 0, 0);
      const next = u32At(node);
      if (callback !== 0) {
        const slot = callback === node ? 4 : 5;
        const vtable = u32At(callback);
        const method = u32At((vtable + slot * 4) >>> 0);
        runtime.indirect({parameters: ['i32'], results: []}, method, callback);
        runtime.call(14, callback);
      }
      runtime.call(14, node);
      node = next;
    }
    const auxiliary = u32At(AUXILIARY);
    set32(AUXILIARY, 0);
    if (auxiliary !== 0) runtime.call(14, auxiliary);
  }

  return Object.freeze({658: destroyTimeoutRegistry});
}
