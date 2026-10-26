/** Recovered sp_server character reader (original 322).
 *
 * Reads one 32-bit value through 366, stores the full stream pointer at result+4 and the
 * sign-extended low byte at result+0.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([322]);

export function createStreamReadCharHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    322(result, handle) {
      const memory = memoryView();
      const stream = memory.getUint32(handle >>> 0, true);
      const value = runtime.call(366, stream);
      const signed = (value << 24) >> 24;
      memory.setUint32((result >>> 0) + 4, stream, true);
      memory.setUint8(result >>> 0, signed & 0xff);
    },
  });
}
