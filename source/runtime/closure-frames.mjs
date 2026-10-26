/** Stack-frame and closure-dispatch helpers shared by recovered adapters.
 *
 * The C++ build materialises type-erased callables (std::function-style
 * closures) in the caller's stack frame: a slot receives a pointer to a static
 * descriptor table and the table's entry is dispatched with `call_indirect`.
 * Recovered adapters keep the same frame layout because the callee reads it.
 */
export function createClosureFrames(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function readUint32(address) {
    try {
      return dataView().getUint32(address >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function writeUint32(address, value) {
    try {
      dataView().setUint32(address >>> 0, value >>> 0, true);
    } catch (error) {
      if (error instanceof RangeError) throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  return Object.freeze({
    readUint32,
    writeUint32,
    /** Reserve `bytes` below the current stack pointer and return the new frame. */
    open(bytes) {
      const frame = (runtime.stackPointer.value - bytes) >>> 0;
      runtime.stackPointer.value = frame;
      return frame;
    },
    /** Release a frame.  Trapping calls must skip this to match the original. */
    close(frame, bytes) {
      runtime.stackPointer.value = (frame + bytes) >>> 0;
    },
    /** Install `descriptor` at `slot` and dispatch its entry with `args` as given. */
    dispatch(signature, slot, descriptor, ...args) {
      writeUint32(slot, descriptor);
      return runtime.indirect(signature, readUint32(descriptor), ...args);
    },

    /** Materialise `descriptor` at `callable` and dispatch its entry.
     *  The callable object is always forwarded as the first argument. */
    invoke(signature, callable, descriptor, ...args) {
      writeUint32(callable, descriptor);
      return runtime.indirect(signature, readUint32(descriptor), callable, ...args);
    },
  });
}
