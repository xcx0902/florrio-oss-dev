/** Recovered sp_server scan helpers (original functions 231, 234, 378, 380).
 *
 * These are the compiler-runtime equivalents of std::find over a pointer range,
 * std::find over a byte range, bounded string-terminator search and unsigned decimal
 * parsing through a pointer-to-pointer cursor. They read and write guest memory
 * directly but implement complete algorithms, not instruction emulation.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([231, 234, 378, 380]);

export function createScanUtilitiesHook(runtime) {
  let buffer, view;
  function dataView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function fault(error) {
    if (error instanceof RangeError)
      return new WebAssembly.RuntimeError('memory access out of bounds');
    throw error;
  }

  /** Original 231: first 32-bit slot in [begin, end) equal to *needle. */
  function findWord(begin, end, needlePointer) {
    try {
      const needle = dataView().getUint32(needlePointer >>> 0, true);
      for (let cursor = begin >>> 0; cursor !== (end >>> 0); cursor = (cursor + 4) >>> 0) {
        if (dataView().getUint32(cursor, true) === needle) return cursor;
      }
      return end >>> 0;
    } catch (error) { throw fault(error); }
  }

  /** Original 234: first byte in [begin, end) equal to *needle. */
  function findByte(begin, end, needlePointer) {
    try {
      const needle = dataView().getUint8(needlePointer >>> 0);
      for (let cursor = begin >>> 0; cursor !== (end >>> 0); cursor = (cursor + 1) >>> 0) {
        if (dataView().getUint8(cursor) === needle) return cursor;
      }
      return end >>> 0;
    } catch (error) { throw fault(error); }
  }

  /** Original 378: pointer to the terminator within maximumBytes, else 0. */
  function boundedStringTerminator(text, maximumBytes) {
    try {
      const view = dataView();
      let cursor = text >>> 0;
      let remaining = maximumBytes >>> 0;
      while (remaining !== 0) {
        if (view.getUint8(cursor) === 0) return cursor;
        cursor = (cursor + 1) >>> 0;
        remaining = (remaining - 1) >>> 0;
      }
      return 0;
    } catch (error) { throw fault(error); }
  }

  /** Original 380: parse leading decimal digits, advancing the cursor. */
  function parseUnsignedDecimal(cursorPointer) {
    try {
      const view = dataView();
      let cursor = view.getUint32(cursorPointer >>> 0, true) >>> 0;
      let value = 0;
      for (;;) {
        const digit = view.getInt8(cursor);
        if (((digit - 48) >>> 0) >= 10) break;
        view.setUint32(cursorPointer >>> 0, (cursor + 1) >>> 0, true);
        cursor = (cursor + 1) >>> 0;
        value = (value * 10 + digit - 48) | 0;
      }
      return value;
    } catch (error) { throw fault(error); }
  }

  return Object.freeze({
    231: findWord,
    234: findByte,
    378: boundedStringTerminator,
    380: parseUnsignedDecimal,
  });
}
