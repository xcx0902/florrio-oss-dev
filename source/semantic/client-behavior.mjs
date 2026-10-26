/** Instruction-grounded client routines, not a replacement for the full client.
 * Original client.wasm SHA-256:
 * c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1.
 */
export const CLIENT_MEMORY = Object.freeze({
  wheelDelta: 163840,
  quitConfirmationCallback: 439168,
  disconnectRequested: 7784496,
});

/** func3310, export Rf: accumulate browser-normalized wheel movement as f64. */
export function accumulateMouseWheel(memory, delta) {
  const view = new DataView(memory.buffer);
  view.setFloat64(CLIENT_MEMORY.wheelDelta,
    view.getFloat64(CLIENT_MEMORY.wheelDelta, true) + delta, true);
}

/** func3342, export Xf: request a disconnect; the frame loop consumes this flag. */
export function requestDisconnect(memory) {
  new Uint8Array(memory.buffer)[CLIENT_MEMORY.disconnectRequested] = 1;
}

/** func3386, export Uf: ask the optional type-erased callback at vtable slot 6.
 * The callback object itself is passed as its sole argument (the C++ `this`).
 * No callback means 0. No boolean coercion is performed on callback results.
 */
export function shouldConfirmBrowserQuit(memory, functionTable) {
  const view = new DataView(memory.buffer);
  const callback = view.getUint32(CLIENT_MEMORY.quitConfirmationCallback, true);
  if (!callback) return 0;
  const vtable = view.getUint32(callback, true);
  return functionTable.get(view.getUint32(vtable + 24, true))(callback);
}
