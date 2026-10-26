/** Recovered client compact destructors (originals 2494,2662,2683).
 *
 * 2494 reports two enable-gated handles. 2662 releases a global pointer vector.
 * 2683 publishes a vtable, releases three subobjects and frees the record.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2494, 2662, 2683]);

export function createCompactDestructorHooks(runtime) {
  function report(pairs) {
    const view = new DataView(runtime.memory.buffer);
    const saved = runtime.stackPointer.value;
    const frame = (saved - 32) >>> 0;
    runtime.stackPointer.value = frame;
    for (const [enable, slot, offset] of pairs) {
      if (view.getUint8(enable) === 0) continue;
      const handle = view.getUint32(slot, true);
      if (handle === 0xffffffff) continue;
      view.setUint32(frame + offset, handle, true);
      runtime.host('a', 'a', 141569, 31967, frame + offset);
    }
    runtime.stackPointer.value = saved;
  }

  return Object.freeze({
    2494() {
      report([[7932376, 7932372, 16], [7932368, 7932364, 0]]);
    },
    2662() {
      const view = new DataView(runtime.memory.buffer);
      const start = view.getUint32(437380, true);
      const count = view.getUint32(437372, true);
      let released = start;
      if (count !== 0) {
        const end = (start + count * 4) >>> 0;
        for (let cursor = start; cursor !== end; cursor = (cursor + 4) >>> 0)
          runtime.call(416, cursor, 0);
        released = view.getUint32(437380, true);
      }
      runtime.call(362, released);
      view.setBigUint64(437372, 0n, true);
      view.setUint32(437380, 0, true);
    },
    2683(record) {
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(record >>> 0, 33088, true);
      runtime.call(377, (record >>> 0) + 608);
      runtime.call(377, (record >>> 0) + 368);
      runtime.call(377, record >>> 0);
      runtime.call(362, record >>> 0);
    },
  });
}
