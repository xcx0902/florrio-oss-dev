/** Recovered sp_server byte-string utilities (original functions 104 and 120).
 *
 * 104 `strlen` returns the number of bytes before the first NUL. The shipped
 * implementation scans a word at a time but is observationally identical to a
 * byte scan, including unaligned starts.
 *
 * 120 `reverseByteRange` reverses the half-open byte range [begin, end) in
 * place; an empty range is left untouched.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([104, 120]);

export function createStringUtilityHooks(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function byteAt(address) {
    try {
      return dataView().getUint8(address);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }
  function writeByte(address, value) {
    try {
      dataView().setUint8(address, value);
    } catch (error) {
      if (error instanceof RangeError)
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      throw error;
    }
  }

  /** Original 104: C string length. */
  function stringLength(address) {
    let cursor = address >>> 0;
    while (byteAt(cursor) !== 0) cursor = (cursor + 1) >>> 0;
    return (cursor - (address >>> 0)) | 0;
  }

  /** Original 120: in-place reversal of [begin, end). */
  function reverseByteRange(begin, end) {
    let left = begin >>> 0;
    let right = end >>> 0;
    if (left === right) return;
    while (left < right) {
      right = (right - 1) >>> 0;
      if (left >= right) break;
      const byte = byteAt(left);
      writeByte(left, byteAt(right));
      writeByte(right, byte);
      left = (left + 1) >>> 0;
    }
  }

  return Object.freeze({104: stringLength, 120: reverseByteRange});
}
