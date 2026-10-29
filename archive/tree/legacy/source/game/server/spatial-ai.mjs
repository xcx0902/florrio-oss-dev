/** Quadtree AI queries: alert nearby creatures, choose a target, find a pickup
 * recipient. Original functions196/197/198; exact f32 rectangle arithmetic and
 * quadrant traversal order are part of the shared simulation ABI.
 */
export const functionIds = Object.freeze([ 196, 197, 198 ]);

export function createSpatialAiHooks(runtime) {
  let buffer, view;
  function memory(a, width) {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    if (a < 0 || a + width > view.byteLength) throw new WebAssembly.RuntimeError("memory access out of bounds");
    return view;
  }
  const u8 = a => memory(a, 1).getUint8(a), u32 = a => memory(a, 4).getUint32(a, true);
  const float = a => memory(a, 4).getFloat32(a, true), double = a => memory(a, 8).getFloat64(a, true);
  const byte = (a, v) => memory(a, 1).setUint8(a, v), word = (a, v) => memory(a, 4).setUint32(a, v, true);
  const short = (a, v) => memory(a, 2).setUint16(a, v, true), putDouble = (a, v) => memory(a, 8).setFloat64(a, v, true);
  const f32 = Math.fround, add = (a, b) => a + b >>> 0, call = (id, ...args) => runtime.call(id, ...args);
  function overlaps(rect, body) {
    const x = float(rect), left = float(body + 20);
    if (x > f32(left + float(body + 28)) || f32(x + float(rect + 8)) < left) return false;
    const y = float(rect + 4), top = float(body + 24);
    return !(y > f32(top + float(body + 32)) || f32(y + float(rect + 12)) < top);
  }
  const centerX = node => f32(float(node + 8) + f32(float(node + 16) * .5));
  const centerY = node => f32(float(node + 12) + f32(float(node + 20) * .5))
  /** The last quadrant is a tail jump in WASM. Retain that distinction so the
   * other two query bodies use exactly the same scratch stack addresses.
   */;
  function walk(node, rect, context, visit, recurse) {
    for (;;) {
      const count = u32(node + 24);
      if (count) {
        let item = u32(node + 32), end = add(item, count << 2);
        do {
          const body = u32(item);
          if (overlaps(rect, body)) visit(body);
          item = add(item, 4);
        } while (item !== end);
      }
      if (!u32(node + 36)) return;
      if (float(rect) < centerX(node)) {
        let y = float(rect + 4), mid = centerY(node);
        if (y < mid) {
          recurse(u32(node + 36), rect, context);
          y = float(rect + 4);
          mid = centerY(node);
        }
        if (mid <= f32(y + float(rect + 12))) recurse(add(u32(node + 36), 80), rect, context);
      }
      if (!(f32(float(rect) + float(rect + 8)) >= centerX(node))) return;
      let y = float(rect + 4), mid = centerY(node);
      if (y < mid) {
        recurse(add(u32(node + 36), 40), rect, context);
        y = float(rect + 4);
        mid = centerY(node);
      }
      if (!(mid <= f32(y + float(rect + 12)))) return;
      node = add(u32(node + 36), 120);
    }
  }
  function replaceAggroHandle(ai, target) {
    const previous = u32(ai + 156);
    word(previous + 8, u32(ai + 160));
    word(u32(ai + 160) + 4, previous);
    const handle = ai + 152;
    word(ai + 160, handle);
    word(ai + 152, 0);
    if (!target) {
      word(handle, 0);
      word(ai + 156, handle);
      word(ai + 160, handle);
      return;
    }
    word(handle, u32(target + 4));
    const tail = u32(target + 12);
    word(ai + 160, tail);
    word(tail + 4, handle);
    word(ai + 156, target + 4);
    word(target + 12, handle);
  }
  /** Original196: nearby eligible untargeted AI acquire the supplied attacker. */  function alertNearby(node, rect, context) {
    walk(node, rect, context, (body => {
      const ai = u32(u32(body) + 104);
      if (!ai || u32(ai + 152)) return;
      const target = u32(u32(context));
      if (!u8(ai + 108) && !u8(ai + 109)) return;
      if (!call(168, ai, target) || u32(ai + 152) === target) return;
      replaceAggroHandle(ai, target);
    }), alertNearby);
  }
  /** Original197: nearest eligible actor with original category priorities. */  function findTarget(node, rect, context) {
    const saved = runtime.stackPointer.value, scratch = saved - 16 >>> 0;
    runtime.stackPointer.value = scratch;
    walk(node, rect, context, (body => {
      const entity = u32(body), position = u32(entity + 168);
      if (!position) return;
      const ai = u32(context + 8);
      if (!u8(position + 80)) call(17, position);
      if (double(position + 88) < float(u32(context))) return;
      if (u8(entity + 93) & 64 && u32(entity + 224)) return;
      if (!(u8(entity + 95) & 32) && !(u8(entity + 92) & 2)) return;
      const health = u32(entity + 164);
      if (health && !(float(health + 8) > 0)) return;
      const loadout = u32(entity + 200);
      if (loadout && u8(loadout + 728)) {
        call(21, scratch);
        const active = u8(loadout + 728);
        if (u8(scratch)) {
          if (active && double(scratch + 8) < double(loadout + 736)) return;
        } else if (active) return;
      }
      const sourcePosition = u32(u32(context + 4));
      if (!u8(sourcePosition + 80)) call(17, sourcePosition);
      const sourceY = double(sourcePosition + 96), sourceX = double(sourcePosition + 88);
      if (!u8(position + 80)) call(17, position);
      const dx = sourceX - double(position + 88), dy = sourceY - double(position + 96), distance = dx * dx + dy * dy, radius = float(ai + 120);
      if (!(distance < radius * radius)) return;
      const current = u32(u32(u32(context + 12)));
      let prefer = false;
      if (current) {
        if (u8(entity + 95) & 32 && !(u8(current + 95) & 32)) prefer = true; else if (u8(entity + 92) & 2) {
          if (!(u8(current + 92) & 2)) prefer = true; else if (u8(u32(entity + 104) + 108) && !u8(u32(current + 104) + 108)) prefer = true;
        }
        if (!prefer && u32(u32(context + 16)) && !(distance < double(u32(context + 20)))) return;
      }
      if (!call(168, ai, entity)) return;
      word(u32(context + 16), entity);
      putDouble(u32(context + 20), distance);
    }), findTarget);
    runtime.stackPointer.value = saved;
  }
  /** Original198: closest live player with an open carried-petal slot. */  function findPickupRecipient(node, rect, context) {
    const saved = runtime.stackPointer.value, scratch = saved - 16 >>> 0;
    runtime.stackPointer.value = scratch;
    walk(node, rect, context, (body => {
      const entity = u32(body), health = u32(entity + 164), position = u32(entity + 168), loadout = u32(entity + 200);
      word(scratch + 8, 0);
      byte(scratch + 12, 0);
      short(scratch + 10, 8216);
      word(scratch, u32(entity + 92));
      byte(scratch + 4, u8(entity + 96));
      short(scratch, 0);
      byte(scratch + 4, 0);
      byte(scratch + 2, u8(scratch + 2) & 24);
      byte(scratch + 3, u8(scratch + 3) & 32);
      if (call(57, scratch, scratch + 8, 5)) return;
      const level = u8(loadout + 148), capacity = level < 15 ? 13 : level < 30 ? 14 : level < 45 ? 15 : 16;
      let open = false;
      for (let slot = 0; slot < capacity; slot++) if (!u8(loadout + 20 + slot)) {
        open = true;
        break;
      }
      if (!open || float(health + 8) <= 0) return;
      const sourcePosition = u32(u32(context));
      if (!u8(sourcePosition + 80)) call(17, sourcePosition);
      const sourceY = double(sourcePosition + 96), sourceX = double(sourcePosition + 88);
      if (!u8(position + 80)) call(17, position);
      const dx = sourceX - double(position + 88), dy = sourceY - double(position + 96), distance = dx * dx + dy * dy;
      if (!(distance < 4900)) return;
      const result = u32(context + 4), best = u32(context + 8);
      if (u32(result) && !(distance < double(best))) return;
      putDouble(best, distance);
      word(result, loadout);
    }), findPickupRecipient);
    runtime.stackPointer.value = saved;
  }
  return Object.freeze({
    196: (a, b, c) => alertNearby(a >>> 0, b >>> 0, c >>> 0),
    197: (a, b, c) => findTarget(a >>> 0, b >>> 0, c >>> 0),
    198: (a, b, c) => findPickupRecipient(a >>> 0, b >>> 0, c >>> 0)
  });
}
