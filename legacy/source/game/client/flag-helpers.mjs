/** Recovered client capability and dispatch helpers (originals 2006,2062,2297).
 *
 * 2006 probes the host capability/mutex pair. 2062 forwards two record fields and a
 * pair of callback pointers to 945. 2297 writes rows through 706 and reports whether
 * the target block is streaming.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2006, 2062, 2297]);

export function createFlagHelperHooks(runtime) {
  return Object.freeze({
    2006(flag) {
      const view = new DataView(runtime.memory.buffer);
      if (flag !== 0) {
        const owner = view.getUint32(7944256, true);
        if (owner === 0) return 0;
        const handle = view.getUint32(view.getUint32(owner + 144, true) + 12, true);
        return runtime.host('a', 'K', handle, 1) <= -1 ? 0 : 0;
      }
      return runtime.host('a', 'Ca') > -1 ? 0 : -1;
    },
    2062(destination, source) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      const start = source >>> 0;
      view.setBigUint64(frame, 0n, true);
      view.setUint32(frame + 8, view.getUint32(start + 12, true), true);
      view.setUint32(frame + 12, view.getUint32(start + 16, true), true);
      const hooks = view.getUint32(start + 76, true);
      runtime.call(945, destination >>> 0, start, frame,
        view.getUint32(hooks + 16, true), view.getUint32(hooks + 20, true));
      runtime.stackPointer.value = saved;
    },
    2297(target, length, count, source) {
      const view = new DataView(runtime.memory.buffer);
      const base = target >>> 0;
      const written = runtime.call(706, length, count, source, view.getUint32(base + 28, true));
      if (written !== 0) return written;
      const block = view.getUint32(base + 28, true);
      const flags = view.getUint32(block, true);
      if (((flags >>> 5) & 1) === 0) return 0;
      runtime.call(364, 13773, 0);
      return 0;
    },
  });
}
