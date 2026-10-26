/** Executable, instruction-grounded server family, collision and combat helpers.
 * Unknown AI fields stay offset-qualified. See combat-map.json for dependencies.
 */
const f32 = Math.fround;
// Exact shipped f32 0x1.9999ap-34. Its low bits differ from f32(0.2 / 2^31),
// enough to alter some ants' turn speeds and subsequent simulation state.
const ANT_RANDOM_TURN_SCALE = (0x19999a / 0x100000) * 2 ** -34;
export const functionIds = Object.freeze([18, 25, 26, 165, 167, 168, 205, 208, 210, 280, 426]);

export function createCombatHooks(runtime) {
  const view = () => new DataView(runtime.memory.buffer);
  const byte = address => view().getUint8(address >>> 0);
  const uint = address => view().getUint32(address >>> 0, true);
  const float = address => view().getFloat32(address >>> 0, true);
  const double = address => view().getFloat64(address >>> 0, true);
  const putByte = (address, value) => view().setUint8(address >>> 0, value);
  const putUint = (address, value) => view().setUint32(address >>> 0, value, true);
  const putFloat = (address, value) => view().setFloat32(address >>> 0, value, true);
  const putDouble = (address, value) => view().setFloat64(address >>> 0, value, true);
  const putLong = (address, value) => view().setBigUint64(address >>> 0, BigInt.asUintN(64, value), true);
  const call = (id, ...args) => runtime.call(id, ...args);
  function withStack(size, action) {
    const saved = runtime.stackPointer.value, frame = (saved - size) | 0;
    runtime.stackPointer.value = frame;
    const result = action(frame);
    runtime.stackPointer.value = saved;
    return result;
  }
  function random() {
    const state = uint(8573024), quotient = Math.floor(state / 44488);
    const first = Math.imul((state + Math.imul(quotient, -44488)) | 0, 48271) >>> 0;
    const second = Math.imul(quotient, 3399) >>> 0;
    const next = ((first < second ? 2147483647 : 0) + first - second) >>> 0;
    putUint(8573024, next); return next;
  }
  function invalidate(entity) {
    for (const offset of [264876, 264880]) {
      const address = (uint(entity) + ((uint(entity + 16) & 16383) << 3) + offset) | 0;
      const cached = uint(address); putUint(address, 0);
      if (cached) { call(14, uint(cached + 12)); call(14, cached); }
    }
    const world = uint(entity), index = uint(entity + 16) & 16383, epoch = uint(world + 2140);
    putUint(world + (index << 2) + 68268, epoch);
    putUint(world + (index << 2) + 133804, epoch);
  }
  function markComponent(component, componentRevision, entityRevision) {
    const entity = uint(component);
    if (!entity) return;
    const world = uint(entity), epoch = uint(world + 2140);
    putUint(entity + entityRevision, epoch); putUint(entity + entityRevision + 4, uint(world + 2140));
    invalidate(entity);
    putUint(component + componentRevision, uint(uint(uint(component)) + 2140));
  }
  /** Serialize old/new primitive values exactly as the tracked-field setters do. */
  function trackedByte(component, offset, value, componentRevision, entityRevision, bit = false) {
    const old = byte(component + offset);
    if (old === (value | 0)) return;
    for (const base of [8551040, 8555152]) {
      call(14, uint(base + 12)); putLong(base + 8, 0n); putLong(base, 0n);
    }
    putByte(8551056, old); putUint(8551044, 1); if (bit) putUint(8551040, 1);
    putByte(component + offset, value);
    putByte(8555168, value); putUint(8555156, 1); if (bit) putUint(8555152, 1);
    if (old !== (value & 255)) markComponent(component, componentRevision, entityRevision);
  }
  function recordFloatWrite(destination, source, sourceIsDouble) {
    const incoming = sourceIsDouble ? double(source) : float(source);
    if (float(destination) === incoming) return false;
    for (const base of [8551040, 8555152]) {
      call(14, uint(base + 12)); putLong(base + 8, 0n); putLong(base, 0n);
    }
    // No arithmetic is applied to float32 inputs. Copy their bits to preserve
    // even signaling-NaN payloads across the tracking buffers.
    putUint(8551056, uint(destination)); putUint(8551044, 4);
    if (sourceIsDouble) putFloat(destination, double(source));
    else putUint(destination, uint(source));
    putUint(8555168, uint(destination)); putUint(8555156, 4);
    return uint(8551056) !== uint(8555168);
  }
  /** Original func18: tracked current-health mutation, used by all damage. */
  function setCurrentHealth(destination, source) {
    if (recordFloatWrite(destination, source, false)) markHealthField(destination);
    return destination | 0;
  }
  /** Original func25: tracked maximum-health mutation. */
  function setMaximumHealth(destination, source) {
    if (recordFloatWrite(destination, source, false)) markComponent((destination - 12) | 0, 20, 408);
  }
  /** Original func26: radius assignment with double-to-float32 conversion. */
  function setCollisionRadius(destination, source) {
    if (recordFloatWrite(destination, source, true)) markComponent((destination - 8) | 0, 12, 456);
  }
  function healthFor(entity) {
    let health = uint(entity + 164);
    if (health) return health;
    health = call(68, uint(entity) + 1176);
    putUint(entity + 164, health); putUint(health, entity);
    const epoch = uint(uint(entity) + 2140);
    putLong(health + 48, 0n); putByte(health + 40, 0); putUint(health + 4, epoch);
    putLong(health + 8, 0n); putLong(health + 16, 0n); putLong(health + 24, 0n); putByte(health + 32, 0);
    call(67, entity, uint(entity + 164)); return uint(entity + 164);
  }
  function physicsFor(entity) {
    let physics = uint(entity + 188);
    if (physics) return physics;
    physics = call(65, uint(entity) + 1440);
    putUint(entity + 188, physics); putUint(physics, entity);
    const epoch = uint(uint(entity) + 2140);
    putLong(physics + 8, 0n); putUint(physics + 4, epoch); putByte(physics + 16, 0);
    putLong(physics + 20, 0n); putLong(physics + 28, 0n); putUint(physics + 36, 0);
    putUint(physics + 48, 16777217); putLong(physics + 40, 1065353216n);
    call(64, entity, uint(entity + 188)); return uint(entity + 188);
  }
  function maximumHealth(health, maximum, scratch, ratioScratch) {
    putFloat(scratch, maximum);
    const previous = float(health + 12);
    if (previous <= 0) call(18, health + 8, scratch);
    else {
      putFloat(ratioScratch, f32(f32(float(health + 8) * maximum) / previous));
      call(18, health + 8, ratioScratch);
    }
    call(25, health + 12, scratch);
  }
  function radius(physics, value, scratch) { putDouble(scratch, value); call(26, physics + 8, scratch); }
  function defaultAi(scratch) {
    putLong(scratch + 40, 0n); putUint(scratch + 47, 0); putLong(scratch + 32, 0n); putByte(scratch + 28, 0);
    putLong(scratch + 20, 4575657221408423936n); putByte(scratch + 16, 0);
    putFloat(scratch + 8, 0.2); putFloat(scratch + 12, 0.2); putByte(scratch + 4, 0); putUint(scratch, 1039947569);
    putFloat(scratch + 84, 0); putFloat(scratch + 88, 1000); putFloat(scratch + 76, 500); putFloat(scratch + 80, 1000);
    putLong(scratch + 68, 0n); putFloat(scratch + 60, 1000); putFloat(scratch + 64, 1.5);
    putFloat(scratch + 52, 1); putFloat(scratch + 56, 2.4);
  }

  /** Original func210: ordinary, massive, dark and shiny ladybug profiles. */
  function configureLadybug(component, variant) {
    variant |= 0;
    withStack(112, frame => {
      const entity = uint(component), physics = physicsFor(entity), health = healthFor(uint(component));
      putFloat(physics + 44, 10);
      const settings = frame + 8;
      putLong(frame + 48, 0n); putUint(frame + 55, 0); putLong(frame + 40, 0n); putByte(frame + 36, 0);
      putFloat(frame + 16, 0.2); putFloat(frame + 20, 1);
      putFloat(frame + 92, 0); putFloat(frame + 96, 1000); putFloat(frame + 84, 500); putFloat(frame + 88, 1000);
      putLong(frame + 76, 0n); putFloat(frame + 68, 1000); putFloat(frame + 72, 1.5);
      putFloat(frame + 60, 1); putFloat(frame + 64, 2.4);
      putByte(frame + 24, 1); putByte(frame + 12, 1); putUint(frame + 8, 0);
      putFloat(frame + 28, 0.002); putFloat(frame + 32, 2);
      let angularSpeed;
      if ((variant | 0) === -1) {
        maximumHealth(health, 1000, frame + 104, frame + 100);
        radius(physics, 120, frame + 104);
        angularSpeed = f32(float(frame + 28) * 0.5); putFloat(frame + 28, angularSpeed);
        putFloat(frame + 20, float(frame + 20) * 0.2);
      } else {
        if (variant === 1 || variant === 2) putByte(frame + 57, 1);
        maximumHealth(health, variant === 1 || variant === 2 ? 35 : 25, frame + 104, frame + 100);
        radius(physics, 30, frame + 104);
        angularSpeed = float(frame + 28);
      }
      putFloat(frame + 48, 2 * Math.PI / angularSpeed);
      call(114, call(115, uint(component)), settings);
    });
  }

  /** Original func208: ant caste, randomized motion and caste-specific stats. */
  function configureAnt(component, caste) {
    caste |= 0;
    withStack(112, frame => {
      trackedByte(component, 8, caste, 12, 328);
      const physics = physicsFor(uint(component));
      putLong(frame + 48, 0n); putUint(frame + 55, 0);
      const sample = random();
      const speed = f32(f32(f32(f32((sample - 1) >>> 0) * ANT_RANDOM_TURN_SCALE) + f32(0.9)) * 0.002);
      putFloat(frame + 28, speed); putFloat(frame + 48, 2 * Math.PI / speed);
      putLong(frame + 40, 0n); putByte(frame + 36, 0);
      putFloat(frame + 16, 0.2); putFloat(frame + 20, 1);
      putFloat(frame + 92, 0); putFloat(frame + 96, 1000); putFloat(frame + 84, 500); putFloat(frame + 88, 1000);
      putLong(frame + 76, 0n); putFloat(frame + 68, 1000); putFloat(frame + 72, 1.5);
      putFloat(frame + 60, 1); putFloat(frame + 64, 2.4);
      putByte(frame + 24, 1); putByte(frame + 12, 1); putUint(frame + 8, 0); putFloat(frame + 32, 2);
      const health = healthFor(uint(component));
      if ((caste >>> 0) <= 3) {
        const hitPoints = [10, 25, 40, 200][caste], bodyRadius = [14, 20, 20, 40][caste];
        maximumHealth(health, hitPoints, frame + 104, frame + 100);
        radius(physics, bodyRadius, frame + 104);
        if (caste === 1) putByte(frame + 57, 1);
        else if (caste >= 2) {
          putFloat(frame + 68, caste === 2 ? 300 : 400); putByte(frame + 56, 1); putFloat(frame + 52, 0.3);
        }
      }
      putFloat(physics + 44, 10);
      call(114, call(115, uint(component)), frame + 8);
    });
  }

  /** Original func205: centipede profile, serialized state and chained segments. */
  function configureCentipede(component, evil, head) {
    evil |= 0; head |= 0;
    withStack(144, frame => {
      let rare = false;
      if (head) rare = f32(f32((random() - 1) >>> 0) / 2 ** 31) < 0.01;
      maximumHealth(healthFor(uint(component)), 50, frame + 32, frame + 128);
      const physics = physicsFor(uint(component));
      putFloat(physics + 44, 10); radius(physics, 35, frame + 32);
      putLong(frame + 72, 0n); putUint(frame + 79, 0); putLong(frame + 52, 4575657221408423936n); putByte(frame + 48, 0);
      putFloat(frame + 40, 0.2); putFloat(frame + 44, 0.2);
      putFloat(frame + 116, 0); putFloat(frame + 120, 1000); putFloat(frame + 108, 500); putFloat(frame + 112, 1000);
      putLong(frame + 100, 0n); putFloat(frame + 92, 1000); putFloat(frame + 96, 1.5);
      putFloat(frame + 84, 1); putFloat(frame + 88, 2.4);
      putFloat(frame + 64, 0.0001); putFloat(frame + 68, 0.6);
      putByte(frame + 60, 1); putByte(frame + 36, 1); putFloat(frame + 32, 0.006);
      if (evil) { putFloat(frame + 92, 600); putFloat(frame + 76, 0.3); putByte(frame + 80, 1); putFloat(frame + 44, 0.16); }
      call(114, call(115, uint(component)), frame + 32);
      trackedByte(component, 9, head, 16, 424, true);
      trackedByte(component, 8, evil, 12, 424, true);
      if (!head) return;
      let previous = uint(component);
      let angle = f32(f32((random() - 1) >>> 0) * f32(2 * Math.PI / 2 ** 31));
      const segmentType = evil ? 18 : 16, step = rare ? 2 * Math.PI / 100 : 2 * Math.PI / 20, count = rare ? 49 : 9;
      const world = uint(previous);
      for (let index = 0; index < count; index++) {
        const position = uint(previous + 168);
        if (!byte(position + 80)) call(17, position);
        const dy = call(149, angle) * 70 + double(position + 96);
        const dx = double(position + 88) + call(169, angle) * 70;
        putDouble(frame + 24, dy); putDouble(frame + 16, dx);
        const halfWidth = f32(float(world + 876) * 0.5), halfHeight = f32(float(world + 964) * 0.5);
        if (dx < f32(35 - halfWidth) || dy < f32(35 - halfHeight) || dx > f32(halfWidth - 35) || dy > f32(halfHeight - 35)) return;
        putUint(frame + 8, frame + 16); putLong(frame + 136, 4795207704359206912n);
        putFloat(frame + 132, dy - 35); putFloat(frame + 128, dx - 35);
        if (spawnAreaBlocked(uint(uint(component)) + 2056, frame + 128, frame + 8)) return;
        const next = call(144, uint(uint(component)) + 1936, segmentType, double(frame + 16), double(frame + 24), -1);
        if (!next) return;
        call(73, next, previous); call(267, call(422, next), previous);
        angle = f32(step + angle); previous = next;
      }
    });
  }

  /** Original func165: quadtree spawn query against player collision circles. */
  function spawnAreaBlocked(node, rectangle, candidate) {
    const count = uint(node + 24);
    if (count) {
      let pointer = uint(node + 32), end = (pointer + (count << 2)) | 0;
      do {
        const physics = uint(pointer);
        let coordinate = float(rectangle), edge = float(physics + 20);
        if (!(coordinate > f32(edge + float(physics + 28))) && !(f32(coordinate + float(rectangle + 8)) < edge)) {
          coordinate = float(rectangle + 4); edge = float(physics + 24);
          if (!(coordinate > f32(edge + float(physics + 32))) && !(f32(coordinate + float(rectangle + 12)) < edge)) {
            const entity = uint(physics);
            if (byte(entity + 95) & 32) {
              const coordinates = uint(candidate);
              const y = f32(double(coordinates + 8)), x = f32(double(coordinates));
              const position = uint(entity + 168);
              if (!byte(position + 80)) call(17, position);
              const dx = f32(f32(double(position + 88)) - x), dy = f32(f32(double(position + 96)) - y);
              const minimum = f32(float(physics + 8) + 45);
              if (f32(f32(dx * dx) + f32(dy * dy)) < f32(minimum * minimum)) return 1;
            }
          }
        }
        pointer = (pointer + 4) | 0;
      } while (pointer !== end);
    }
    let children = uint(node + 36);
    if (!children) return 0;
    const centerX = () => f32(float(node + 8) + f32(float(node + 16) * 0.5));
    const centerY = () => f32(float(node + 12) + f32(float(node + 20) * 0.5));
    if (float(rectangle) < centerX()) {
      let y = float(rectangle + 4), split = centerY();
      if (y < split) {
        if (spawnAreaBlocked(children, rectangle, candidate)) return 1;
        split = centerY(); y = float(rectangle + 4);
      }
      if (f32(y + float(rectangle + 12)) >= split && spawnAreaBlocked(uint(node + 36) + 80, rectangle, candidate)) return 1;
    }
    if (!(f32(float(rectangle) + float(rectangle + 8)) >= centerX())) return 0;
    let y = float(rectangle + 4), split = centerY();
    if (y < split) {
      if (spawnAreaBlocked(uint(node + 36) + 40, rectangle, candidate)) return 1;
      split = centerY(); y = float(rectangle + 4);
    }
    if (!(f32(y + float(rectangle + 12)) >= split)) return 0;
    return spawnAreaBlocked(uint(node + 36) + 120, rectangle, candidate) ? 1 : 0;
  }

  /** Original func167: memoized collision rectangle including attached children. */
  function collisionBounds(physics) {
    if (!byte(physics + 16)) {
      putByte(physics + 16, 1);
      const bodyRadius = float(physics + 8);
      let entity = uint(physics), position = uint(entity + 168);
      if (!byte(position + 80)) { call(17, position); entity = uint(physics); }
      const x = double(position + 88), y = double(position + 96), diameter = f32(bodyRadius + bodyRadius);
      putFloat(physics + 32, diameter); putFloat(physics + 28, diameter);
      putFloat(physics + 24, f32(f32(y) - bodyRadius)); putFloat(physics + 20, f32(f32(x) - bodyRadius));
      let node = uint(entity + 84);
      while (node) {
        const next = uint(node + 8), childPhysics = uint(node + 132);
        if (childPhysics) {
          const bounds = collisionBounds(childPhysics);
          const width = float(bounds + 8), height = float(bounds + 12), childX = float(bounds);
          const childY = float(bounds + 4), parentY = float(physics + 24), parentX = float(physics + 20);
          const minimumY = childY < parentY ? childY : parentY, minimumX = childX < parentX ? childX : parentX;
          putFloat(physics + 24, minimumY); putFloat(physics + 20, minimumX);
          const childBottom = f32(childY + height), parentBottom = f32(parentY + float(physics + 32));
          putFloat(physics + 32, f32((childBottom > parentBottom ? childBottom : parentBottom) - minimumY));
          const childRight = f32(childX + width), parentRight = f32(parentX + float(physics + 28));
          putFloat(physics + 28, f32((childRight > parentRight ? childRight : parentRight) - minimumX));
        }
        node = next;
      }
    }
    return (physics + 20) | 0;
  }

  function controllingRoot(entity) {
    for (;;) {
      const flags = byte(entity + 93), owner = flags & 64 ? uint(entity + 236) : 0;
      if (owner) { entity = owner; continue; }
      const fallback = flags & 64 ? uint(entity + 224) : 0;
      if (!fallback) return entity;
      entity = fallback;
    }
  }

  /** Original func168: target range, health, arena bounds and ownership rules. */
  function targetEligible(ai, target) {
    const targetHealth = uint(target + 164);
    let entity = uint(ai), position = uint(entity + 168), owner = uint(ai + 164), gateOwner = owner;
    const targetPosition = uint(target + 168);
    if (!byte(targetPosition + 80)) { call(17, targetPosition); gateOwner = uint(ai + 164); entity = uint(ai); }
    let targetX = double(targetPosition + 88);
    const arenaThreshold = f32(float(uint(entity) + 876) * (gateOwner ? -0.5 : f32(float(ai + 104) - 0.5)));
    if (targetX < arenaThreshold) return 0;
    if (!byte(targetPosition + 80)) { call(17, targetPosition); targetX = double(targetPosition + 88); }
    const targetY = double(targetPosition + 96);
    if (!byte(position + 80)) call(17, position);
    let dx = targetX - double(position + 88), dy = targetY - double(position + 96);
    const range = f32(float(ai + 120) * float(ai + 124));
    if (dx * dx + dy * dy > range * range) return 0;
    if (targetHealth && float(targetHealth + 8) <= 0) return 0;
    if (owner) {
      const ownerPosition = uint(owner + 168);
      if (!byte(ownerPosition + 80)) call(17, ownerPosition);
      const ownerY = double(ownerPosition + 96), ownerX = double(ownerPosition + 88);
      if (!byte(targetPosition + 80)) call(17, targetPosition);
      dx = ownerX - double(targetPosition + 88); dy = ownerY - double(targetPosition + 96);
      const leash = float(ai + 140);
      if (dx * dx + dy * dy > leash * leash) return 0;
    }
    return controllingRoot(uint(ai)) !== controllingRoot(target) ? 1 : 0;
  }

  /** Original func280: health-field change notification after damage clamps. */
  function markHealthField(address) { markComponent((address - 8) | 0, 16, 408); }

  /** Original func426: propagate attacker aggro through owned entity callbacks. */
  function alertToAttacker(entity, attacker) {
    withStack(16, frame => {
      if (!attacker) return;
      let controller = attacker;
      for (;;) {
        if (byte(controller + 92) & 32) break;
        const flags = byte(controller + 93), linked = flags & 64 ? uint(controller + 236) : 0;
        if (!linked && !(flags & 64)) return;
        controller = linked || uint(controller + 224);
        if (!controller) return;
      }
      if (!uint(controller + 120)) return;
      for (;;) {
        if ((byte(attacker + 95) & 32) || (byte(attacker + 92) & 2)) break;
        const flags = byte(attacker + 93), linked = flags & 64 ? uint(attacker + 224) : 0;
        if (!linked && !(flags & 64)) return;
        attacker = linked || uint(attacker + 236);
        if (!attacker) return;
      }
      putUint(frame + 4, attacker);
      const ai = uint(entity + 104);
      if (ai && !uint(ai + 152) && (byte(ai + 108) || byte(ai + 109)) && targetEligible(ai, attacker) && uint(ai + 152) !== attacker) {
        const previous = uint(ai + 156), next = uint(ai + 160), link = (ai + 152) | 0;
        putUint(previous + 8, next); putUint(next + 4, previous);
        putUint(ai + 160, link); putUint(ai + 152, 0);
        putUint(ai + 152, uint(attacker + 4));
        const tail = uint(attacker + 12);
        putUint(ai + 160, tail); putUint(tail + 4, link);
        putUint(ai + 156, attacker + 4); putUint(attacker + 12, link);
      }
      putUint(frame, frame + 4); putUint(frame + 8, frame);
      let callback = uint(entity + 72);
      while (callback) {
        const next = uint(callback + 8);
        call(423, frame + 8, callback);
        callback = next;
      }
    });
  }

  return Object.freeze({
    18: setCurrentHealth, 25: setMaximumHealth, 26: setCollisionRadius,
    165: spawnAreaBlocked, 167: collisionBounds, 168: targetEligible,
    205: configureCentipede, 208: configureAnt, 210: configureLadybug,
    280: markHealthField, 426: alertToAttacker,
  });
}
