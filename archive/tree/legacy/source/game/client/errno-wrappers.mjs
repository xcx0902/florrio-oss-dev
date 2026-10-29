/** Recovered client errno-preserving wrappers (originals 437,713,838,879).
 *
 * Each captures the current errno through 488, calls a worker and republishes a
 * non-zero errno at 133584 (mapping -1 to the static 7945660 message).
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([437, 713, 838, 879]);

export function createErrnoWrapperHooks(runtime) {
  function publish(pointer) {
    const view = new DataView(runtime.memory.buffer);
    const code = view.getUint32(pointer >>> 0, true);
    if (code !== 0) view.setUint32(133584, code === 0xffffffff ? 7945660 : code, true);
  }

  return Object.freeze({
    437(a, b, c, d, e) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(frame + 12, c, true);
      view.setUint32(frame + 8, e, true);
      const errno = runtime.call(488, frame + 12);
      const result = runtime.call(555, a, b, d, view.getUint32(frame + 8, true));
      publish(errno);
      runtime.stackPointer.value = saved;
      return result;
    },
    713(a, b, c) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      new DataView(runtime.memory.buffer).setUint32(frame + 12, c, true);
      const errno = runtime.call(488, frame + 12);
      const result = runtime.call(543, a, b);
      publish(errno);
      runtime.stackPointer.value = saved;
      return result;
    },
    838(a, b, c, d, e) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(frame + 12, e, true);
      const errno = runtime.call(488, frame + 8, frame + 12);
      const result = runtime.call(651, a, b, c, d);
      publish(errno);
      runtime.stackPointer.value = saved;
      return result;
    },
    879(a, b, c) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(frame + 12, b, true);
      view.setUint32(frame + 8, c, true);
      const errno = runtime.call(488, frame + 12);
      const result = runtime.call(744, a, 12883, view.getUint32(frame + 8, true));
      publish(errno);
      runtime.stackPointer.value = saved;
      return result;
    },
  });
}
