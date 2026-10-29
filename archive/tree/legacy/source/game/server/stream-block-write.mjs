/** Recovered sp_server buffered block write (original 274, 427).
 *
 * 274 writes `count` bytes from `source` into the stream's put area (+16 is the
 * end offset, +20 the cursor), advancing +20 and returning the byte count. When
 * the span does not fit it delegates to the virtual block-write slot at
 * vtable+36. A non-negative byte at +75 enables newline handling: the source is
 * scanned for '\n' and the prefix is written through the virtual slot first.
 *
 * 427 writes size*count bytes and returns the number of complete elements
 * (`count` when all bytes were written, otherwise written/size).
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([274, 427]);

export function createStreamBlockWriteHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function overflow(memory, stream, source, count) {
    const table = memory.getUint32(stream, true);
    const method = memory.getUint32(table + 36, true);
    return runtime.indirect({parameters: ['i32', 'i32', 'i32'], results: ['i32']},
      method, stream, source, count);
  }

  function writeBlock(memory, source, count, stream) {
    let available = memory.getUint32(stream + 16, true);
    if (available === 0) {
      if (runtime.call(430, stream) !== 0) return 0;
      available = memory.getUint32(stream + 16, true);
    }
    const cursor = memory.getUint32(stream + 20, true);
    if ((count >>> 0) > (available - cursor) >>> 0) return overflow(memory, stream, source, count);

    let prefix = 0;
    if (memory.getInt8(stream + 75) >= 0 && count !== 0) {
      let index = count;
      for (;;) {
        prefix = index;
        if (prefix === 0) break;
        index = prefix - 1;
        if (memory.getUint8((source >>> 0) + index) === 10) break;
      }
      if (prefix !== 0) {
        const written = overflow(memory, stream, source, prefix);
        if ((written >>> 0) < (prefix >>> 0)) return written;
        source = (source + prefix) >>> 0;
        count -= prefix;
      }
    }
    const put = memory.getUint32(stream + 20, true);
    new Uint8Array(memory.buffer).copyWithin(put, source >>> 0, (source >>> 0) + count);
    memory.setUint32(stream + 20, put + count, true);
    return (count + prefix) >>> 0;
  }

  return Object.freeze({
    274(source, count, stream) {
      return writeBlock(memoryView(), source, count >>> 0, stream >>> 0);
    },
    427(source, size, count, stream) {
      const total = (size * count) >>> 0;
      const written = writeBlock(memoryView(), source, total, stream >>> 0);
      if (written === total) return size === 0 ? 0 : count;
      return (written / (size >>> 0)) >>> 0;
    },
  });
}
