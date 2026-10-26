/** Recovered client asm-const callbacks (originals 2035,2328,2437).
 *
 * Each builds a small frame, places an `i` signature and forwards a pointer plus
 * frame slot to `emscripten_asm_const_int`.
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([2035, 2328, 2437]);

export function createAsmConstCallbackHooks(runtime) {
  function emit(constId, frame, signature, pointer) {
    runtime.host('a', 'a', constId, signature, pointer);
  }

  return Object.freeze({
    2035(record) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      view.setUint16(frame + 14, 105, true);
      view.setUint32(frame, view.getUint32((record >>> 0) + 8, true), true);
      emit(144992, frame, frame + 14, frame);
      runtime.stackPointer.value = saved;
    },
    2328(record) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      view.setUint16(frame + 14, 105, true);
      view.setUint32(frame, view.getUint32((record >>> 0) + 68, true), true);
      emit(149156, frame, frame + 14, frame);
      runtime.stackPointer.value = saved;
    },
    2437(record) {
      const saved = runtime.stackPointer.value;
      const frame = (saved - 16) >>> 0;
      runtime.stackPointer.value = frame;
      const view = new DataView(runtime.memory.buffer);
      const first = view.getUint32((record >>> 0) + 4, true);
      view.setUint32(frame, view.getUint32((view.getUint32(first + 60, true)) >>> 0, true), true);
      view.setUint32(frame + 8, 1, true);
      view.setUint8(frame + 15, 0);
      view.setUint32(frame + 4, frame + 15, true);
      emit(140437, frame, 32221, frame);
      runtime.stackPointer.value = saved;
    },
  });
}
