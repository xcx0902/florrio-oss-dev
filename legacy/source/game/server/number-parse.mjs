/** Recovered sp_server numeric base selection (original function 90).
 *
 * Chooses the radix used by the integer parser from the stream flags word at
 * +4. The mask 74 keeps the decimal/octal/hex flag bits:
 *
 *   0          -> 0  (no explicit base)
 *   64         -> 8  (octal)
 *   8          -> 16 (hex)
 *   other      -> 10 (decimal, including conflicting flag combinations)
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([90]);
const BASE_FLAGS = 74;

export function createNumberParseHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 90: radix implied by the stream flag bits. */
  function selectBase(stream) {
    let flags;
    try { flags = dataView().getUint32((stream + 4) >>> 0, true) & BASE_FLAGS; }
    catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
    if (flags === 0) return 0;
    if (flags === 64) return 8;
    if (flags === 8) return 16;
    return 10;
  }

  return Object.freeze({90: selectBase});
}
