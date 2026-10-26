/** Recovered client vtable invoker (original 2044).
 *
 * Builds a one-entry call frame around the static vtable at 52088 and invokes its
 * first slot with the caller's object and the frame slot.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2044]);

export function createVtableInvokerHooks(runtime) {
  return Object.freeze({
    2044(object) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(frame + 8, 52088, true);
      const slot = view.getUint32(52088, true);
      runtime.indirect({parameters: ['i32', 'i32'], results: []}, slot, object, frame + 8);
      runtime.stackPointer.value = saved;
    },
  });
}
