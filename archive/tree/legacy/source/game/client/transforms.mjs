/** Client position interpolation, parent transforms and aggregate visual bounds.
 * Complete original bodies409/672/705. Unnamed shared fields retain ABI offsets.
 * The independent clock, floating remainder and libm remain explicit services.
 */
export const functionIds = Object.freeze([ 409, 672, 705 ]);

const f32 = Math.fround;

const add = (a, b) => a + b >>> 0;

// Exact WAT 0x1.1111111111111p-7, the 120-millisecond interpolation window.
const INTERPOLATION_RATE = 1 / 120;
export function createClientTransformHooks(runtime) {
  let buffer, view;
  function memory(address, size) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if (address < 0 || address + size > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return view;
  }
  const byte = a => memory(a, 1).getUint8(a);
  const uint = a => memory(a, 4).getUint32(a, true);
  const float = a => memory(a, 4).getFloat32(a, true);
  const double = a => memory(a, 8).getFloat64(a, true);
  const putByte = (a, value) => memory(a, 1).setUint8(a, value);
  const putFloat = (a, value) => memory(a, 4).setFloat32(a, value, true);
  const putDouble = (a, value) => memory(a, 8).setFloat64(a, value, true);
  const putLong = (a, value) => memory(a, 8).setBigUint64(a, value, true);
  function interpolationFraction(clock, valid, timestamp) {
    let elapsed = Infinity;
    if (byte(clock)) {
      elapsed = -Infinity;
      if (byte(valid)) elapsed = (double(clock + 8) - double(timestamp)) * INTERPOLATION_RATE;
    }
    return Math.min(Math.max(elapsed, 0), 1);
  }
  function interpolateFloat(clock, current, previous, valid, timestamp) {
    const fraction = interpolationFraction(clock, valid, timestamp);
    const next = float(current), before = float(previous);
    return f32(fraction * f32(next - before) + before);
  }
  /** Preserve the ordered comparisons, including signed zero and NaN cases. */
  function clampPlayerCoordinate(coordinate, halfExtent, radius, displacement) {
    let lower = f32(halfExtent - radius), upper = f32(radius - halfExtent);
    do {
      const previous = lower;
      lower = upper;
      upper = previous;
    } while (lower > upper);
    const shifted = f32(coordinate + displacement);
    return lower > shifted ? lower : upper < shifted ? upper : shifted;
  }
  /** Original409: interpolate local position, constrain the player and compose its parent. */
  function updateWorldTransform(transform) {
    const savedStack = runtime.stackPointer.value, scratch = add(savedStack, -16);
    runtime.stackPointer.value = scratch;
    putByte(transform + 144, 1);
    let entity = uint(transform), parentX = 0, parentY = 0, parentAngle = 0;
    if (byte(entity + 46) & 64) {
      const parent = uint(entity + 176);
      if (parent) {
        const parentTransform = uint(parent + 120);
        if (!byte(parentTransform + 144)) updateWorldTransform(parentTransform);
        parentAngle = double(parentTransform + 168);
        parentX = double(parentTransform + 152);
        parentY = double(parentTransform + 160);
      }
    }
    let localX;
    if (!byte(transform + 72)) localX = float(transform + 64); else {
      runtime.call(372, scratch);
      localX = interpolateFloat(scratch, transform + 64, transform + 68, transform + 72, transform + 80);
    }
    entity = uint(transform);
    let state = uint(entity), player = uint(uint(uint(state + 264)) + 144);
    if (entity === player) {
      const halfWidth = f32(float(state + 900) * .5);
      const radius = float(uint(entity + 140) + 8);
      localX = clampPlayerCoordinate(localX, halfWidth, radius, float(add(state, 2048)));
    }
    let localY;
    if (!byte(transform + 48)) localY = float(transform + 40); else {
      runtime.call(372, scratch);
      // The native body reloads these references after the host clock call.
      entity = uint(transform);
      state = uint(entity);
      player = uint(uint(uint(state + 264)) + 144);
      localY = interpolateFloat(scratch, transform + 40, transform + 44, transform + 48, transform + 56);
    }
    if (entity === player) {
      const halfHeight = f32(float(state + 988) * .5);
      const radius = float(uint(player + 140) + 8);
      localY = clampPlayerCoordinate(localY, halfHeight, radius, float(add(state, 2052)));
    }
    let worldX = localX, rotatedY = localY;
    // The decompiler prints zero; the exact original threshold is 2^-52.
    if (Math.abs(parentAngle) >= 2 ** -52) {
      const cosine = runtime.call(403, parentAngle), sine = runtime.call(407, parentAngle);
      rotatedY = sine * worldX + cosine * localY;
      worldX = cosine * worldX - sine * localY;
    }
    putDouble(transform + 160, parentY + rotatedY);
    putDouble(transform + 152, parentX + worldX);
    const angle = f32(interpolateAngle(add(transform, 8)));
    putDouble(transform + 168, uint(transform + 176) & 1 ? angle : parentAngle + angle);
    runtime.stackPointer.value = savedStack;
  }
  function entityHash(entity) {
    let hash = Math.imul(entity, 1540483477);
    hash = Math.imul(hash >>> 24 ^ hash, 1540483477) ^ 1866966612;
    hash = Math.imul(hash >>> 13 ^ hash, 1540483477);
    return (hash >>> 15 ^ hash) >>> 0;
  }
  function popcount(value) {
    value -= value >>> 1 & 1431655765;
    value = (value & 858993459) + (value >>> 2 & 858993459);
    return Math.imul(value + (value >>> 4) & 252645135, 16843009) >>> 24;
  }
  /** Find the first equal owner in the original intrusive unordered multimap. */
  function findOwnedEntityRange(state, entity, count) {
    const hash = entityHash(entity), powerOfTwo = popcount(count) <= 1;
    const bucket = powerOfTwo ? (hash & count - 1) >>> 0 : hash < count ? hash : hash % count;
    let node = uint(add(uint(add(state, 2220)), bucket << 2));
    if (!node) return [ 0, 0 ];
    node = uint(node);
    if (!node) return [ 0, 0 ];
    while (node) {
      const storedHash = uint(node + 4);
      if (storedHash !== hash) {
        const storedBucket = powerOfTwo ? (storedHash & count - 1) >>> 0 : count <= storedHash ? storedHash % count : storedHash;
        if (storedBucket !== bucket) return [ 0, 0 ];
      } else if (uint(node + 8) === entity) break;
      node = uint(node);
    }
    if (!node) return [ 0, 0 ];
    let end = node;
    do {
      end = uint(end);
      if (!end) break;
    } while (uint(end + 8) === entity);
    return [ node, end ];
  }
  function includeChildBounds(bounds, child) {
    const childWidth = float(child + 8), childHeight = float(child + 12), childX = float(child);
    const childY = float(child + 4), oldY = float(bounds + 44);
    const lowerY = childY < oldY ? childY : oldY;
    putFloat(bounds + 44, lowerY);
    const oldX = float(bounds + 40), lowerX = childX < oldX ? childX : oldX;
    putFloat(bounds + 40, lowerX);
    const childBottom = f32(childY + childHeight), oldBottom = f32(oldY + float(bounds + 52));
    putFloat(bounds + 52, f32((childBottom > oldBottom ? childBottom : oldBottom) - lowerY));
    const childRight = f32(childX + childWidth), oldRight = f32(oldX + float(bounds + 48));
    putFloat(bounds + 48, f32((childRight > oldRight ? childRight : oldRight) - lowerX));
  }
  /** Original672: cache this collider's interpolated AABB and include its owned children. */
  function updateVisualBounds(bounds) {
    const savedStack = runtime.stackPointer.value, scratch = add(savedStack, -16);
    runtime.stackPointer.value = scratch;
    if (!byte(bounds + 36)) {
      putByte(bounds + 36, 1);
      const transform = uint(uint(bounds) + 120);
      let radius;
      if (!byte(bounds + 16)) radius = float(bounds + 8); else {
        runtime.call(372, scratch);
        radius = interpolateFloat(scratch, bounds + 8, bounds + 12, bounds + 16, bounds + 24);
      }
      if (!byte(transform + 144)) updateWorldTransform(transform);
      const x = double(transform + 152), y = double(transform + 160), diameter = f32(radius + radius);
      putFloat(bounds + 52, diameter);
      putFloat(bounds + 48, diameter);
      putFloat(bounds + 44, f32(f32(y) - radius));
      putFloat(bounds + 40, f32(f32(x) - radius));
      const entity = uint(bounds), state = uint(entity), count = uint(add(state, 2224));
      if (count) {
        let [node, end] = findOwnedEntityRange(state, entity, count);
        while (node !== end) {
          const child = uint(uint(node + 12) + 140);
          if (child) includeChildBounds(bounds, updateVisualBounds(child));
          node = uint(node);
        }
      }
    }
    runtime.stackPointer.value = savedStack;
    return add(bounds, 40);
  }
  function normalizeAngle(value) {
    const lowerAdjusted = value < -Math.PI ? value + 2 * Math.PI : value;
    return lowerAdjusted > Math.PI ? lowerAdjusted - 2 * Math.PI : lowerAdjusted;
  }
  /** Original705: interpolate across the nearest equivalent angular winding. */
  function interpolateAngle(angle) {
    const savedStack = runtime.stackPointer.value, scratch = add(savedStack, -48);
    runtime.stackPointer.value = scratch;
    let result;
    if (!byte(angle + 16)) result = double(angle); else {
      runtime.call(372, scratch + 32);
      let fraction = Infinity;
      if (byte(scratch + 32)) {
        fraction = -Infinity;
        if (byte(angle + 16)) fraction = (double(scratch + 40) - double(angle + 24)) * INTERPOLATION_RATE;
      }
      const current = double(angle), previous = double(angle + 8);
      putLong(scratch + 24, 4618760256179416344n);
      putDouble(scratch + 16, previous);
      const previousRemainder = +runtime.host("a", "c", 150328, 33144, scratch + 16);
      putLong(scratch + 8, 4618760256179416344n);
      putDouble(scratch, current);
      const nonnegativeFraction = Math.max(fraction, 0);
      let from = normalizeAngle(previousRemainder), candidate = from + 2 * Math.PI;
      const nextRemainder = +runtime.host("a", "c", 150328, 33144, scratch);
      const to = normalizeAngle(nextRemainder);
      let distance = Math.abs(from - to);
      if (Math.abs(candidate - to) < distance) {
        do {
          const candidateDistance = candidate - to;
          from = candidate;
          candidate += 2 * Math.PI;
          distance = Math.abs(candidateDistance);
        } while (distance > Math.abs(candidate - to));
      }
      candidate = from - 2 * Math.PI;
      if (distance > Math.abs(candidate - to)) {
        do {
          from = candidate;
          candidate -= 2 * Math.PI;
        } while (Math.abs(candidate - to) < Math.abs(from - to));
      }
      result = from + Math.min(nonnegativeFraction, 1) * (to - from);
    }
    runtime.stackPointer.value = savedStack;
    return result;
  }
  return Object.freeze({
    409: transform => updateWorldTransform(transform >>> 0),
    672: bounds => updateVisualBounds(bounds >>> 0),
    705: angle => interpolateAngle(angle >>> 0)
  });
}
