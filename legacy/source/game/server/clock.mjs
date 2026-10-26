/** Process clock, optional simulation override and C++ static-initializer guards.
 * Complete bodies21/31/32. Scratch writes are retained because native callers
 * share the same stack, including observable partial state when a guard traps.
 */
export const functionIds = Object.freeze([21, 31, 32]);

export function createClockHooks(runtime) {
  let buffer, view;
  function memory(address, size) {
    if (buffer !== runtime.memory.buffer) { buffer = runtime.memory.buffer; view = new DataView(buffer); }
    if (address < 0 || address + size > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = a => memory(a, 1).getUint8(a);
  const u32 = a => memory(a, 4).getUint32(a, true);
  const long = a => memory(a, 8).getBigUint64(a, true);
  const byte = (a, v) => memory(a, 1).setUint8(a, v);
  const word = (a, v) => memory(a, 4).setUint32(a, v, true);
  const putLong = (a, v) => memory(a, 8).setBigUint64(a, v, true);
  const double = (a, v) => memory(a, 8).setFloat64(a, v, true);

  function guardFrame(guard) {
    const saved = runtime.stackPointer.value, outer = (saved - 16) >>> 0;
    runtime.stackPointer.value = outer;
    word(outer + 12, 0); word(outer + 4, guard); word(outer, guard); word(outer + 8, (guard + 1) >>> 0);
    const inner = (outer - 16) >>> 0; runtime.stackPointer.value = inner;
    word(inner + 8, u32(outer + 4));
    return { saved, outer, inner };
  }
  /** Original31: publish a completed static initializer. */
  function releaseGuard(guard) {
    const { saved, outer, inner } = guardFrame(guard);
    byte(u32(inner + 8), 1); byte(u32(outer + 8), 1);
    runtime.stackPointer.value = saved;
  }
  /** Original32: acquire an uninitialized guard, trapping recursive entry. */
  function acquireGuard(guard) {
    const { saved, outer, inner } = guardFrame(guard);
    let acquired = 0;
    if (!u8(u32(inner + 8))) {
      const pending = u32(outer + 8), state = u8(pending);
      if (state !== 1) {
        if (state & 2) throw new WebAssembly.RuntimeError('unreachable');
        byte(pending, 2); acquired = 1;
      }
    }
    runtime.stackPointer.value = saved;
    return acquired;
  }
  function initializeClockKind(argumentsPointer) {
    if (!(u8(8548300) & 1) && acquireGuard(8548300)) {
      word(argumentsPointer, 0);
      byte(8548296, (runtime.host('a', 'b', 22791, 5168, argumentsPointer) | 0) !== 0);
      releaseGuard(8548300);
    }
  }
  function initializeOverride() {
    if (!(u8(8569376) & 1) && acquireGuard(8569376)) {
      putLong(8569368, 0n); byte(8569360, 0); releaseGuard(8569376);
    }
  }
  /** Original21: retain the first process timestamp and return override or now. */
  function readClock(output) {
    const saved = runtime.stackPointer.value, scratch = (saved - 64) >>> 0;
    runtime.stackPointer.value = scratch;
    if (!(u8(8548304) & 1) && acquireGuard(8548304)) {
      initializeClockKind(scratch + 48);
      word(scratch + 32, u8(8548296));
      double(8573016, runtime.host('a', 'a', 22855, 5174, scratch + 32));
      byte(8573008, 1); releaseGuard(8548304);
    }
    initializeOverride();
    if (u8(8569360)) {
      initializeOverride();
      putLong(output + 8, long(8569368));
      putLong(output, long(8569360));
    } else {
      initializeClockKind(scratch + 16);
      word(scratch, u8(8548296));
      double(output + 8, runtime.host('a', 'a', 22855, 5174, scratch));
      byte(output, 1);
    }
    runtime.stackPointer.value = saved;
  }
  return Object.freeze({
    21: output => readClock(output >>> 0),
    31: guard => releaseGuard(guard >>> 0),
    32: guard => acquireGuard(guard >>> 0),
  });
}
