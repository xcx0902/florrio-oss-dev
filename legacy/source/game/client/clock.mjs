/** Process clock, optional simulation override and C++ static-initializer guards.
 * Complete bodies369/370/372/554. Scratch writes are retained because native callers
 * share the same stack, including observable partial state when a guard traps.
 */
export const functionIds = Object.freeze([ 369, 370, 372, 554 ]);

export function createClientClockHooks(runtime) {
  let buffer, view;
  function memory(address, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if (address < 0 || address + size > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return view;
  }
  const u8 = a => memory(a, 1).getUint8(a);
  const u32 = a => memory(a, 4).getUint32(a, true);
  const long = a => memory(a, 8).getBigUint64(a, true);
  const byte = (a, v) => memory(a, 1).setUint8(a, v);
  const word = (a, v) => memory(a, 4).setUint32(a, v, true);
  const putLong = (a, v) => memory(a, 8).setBigUint64(a, v, true);
  const readDouble = a => memory(a, 8).getFloat64(a, true);
  const double = (a, v) => memory(a, 8).setFloat64(a, v, true);
  function guardFrame(guard) {
    const saved = runtime.stackPointer.value, outer = saved - 16 >>> 0;
    runtime.stackPointer.value = outer;
    word(outer + 12, 0);
    word(outer + 4, guard);
    word(outer, guard);
    word(outer + 8, guard + 1 >>> 0);
    const inner = outer - 16 >>> 0;
    runtime.stackPointer.value = inner;
    word(inner + 8, u32(outer + 4));
    return {
      saved: saved,
      outer: outer,
      inner: inner
    };
  }
  /** Original370: publish a completed static initializer. */  function releaseGuard(guard) {
    const {saved: saved, outer: outer, inner: inner} = guardFrame(guard);
    byte(u32(inner + 8), 1);
    byte(u32(outer + 8), 1);
    runtime.stackPointer.value = saved;
  }
  /** Original369: acquire an uninitialized guard, trapping recursive entry. */  function acquireGuard(guard) {
    const {saved: saved, outer: outer, inner: inner} = guardFrame(guard);
    let acquired = 0;
    if (!u8(u32(inner + 8))) {
      const pending = u32(outer + 8), state = u8(pending);
      if (state !== 1) {
        if (state & 2) throw new WebAssembly.RuntimeError("unreachable");
        byte(pending, 2);
        acquired = 1;
      }
    }
    runtime.stackPointer.value = saved;
    return acquired;
  }
  function initializeClockKind(argumentsPointer) {
    if (!(u8(7910220) & 1) && acquireGuard(7910220)) {
      word(argumentsPointer, 0);
      byte(7910216, (+runtime.host("a", "a", 141250, 31967, argumentsPointer) | 0) !== 0);
      releaseGuard(7910220);
    }
  }
  function initializeOverride() {
    if (!(u8(7922328) & 1) && acquireGuard(7922328)) {
      putLong(7922320, 0n);
      byte(7922312, 0);
      releaseGuard(7922328);
    }
  }
  /** Original372: retain the first process timestamp and return override or now. */  function readClock(output) {
    const saved = runtime.stackPointer.value, scratch = saved - 64 >>> 0;
    runtime.stackPointer.value = scratch;
    if (!(u8(7910224) & 1) && acquireGuard(7910224)) {
      initializeClockKind(scratch + 48);
      word(scratch + 32, u8(7910216));
      double(7948192, +runtime.host("a", "c", 141314, 32528, scratch + 32));
      byte(7948184, 1);
      releaseGuard(7910224);
    }
    initializeOverride();
    if (u8(7922312)) {
      initializeOverride();
      putLong(output + 8, long(7922320));
      putLong(output, long(7922312));
    } else {
      initializeClockKind(scratch + 16);
      word(scratch, u8(7910216));
      double(output + 8, +runtime.host("a", "c", 141314, 32528, scratch));
      byte(output, 1);
    }
    runtime.stackPointer.value = saved;
  }
  /** Original554: elapsed time since process origin, with +/-infinity sentinels. */  function elapsedFromOrigin(timestamp) {
    const saved = runtime.stackPointer.value, scratch = saved - 32 >>> 0;
    runtime.stackPointer.value = scratch;
    if (!(u8(7910224) & 1) && acquireGuard(7910224)) {
      initializeClockKind(scratch + 16);
      word(scratch, u8(7910216));
      double(7948192, +runtime.host("a", "c", 141314, 32528, scratch));
      byte(7948184, 1);
      releaseGuard(7910224);
    }
    let elapsed = Infinity;
    if (u8(timestamp)) {
      elapsed = -Infinity;
      if (u8(7948184)) elapsed = readDouble(timestamp + 8) - readDouble(7948192);
    }
    runtime.stackPointer.value = saved;
    return elapsed;
  }
  return Object.freeze({
    369: guard => acquireGuard(guard >>> 0),
    370: guard => releaseGuard(guard >>> 0),
    372: output => readClock(output >>> 0),
    554: timestamp => elapsedFromOrigin(timestamp >>> 0)
  });
}
