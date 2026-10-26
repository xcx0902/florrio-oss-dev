/** Complete simulation phase helpers recovered from sp_server.wasm.
 * The main func654 is still residual machine code and is deliberately absent
 * from functionIds. No substitute tick or own-original forwarding is provided.
 */
const f32 = Math.fround;
const AREA_SCALES = Object.freeze([
  0x1421f601797cc3 * 2 ** -73,
  0x1421f601797cc3 * 2 ** -73,
  0x1421f5be5d9e41 * 2 ** -73,
  0x1421f644955b46 * 2 ** -73,
  0x1421f5be5d9e41 * 2 ** -73,
  0x1421f5be5d9e41 * 2 ** -73,
  0x1ad7f3061c79b3 * 2 ** -75,
  0x1ad7f3061c79b3 * 2 ** -75,
]);
export const functionIds = Object.freeze([398, 399, 400, 401, 402, 403, 404, 406, 407, 408]);
export const mainSimulationStatus = Object.freeze({ id: 654, complete: false, registered: false });

export function createSimulationHooks(runtime) {
  let buffer, view;
  function access(pointer, size) {
    if (buffer !== runtime.memory.buffer) { buffer = runtime.memory.buffer; view = new DataView(buffer); }
    if ((pointer >>> 0) + size > view.byteLength) throw new WebAssembly.RuntimeError('memory access out of bounds');
    return view;
  }
  const u8 = p => access(p, 1).getUint8(p >>> 0);
  const u32 = p => access(p, 4).getUint32(p >>> 0, true);
  const f = p => access(p, 4).getFloat32(p >>> 0, true);
  const d = p => access(p, 8).getFloat64(p >>> 0, true);
  const byte = (p, v) => access(p, 1).setUint8(p >>> 0, v);
  const uint = (p, v) => access(p, 4).setUint32(p >>> 0, v, true);
  const double = (p, v) => access(p, 8).setFloat64(p >>> 0, v, true);
  const long = (p, v = 0n) => access(p, 8).setBigUint64(p >>> 0, BigInt.asUintN(64, v), true);
  const call = (id, ...args) => runtime.call(id, ...args);
  function frame(size, action) {
    const saved = runtime.stackPointer.value, pointer = (saved - size) | 0;
    runtime.stackPointer.value = pointer;
    const result = action(pointer);
    runtime.stackPointer.value = saved; return result;
  }
  function invalidate(entity) {
    for (const offset of [264876, 264880]) {
      const address = u32(entity) + ((u32(entity + 16) & 16383) << 3) + offset;
      const cached = u32(address); uint(address, 0);
      if (cached) { call(14, u32(cached + 12)); call(14, cached); }
    }
    const world = u32(entity), epoch = u32(world + 2140), index = u32(entity + 16) & 16383;
    uint(world + (index << 2) + 68268, epoch); uint(world + (index << 2) + 133804, epoch);
  }
  function mark(component, componentRevision, entityRevision) {
    const entity = u32(component); if (!entity) return;
    uint(entity + entityRevision, u32(u32(entity) + 2140)); uint(entity + entityRevision + 4, u32(u32(entity) + 2140));
    invalidate(entity); uint(component + componentRevision, u32(u32(u32(component)) + 2140));
  }
  function resetTracking() {
    for (const base of [8551040, 8555152]) { call(14, u32(base + 12)); long(base + 8); long(base); }
  }
  function trackedByte(destination, source, baseOffset, revision, entityRevision) {
    if (u32(source) === u8(destination)) return;
    resetTracking(); byte(8551056, u8(destination)); uint(8551044, 1);
    const incoming = u32(source); byte(destination, incoming); byte(8555168, incoming); uint(8555156, 1);
    if (u8(8551056) !== u8(8555168)) mark(destination - baseOffset, revision, entityRevision);
  }
  function invalidatePosition(position) {
    if (!u8(position + 80)) return;
    byte(position + 80, 0);
    let child = u32(u32(position) + 84);
    while (child) { const next = u32(child + 8); call(34, child); child = next; }
  }
  function releaseMessage(message) {
    if (!message) return;
    const references = u32(message + 4); uint(message + 4, references - 1);
    if (!references) {
      runtime.indirect({ parameters: ['i32'], results: [] }, u32(u32(message) + 8), message);
      call(35, message);
    }
  }

  /** Original398: move a growable vector of intrusive entity handles. */
  function growHandleVector(vector, required) {
    let capacity = u32(vector + 4); capacity = capacity ? capacity << 1 : 341;
    while ((required >>> 0) > (capacity >>> 0)) capacity <<= 1;
    const previous = u32(vector + 8), pointer = call(16, Math.imul(capacity, 12)), count = u32(vector);
    for (let index = 0; index < count; index++) {
      const to = pointer + index * 12, from = previous + index * 12;
      uint(to, 0); uint(to + 8, to); uint(to + 4, to);
      const preceding = u32(from + 4); uint(to, u32(from));
      if (from === preceding) { uint(to + 4, to); uint(to + 8, to); }
      else {
        uint(to + 4, preceding); uint(to + 8, u32(from + 8));
        uint(u32(from + 4) + 8, to); uint(u32(from + 8) + 4, to);
      }
      uint(from, 0); uint(from + 4, from); uint(from + 8, from); uint(u32(from + 8) + 4, from);
    }
    call(14, previous); uint(vector + 8, pointer); uint(vector + 4, capacity);
  }

  /** Original400: fill the eight ordinary population bands to area targets. */
  function replenishPopulation() {
    let area = f(23804) * f(23892);
    const target = value => value >= 0 && value < 4294967296 ? Math.trunc(value) >>> 0 : 0;
    let desired = target(area * AREA_SCALES[0]);
    for (let band = 0; band < 8; band++) {
      const counter = 24864 + (band << 2);
      if (desired > u32(counter)) {
        do { if (!call(113, band)) break; } while (u32(counter) < desired);
        if (band < 7) area = f(23804) * f(23892);
      }
      if (band < 7) desired = target(area * AREA_SCALES[band + 1]);
    }
  }

  /** Original401: recursively enforce centipede-style maximum link distance. */
  function constrainLinkedEntity(entity) {
    frame(32, scratch => {
      const links = u32(entity + 212), position = u32(entity + 168);
      if ((u8(entity + 93) & 64) && u32(entity + 224)) return;
      const predecessor = u32(links + 4);
      if (predecessor) {
        const physics = u32(entity + 188), previousPhysics = u32(predecessor + 188);
        let distance = physics ? f32(f(physics + 8) + f32(0.0001)) : f32(0.0001);
        if (previousPhysics) distance = f32(distance + f(previousPhysics + 8));
        const target = u32(predecessor + 168); if (!u8(target + 80)) call(17, target);
        let dy = d(target + 96), dx = d(target + 88), uncached = false;
        if (!u8(position + 80)) { call(17, position); uncached = !u8(position + 80); }
        dy -= d(position + 96); dx -= d(position + 88);
        const angle = f32(call(164, dy, dx));
        if (!uncached) invalidatePosition(position);
        long(scratch + 8, 4618760256179416344n); double(scratch, angle);
        double(scratch + 24, runtime.host('a', 'a', 22903, 6924, scratch)); call(94, position + 8, scratch + 24);
        let length = dx * dx + dy * dy;
        if (length > distance * distance) {
          length = Math.sqrt(length);
          if (length < 2 ** -52) { dx = 1; dy = 0; }
          else { dx /= length; dy /= length; }
          if (!u8(target + 80)) call(17, target);
          const x = d(target + 88) - dx * distance, y = d(target + 96) - dy * distance;
          double(scratch + 16, y); double(scratch + 24, x);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            invalidatePosition(position); call(44, position + 20, scratch + 24); call(47, position + 16, scratch + 16);
          }
        }
      }
      const count = u32(links + 16);
      let pointer = u32(links + 24) || links + 28;
      const end = pointer + count * 12;
      while (pointer !== end) { const child = u32(pointer); if (child) constrainLinkedEntity(child); pointer += 12; }
    });
  }

  /** Original403: mark the global arena-count component's changed field. */
  function markArenaCount() { mark(23240, 16, 312); }

  function detachListNode(entity, offset) {
    const list = u32(entity + offset); if (!list) return;
    uint(list, u32(list) - 1);
    let next = u32(entity + offset + 8); const previous = u32(entity + offset + 4);
    if (previous) { uint(previous + 8, next); next = u32(entity + offset + 8); }
    else uint(list + 4, next);
    uint(next ? next + 4 : list + 8, previous); uint(entity + offset + 8, 0); long(entity + offset);
  }
  function trackedParentClear(entity) {
    const handle = entity + 224;
    if (!(u8(entity + 93) & 64) || !u32(handle)) return;
    resetTracking(); call(105, handle, 8551040);
    if (u32(handle)) {
      const previous = u32(entity + 228); uint(previous + 8, u32(entity + 232)); uint(u32(entity + 232) + 4, previous);
      uint(entity + 232, handle); uint(entity + 228, handle); uint(entity + 224, 0);
    }
    call(105, handle, 8555152);
    const count = u32(8551044);
    if (count !== u32(8555156) || (count && call(57, u32(8551052) || 8551056, u32(8555164) || 8555168, count))) mark(entity + 216, 32, 368);
  }

  /** Original404: remove an entity tree, then return its slot to the world. */
  function removeEntity(entity) {
    frame(16, scratch => {
      if (!entity || u32(entity + 20) === 25076) return;
      const links = u32(entity + 212); if (links) call(424, links);
      const species = u32(entity + 148);
      if (species && u8(species + 16) <= 7) {
        const counter = 24864 + (u8(species + 16) << 2); uint(counter, u32(counter) - 1);
      }
      const physics = u32(entity + 188), node = physics ? u32(physics + 36) : 0;
      if (node) {
        const list = u32(node + 32), count = u32(node + 24), end = list + (count << 2);
        let pointer = list; while (pointer !== end && u32(pointer) !== physics) pointer += 4;
        if (pointer !== end) {
          const old = u32(pointer), last = end - 4; uint(pointer, u32(last)); uint(last, old); uint(node + 24, count - 1); uint(physics + 36, 0);
        }
      }
      while (u32(entity + 84)) removeEntity(u32(entity + 84) - 56);
      const owner = (u8(entity + 93) & 64) ? u32(entity + 236) : 0;
      let child = u32(entity + 72);
      while (child) { const next = u32(child + 8); call(73, child - 44, owner); child = next; }
      uint(scratch + 12, 0); detachListNode(entity, 44);
      if (u8(entity + 93) & 64) call(170, entity + 236, scratch + 12);
      detachListNode(entity, 56); trackedParentClear(entity);
      const oldId = u32(entity + 16), slot = call(410, entity), removalNode = entity + 20;
      uint(slot + 12, slot + 4); uint(slot + 8, slot + 4); uint(slot + 4, slot);
      call(29, slot + 256, 0, 240); const cleared = call(29, entity + 20, 0, 77); call(29, slot + 100, 0, 116);
      uint(slot, 22928); uint(entity + 16, oldId > 0xffffbfff ? (oldId & 16383) | 16384 : oldId + 16384);
      uint(25076, u32(25076) + 1); const head = u32(25080), previous = u32(25084);
      uint(cleared, 25076); uint(slot + 28, 0); uint(slot + 24, previous);
      if (!head) uint(25080, removalNode); if (previous) uint(previous + 8, removalNode); uint(25084, removalNode);
    });
  }

  /** Original406: stable erase of reference-counted pending message entries. */
  function eraseMessages(vector, begin, end) {
    const pointer = u32(vector + 8), count = u32(vector), finish = pointer + (count << 4);
    if (begin === pointer && end === finish) {
      if (count) for (let current = begin; current !== end; current += 16) releaseMessage(u32(current + 8));
      call(14, count ? u32(vector + 8) : begin); long(vector); uint(vector + 8, 0); return;
    }
    const bytes = (end - begin) | 0;
    if (begin !== end && finish !== end) {
      const moved = (finish - end) >>> 4;
      for (let index = 0; index < moved; index++) {
        const to = begin + (index << 4), from = end + (index << 4);
        uint(to, u32(from)); const message = u32(from + 8), control = u32(from + 4); long(from + 4);
        uint(to + 4, control); const previous = u32(to + 8); uint(to + 8, message); releaseMessage(previous); byte(to + 12, u8(from + 12));
      }
    }
    const removed = bytes >>> 4;
    if (bytes) for (let current = finish - (removed << 4); current !== finish; current += 16) releaseMessage(u32(current + 8));
    uint(vector, u32(vector) - removed);
  }

  /** Original407: obtain a replicated string field and mark its slot dirty. */
  function changedStringSlot(accessor) {
    const field = u32(accessor), index = u32(accessor + 4), component = field - 40, entity = u32(component);
    if (entity) {
      uint(entity + 464, u32(u32(entity) + 2140)); uint(entity + 468, u32(u32(entity) + 2140)); invalidate(entity);
      const epoch = u32(u32(u32(component)) + 2140); uint(field + 72, epoch); uint(field + ((index + 3) << 2), epoch);
    }
    return (field + Math.imul(index, 12)) | 0;
  }

  /** Original408: signed elapsed time relative to the process clock origin. */
  function elapsedFromOrigin(clock) {
    return frame(32, scratch => {
      if (!(u8(8548304) & 1) && call(32, 8548304)) {
        if (!(u8(8548300) & 1) && call(32, 8548300)) {
          uint(scratch + 16, 0); byte(8548296, runtime.host('a', 'b', 22791, 5168, scratch + 16) !== 0); call(31, 8548300);
        }
        uint(scratch, u8(8548296)); double(8573016, runtime.host('a', 'a', 22855, 5174, scratch)); byte(8573008, 1); call(31, 8548304);
      }
      if (!u8(clock)) return Infinity;
      if (!u8(8573008)) return -Infinity;
      return d(clock + 8) - d(8573016);
    });
  }
  return Object.freeze({ 398: growHandleVector, 399: (to, from) => trackedByte(to, from, 8, 12, 264),
    400: replenishPopulation, 401: constrainLinkedEntity, 402: (to, from) => trackedByte(to, from, 9, 16, 256),
    403: markArenaCount, 404: removeEntity, 406: eraseMessages, 407: changedStringSlot, 408: elapsedFromOrigin });
}
