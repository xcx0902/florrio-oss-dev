/** Recovered sp_server entity-definition flag reset (original function 490).
 *
 * Clears one byte at the start of each of the 39 flag bytes in the static
 * entity-definition table: 38 records spaced 52 bytes from 8545796, plus the
 * adjacent flag at 8547720. The table occupies 8545796..8547772; the first clear is the table's preceding field at 8547720, and the emitted
 * order around 8546836/8546784/8546732 is preserved exactly.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([490]);

/** Byte addresses cleared by the original, in emitted order. */
export const clearedFlagAddresses = Object.freeze([
  8547720, 8547772, 8547668, 8547616, 8547564, 8547512, 8547460, 8547408,
  8547356, 8547304, 8547252, 8547200, 8547148, 8547096, 8547044, 8546992,
  8546940, 8546888, 8546836, 8546732, 8546784, 8546680, 8546628, 8546576,
  8546524, 8546472, 8546420, 8546368, 8546316, 8546264, 8546212, 8546160,
  8546108, 8546056, 8546004, 8545952, 8545900, 8545848, 8545796,
]);

export function createEntityFlagResetHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  /** Original 490: clear the per-entity-definition flag bytes. */
  function resetEntityDefinitionFlags(_unused) {
    const memory = memoryView();
    for (const address of clearedFlagAddresses) memory.setUint8(address, 0);
  }

  return Object.freeze({490: resetEntityDefinitionFlags});
}
