/** Recovered sp_server stream seek helper (original 622).
 *
 * Implements a streambuf-style seek over the buffer at `state`:
 *
 * - the position record is max(+44,+24); the string buffer lives at +32;
 * - seeking is rejected when neither the output flag (8) nor input flag (16)
 *   is present, or when both are present with direction 1;
 * - direction 0 starts at 0, direction 1 at the current position inside the
 *   string, direction 2 at 0, other directions fail;
 * - the signed offset is added and must stay within [0, current position];
 * - output seeking moves +12 (end) and records +16; input seeking moves +24;
 * - success stores the new offset and state 0 in the result record, failure
 *   stores -1 and state 0.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([622]);

export function createStreamSeekHook(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    622(result, state, offset, direction, flags) {
      const memory = memoryView();
      const base = state >>> 0;
      const output = result >>> 0;
      let position = memory.getUint32(base + 44, true);
      const pending = memory.getUint32(base + 24, true);
      if (position < pending) {
        memory.setUint32(base + 44, pending, true);
        position = pending;
      }

      function fail() {
        memory.setBigInt64(output + 8, -1n, true);
        memory.setBigInt64(output, 0n, true);
      }

      const mode = flags & 24;
      if (mode === 0 || (mode === 24 && direction === 1)) return fail();

      let fromStringStart = 0n;
      if (position !== 0) {
        const string = base + 32;
        const data = (memory.getUint8(string + 11) & 0x80) !== 0
          ? memory.getUint32(string, true)
          : string;
        fromStringStart = BigInt(position - data);
      }

      let origin = 0n;
      if (direction === 1 || direction === 2) origin = fromStringStart;
      else if (direction !== 0) return fail();

      const target = BigInt.asIntN(64, BigInt(offset) + origin);
      if (target < 0n || target > fromStringStart) return fail();

      if (target !== 0n) {
        if ((flags & 8) !== 0 && memory.getUint32(base + 12, true) === 0) return fail();
        if ((flags & 16) !== 0 && memory.getUint32(base + 24, true) === 0) return fail();
      }

      const delta = Number(BigInt.asIntN(32, target));
      if ((flags & 8) !== 0) {
        const read = memory.getUint32(base + 8, true);
        memory.setUint32(base + 16, position, true);
        memory.setUint32(base + 12, (read + delta) >>> 0, true);
        memory.setUint32(base + 8, read, true);
      }
      if ((flags & 16) !== 0) {
        const input = memory.getUint32(base + 20, true);
        memory.setUint32(base + 20, input, true);
        memory.setUint32(base + 24, (input + delta) >>> 0, true);
      }
      memory.setBigInt64(output + 8, target, true);
      memory.setBigInt64(output, 0n, true);
    },
  });
}
