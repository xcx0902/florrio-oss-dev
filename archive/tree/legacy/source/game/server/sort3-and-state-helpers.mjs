/** Recovered sp_server sort-three network, decimal writer and stream state
 * transitions (original 137, 138, 222).
 *
 * 137 sorts three u32 cells through pointers and reports how many swaps were
 * needed (0/1/2). 138 writes an unsigned 64-bit decimal representation
 * backwards from `end` and returns the first digit pointer. 222 advances the
 * iostream state machine, recording at +53/+54 and counting mismatches at +36.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([137, 138, 222]);

export function createSort3AndStateHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  function swap(memory, left, right) {
    const value = memory.getUint32(left, true);
    memory.setUint32(left, memory.getUint32(right, true), true);
    memory.setUint32(right, value, true);
  }

  return Object.freeze({
    137(first, second, third) {
      const memory = memoryView();
      const a = first >>> 0;
      const b = second >>> 0;
      const c = third >>> 0;
      const thirdBeforeSecond = memory.getUint32(c, true) < memory.getUint32(b, true);
      if (memory.getUint32(b, true) >= memory.getUint32(a, true)) {
        if (!thirdBeforeSecond) return 0;
        swap(memory, b, c);
        if (memory.getUint32(b, true) >= memory.getUint32(a, true)) return 1;
        swap(memory, a, b);
        return 2;
      }
      if (thirdBeforeSecond) {
        swap(memory, a, c);
        return 1;
      }
      swap(memory, a, b);
      if (memory.getUint32(c, true) >= memory.getUint32(b, true)) return 1;
      swap(memory, b, c);
      return 2;
    },
    138(value, end) {
      const memory = memoryView();
      let cursor = end >>> 0;
      let remaining = BigInt.asUintN(64, value);
      let low = remaining;
      if (remaining >= 4294967296n) {
        do {
          cursor--;
          const quotient = remaining / 10n;
          const more = remaining > 42949672959n;
          memory.setUint8(cursor, Number(remaining - quotient * 10n) | 48);
          remaining = quotient;
          if (!more) break;
        } while (true);
        low = remaining;
      }
      let word = Number(low & 0xffffffffn) >>> 0;
      if (word !== 0) {
        do {
          cursor--;
          const quotient = Math.floor(word / 10);
          const more = word > 9;
          memory.setUint8(cursor, (word - quotient * 10) | 48);
          word = quotient;
          if (!more) break;
        } while (true);
      }
      return cursor;
    },
    222(state, value, current, next) {
      const memory = memoryView();
      const base = state >>> 0;
      memory.setUint8(base + 53, 1);
      if (memory.getUint32(base + 4, true) !== (current >>> 0)) return;
      memory.setUint8(base + 52, 1);
      const saved = memory.getUint32(base + 16, true);
      if (saved === 0) {
        memory.setUint32(base + 36, 1, true);
        memory.setUint32(base + 24, next, true);
        memory.setUint32(base + 16, value, true);
        if (memory.getUint32(base + 48, true) !== 1) return;
        if ((next >>> 0) === 1) memory.setUint8(base + 54, 1);
        return;
      }
      if ((value >>> 0) === saved) {
        let mode = memory.getUint32(base + 24, true);
        if (mode === 2) {
          memory.setUint32(base + 24, next, true);
          mode = next;
        }
        if (memory.getUint32(base + 48, true) !== 1) return;
        if ((mode >>> 0) === 1) {
          memory.setUint8(base + 54, 1);
          return;
        }
        return;
      }
      memory.setUint32(base + 36, (memory.getUint32(base + 36, true) + 1) >>> 0, true);
      memory.setUint8(base + 54, 1);
    },
  });
}
