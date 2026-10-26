/** Recovered sp_server string move-assignment helpers (original functions 54 and 86).
 *
 * Both replace a destination string with a source string and leave the source
 * empty. A long destination releases its heap buffer through free; the 12-byte
 * small-string header (data pointer, size and tag) is then copied verbatim from
 * the source, and the source tag is cleared. Function 54 writes a single NUL at
 * the source object, while function 86 clears the first four bytes.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([54, 86]);
export const dependencyIds = Object.freeze([14]);
const FREE = 14;

export function createStringMoveHooks(runtime) {
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

  function moveString(destination, source, clearFourBytes) {
    const view = dataView();
    const destinationLong = (view.getUint8(destination + 11) & 0x80) !== 0;
    if (destinationLong) runtime.call(FREE, view.getUint32(destination, true));
    view.setUint32(destination + 8, view.getUint32(source + 8, true), true);
    const low = view.getBigUint64(source, true);
    view.setBigUint64(destination, low, true);
    view.setUint8(source + 11, 0);
    if (clearFourBytes) view.setUint32(source, 0, true);
    else view.setUint8(source, 0);
  }

  return Object.freeze({
    /** Original 54: move assignment, NUL-terminate the source object. */
    54(destination, source) {
      try { moveString(destination >>> 0, source >>> 0, false); }
      catch (error) { throw fault(error); }
    },
    /** Original 86: move assignment, clear four source bytes. */
    86(destination, source) {
      try { moveString(destination >>> 0, source >>> 0, true); }
      catch (error) { throw fault(error); }
    },
  });
}
