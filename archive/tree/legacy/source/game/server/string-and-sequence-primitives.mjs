/** Recovered sp_server call-free primitives (71, 83, 126, 181, 606, 608, 609).
 *
 * 71 resolves an SSO string's data pointer. 83 records a seek position and
 * clamps the current pointer. 126 compares two NUL-terminated byte strings.
 * 181 reverses an i32 range in place. 606/609 accumulate a nibble hash over
 * i32 words / signed bytes. 608 lexicographically compares two i32 ranges.
 * WAT SHA-256: dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8.
 */

export const functionIds = Object.freeze([71, 83, 126, 181, 606, 608, 609]);

export function createStringAndSequencePrimitiveHooks(runtime) {
  let buffer, view;
  function memoryView() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }

  return Object.freeze({
    71(string) {
      const memory = memoryView();
      return (memory.getUint8((string >>> 0) + 11) & 0x80) !== 0
        ? memory.getUint32(string >>> 0, true)
        : string >>> 0;
    },
    83(state, position) {
      const memory = memoryView();
      const base = state >>> 0;
      const end = memory.getUint32(base + 8, true);
      const start = memory.getUint32(base + 4, true);
      const span = BigInt.asIntN(64, BigInt((end | 0) - (start | 0)));
      memory.setBigUint64(base + 112, BigInt.asUintN(64, position), true);
      memory.setBigUint64(base + 120, BigInt.asUintN(64, span), true);
      let current = end;
      if (position !== 0n) {
        const candidate = (start + Number(BigInt.asIntN(32, position))) >>> 0;
        current = position < span ? candidate : end;
      }
      memory.setUint32(base + 104, current, true);
    },
    126(left, right) {
      const memory = memoryView();
      let a = left >>> 0;
      let b = right >>> 0;
      for (;;) {
        const first = memory.getUint8(a);
        const second = memory.getUint8(b);
        if (first === 0) return 0 - second;
        if (first !== second) return first - second;
        a++;
        b++;
      }
    },
    181(first, last) {
      const memory = memoryView();
      let low = first >>> 0;
      let high = last >>> 0;
      while (low < high - 4) {
        const value = memory.getInt32(low, true);
        memory.setInt32(low, memory.getInt32(high - 4, true), true);
        memory.setInt32(high - 4, value, true);
        low += 4;
        high -= 4;
      }
    },
    606(_self, begin, end) {
      const memory = memoryView();
      let hash = 0;
      for (let cursor = begin >>> 0; cursor !== (end >>> 0); cursor += 4) {
        hash = (hash << 4) + memory.getInt32(cursor, true);
        const high = hash & 0xf0000000;
        hash ^= high | (high >>> 24);
      }
      return hash;
    },
    608(_self, left, leftEnd, right, rightEnd) {
      const memory = memoryView();
      let a = left >>> 0;
      let b = right >>> 0;
      while (b !== (rightEnd >>> 0)) {
        if (a === (leftEnd >>> 0)) return -1;
        const first = memory.getInt32(a, true);
        const second = memory.getInt32(b, true);
        if (first < second) return -1;
        if (first > second) return 1;
        a += 4;
        b += 4;
      }
      return a !== (leftEnd >>> 0) ? 1 : 0;
    },
    609(_self, begin, end) {
      const memory = memoryView();
      let hash = 0;
      for (let cursor = begin >>> 0; cursor !== (end >>> 0); cursor++) {
        hash = (hash << 4) + memory.getInt8(cursor);
        const high = hash & 0xf0000000;
        hash ^= high | (high >>> 24);
      }
      return hash;
    },
  });
}
