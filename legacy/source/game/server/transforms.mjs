/** Shared transform/cache and replicated coordinate services.
 * Bodies are recovered from original server functions 17, 34, 44, 47 and 94.
 * The shared linear-memory ABI lets the remaining simulation call these
 * services directly. Field names follow observed parent/position data flow.
 */
export const functionIds = Object.freeze([17, 34, 44, 47, 94]);

export function createTransformHooks(runtime) {
  let buffer, view;
  function memory(address, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer; view = new DataView(buffer);
    }
    if (address < 0 || address + size > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = a => memory(a, 1).getUint8(a);
  const u32 = a => memory(a, 4).getUint32(a, true);
  const f32 = a => memory(a, 4).getFloat32(a, true);
  const f64 = a => memory(a, 8).getFloat64(a, true);
  const byte = (a, v) => memory(a, 1).setUint8(a, v);
  const word = (a, v) => memory(a, 4).setUint32(a, v, true);
  const short = (a, v) => memory(a, 2).setUint16(a, v, true);
  const double = (a, v) => memory(a, 8).setFloat64(a, v, true);
  const long = (a, v) => memory(a, 8).setBigUint64(a, v, true);
  const call = (id, ...args) => runtime.call(id, ...args);

  /** Compute a cached world transform, recursively updating the parent first. */
  function updateWorldTransform(transform) {
    byte(transform + 80, 1);
    const entity = u32(transform);
    let parentX = 0, parentY = 0, parentAngle = 0;
    if (u8(entity + 93) & 64) {
      const parent = u32(entity + 224);
      if (parent) {
        const parentTransform = u32(parent + 168);
        if (!u8(parentTransform + 80)) updateWorldTransform(parentTransform);
        parentAngle = f64(parentTransform + 104);
        parentX = f64(parentTransform + 88);
        parentY = f64(parentTransform + 96);
      }
    }
    const localY = f32(transform + 16);
    let localX = f32(transform + 20), rotatedY = localY;
    // WABT's pseudocode displays this small threshold as 0.0; WAT is 2^-52.
    // The ordered comparison also deliberately skips rotation for NaN angles.
    if (Math.abs(parentAngle) >= 2 ** -52) {
      const cosine = call(169, parentAngle), sine = call(149, parentAngle);
      rotatedY = sine * localX + cosine * localY;
      localX = cosine * localX - sine * localY;
    }
    double(transform + 96, parentY + rotatedY);
    double(transform + 88, parentX + localX);
    const angle = Math.fround(f64(transform + 8));
    double(transform + 104, u32(transform + 112) & 1 ? angle : parentAngle + angle);
  }

  /** Original child-list callback: invalidate its component and descendants. */
  function invalidateDescendant(node) {
    const transform = u32(node + 112);
    if (!transform || !u8(transform + 80)) return;
    byte(transform + 80, 0);
    let child = u32(u32(transform) + 84);
    while (child) {
      const next = u32(child + 8);
      invalidateDescendant(child);
      child = next;
    }
  }

  function invalidateSerializedEntity(entity) {
    for (const offset of [264876, 264880]) {
      const address = ((u32(entity) + ((u32(entity + 16) & 16383) << 3)) >>> 0) + offset;
      const packet = u32(address); word(address, 0);
      if (packet) { call(14, u32(packet + 12)); call(14, packet); }
    }
    const world = u32(entity), index = u32(entity + 16) & 16383, revision = u32(world + 2140);
    word(((world + (index << 2)) >>> 0) + 68268, revision);
    word(((world + (index << 2)) >>> 0) + 133804, revision);
  }

  /** Write one local coordinate, retaining the shared old/new field buffers.
   * Inputs are doubles; the component stores floats. Revisions change only
   * when the serialized float bits differ, even if the initial values compare
   * unequal before the double-to-float conversion.
   */
  function setLocalCoordinate(destination, source, componentOffset, revisionOffset) {
    if (f64(source) === f32(destination)) return;
    for (const base of [8551040, 8555152]) {
      call(14, u32(base + 12));
      long(base + 8, 0n); long(base, 0n);
    }
    word(8551056, u32(destination)); word(8551044, 4);
    memory(destination, 4).setFloat32(destination, f64(source), true);
    word(8555168, u32(destination)); word(8555156, 4);
    if (u32(8551056) === u32(8555168)) return;
    const component = (destination - componentOffset) >>> 0, entity = u32(component);
    if (!entity) return;
    const world = u32(entity);
    word(entity + 416, u32(world + 2140));
    word(entity + 420, u32(world + 2140));
    invalidateSerializedEntity(entity);
    word(component + revisionOffset, u32(u32(u32(component)) + 2140));
  }

  function appendAngleWord(base, value) {
    if (u32(base)) word(base, 0);
    let pointer = u32(base + 12), capacity = pointer ? u32(base + 8) : 4096;
    const count = u32(base + 4), needed = (count + 2) >>> 0;
    if (capacity < needed) {
      do { capacity = (capacity << 1) >>> 0; } while (capacity < needed);
      const previous = pointer || base + 16;
      pointer = call(16, capacity) >>> 0;
      const copied = call(15, pointer, previous, count);
      if (previous !== base + 16) call(14, previous);
      word(base + 12, copied); word(base + 8, capacity);
    }
    short(((pointer || base + 16) + count) >>> 0, value);
    word(base + 4, needed);
    return needed;
  }
  function anglePacketsMatch(length) {
    if (u32(8551044) !== length) return false;
    const before = u32(8551052) || 8551056, after = u32(8555164) || 8555168;
    for (let i = 0; i < length; i++) if (u8((before + i) >>> 0) !== u8((after + i) >>> 0)) return false;
    return true;
  }
  function encodedAngle(angle, argumentsPointer) {
    // The host bridge is the original floating remainder operation. Retaining
    // it also retains observable host calls and their exact stack arguments.
    double(argumentsPointer, angle);
    const remainder = runtime.host('a', 'a', 22903, 6924, argumentsPointer);
    const positive = remainder < 0 ? remainder + 2 * Math.PI : remainder;
    // Exact shipped f64 0x1.45f1c0e995ab9p+13 (65535 / tau).
    const scaled = positive * (0x145f1c0e995ab9 * 2 ** -39);
    return scaled < 4294967296 && scaled >= 0 ? Math.trunc(scaled) >>> 0 : 0;
  }
  /** Original func94: full-precision local angle, quantized u16 replication. */
  function setLocalAngle(destination, source) {
    const savedStack = runtime.stackPointer.value, scratch = (savedStack - 32) >>> 0;
    runtime.stackPointer.value = scratch;
    if (f64(destination) !== f64(source)) {
      for (const base of [8551040, 8555152]) {
        call(14, u32(base + 12)); long(base + 8, 0n); long(base, 0n);
      }
      const previous = f64(destination);
      long(scratch + 24, 4618760256179416344n);
      appendAngleWord(8551040, encodedAngle(previous, scratch + 16));
      const next = f64(source); double(destination, next);
      long(scratch + 8, 4618760256179416344n);
      const length = appendAngleWord(8555152, encodedAngle(next, scratch));
      if (!anglePacketsMatch(length)) {
        const component = (destination - 8) >>> 0, entity = u32(component);
        if (entity) {
          const world = u32(entity);
          word(entity + 416, u32(world + 2140)); word(entity + 420, u32(world + 2140));
          invalidateSerializedEntity(entity);
          word(component + 24, u32(u32(u32(component)) + 2140));
        }
      }
    }
    runtime.stackPointer.value = savedStack;
  }

  return Object.freeze({
    17: transform => updateWorldTransform(transform >>> 0),
    34: node => invalidateDescendant(node >>> 0),
    44: (destination, source) => setLocalCoordinate(destination >>> 0, source >>> 0, 20, 32),
    47: (destination, source) => setLocalCoordinate(destination >>> 0, source >>> 0, 16, 28),
    94: (destination, source) => setLocalAngle(destination >>> 0, source >>> 0),
  });
}
