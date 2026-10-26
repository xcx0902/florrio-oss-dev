/** Recovered client type-erased callable invokers (16 originals).
 *
 * Each original is a two-parameter wrapper that builds a temporary object with a
 * single vtable pointer in its 16-byte frame and dispatches the vtable's first
 * entry with `(temporaryObject, argument)`.  In C++ terms this is
 * `std::function<void(T&)>::operator()` (or the equivalent `Function`-style
 * callable adapter) over a type-erased closure: the wrapper never touches the
 * argument itself, it only supplies the closure object the callee receives as
 * its second parameter.
 *
 * The first source-level parameter is dead: every original overwrites it with
 * the frame pointer before it is read.
 *
 * WAT SHA-256: d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31.
 */

export const functionIds = Object.freeze([
  1312, 1316, 1322, 1328, 1337, 1374, 1404, 3358, 3361, 3368, 3373, 3382,
  3420, 3449, 3532, 4605,
]);

/** id -> address of the closure descriptor whose first slot is the callee. */
const descriptors = Object.freeze({
  1312: 42308,
  1316: 42248,
  1322: 42080,
  1328: 41888,
  1337: 41480,
  1374: 40004,
  1404: 38828,
  3358: 68588,
  3361: 68528,
  3368: 68360,
  3373: 68168,
  3382: 67760,
  3420: 66284,
  3449: 65108,
  3532: 60992,
  4605: 38312,
});

const FRAME_BYTES = 16;
const DESCRIPTOR_SLOT = 8;

export function createCallableInvokerHooks(runtime) {
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

  const hooks = {};
  for (const [id, descriptor] of Object.entries(descriptors)) {
    hooks[id] = (_deadParameter, argument) => {
      const saved = runtime.stackPointer.value;
      const frame = (saved - FRAME_BYTES) >>> 0;
      runtime.stackPointer.value = frame;
      writeUint32(frame + DESCRIPTOR_SLOT, descriptor);
      // The callee is the descriptor's first entry; the temporary object is its
      // first argument and the caller's argument is forwarded as the second.
      runtime.indirect(
        { parameters: ['i32', 'i32'], results: [] },
        readUint32(descriptor),
        frame + DESCRIPTOR_SLOT,
        argument,
      );
      runtime.stackPointer.value = saved;
    };
  }
  return Object.freeze(hooks);
}
