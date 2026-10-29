/**
 * Executable reconstruction of the server's petal behavior methods.
 *
 * Evidence: sp_server.wasm SHA-256
 * 75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d,
 * source/wasm/sp_server.wat and source/semantic/server-catalogs.json.
 * The numeric ABI is deliberately retained while the simulation is recovered in
 * small pieces. runtime.call invokes the remaining original shared services;
 * the per-function dependency list in petals-map.json makes that boundary clear.
 */

const f32 = Math.fround;
const INPUT = Object.freeze({ attack: 1, defend: 2 });
const ENTITY = Object.freeze({
  world: 0, health: 164, transform: 168, petalSlot: 124, combat: 188,
  effects: 192, loadout: 200, parent: 224, owner: 236,
  flags92: 92, flags93: 93,
});
const TRANSFORM = Object.freeze({
  entity: 0, angle: 8, localY: 16, localX: 20,
  velocityX: 40, velocityY: 48, accelerationX: 56, accelerationY: 64,
  worldValid: 80, worldX: 88, worldY: 96,
});
const HEALTH = Object.freeze({ current: 8, maximum: 12, lifetime: 24 });
const COMBAT = Object.freeze({ radius: 8, knockback: 40, damage: 44 });
const BEHAVIOR = Object.freeze({ state: 4, clockValid: 8, startedAt: 16 });
const CONTEXT = Object.freeze({ entity: 0, owner: 4, elapsed: 8 });
const EPSILON_LENGTH = 2 ** -52;
const EPSILON_POSITION = 1e-7;
const RANDOM_SEED_ADDRESS = 8573024;

// Original initializer constants are i64 IEEE-754 radius values and f32
// damage/health values, not values inferred from the visible description text.
// columns: WASM id, radius, damage, maximum health, timestamped behavior.
const INITIALIZERS = [
  [411, 7, 8, 20, true], [412, 10, 5, 5, true], [414, 7, 8, 5, false],
  [432, 10, 12, 20, true], [433, 10, 10, 10, false],
  [434, 10, 5, 5, false], [435, 10, 1, 2000, false],
  [662, 12, 20, 20, false], [664, 14, 10, 90, false],
  [668, 6, 5, 5, false], [670, 15, 15, 15, true],
  [672, 10, 35, 10, true], [685, 12, 0, 1, true],
  [687, 7, 8, 5, true], [690, 9, 5, 10, true],
  [694, 13, 1, 50, true], [720, 15, 1, 50, true],
  [724, 7, 5, 5, true], [726, 16, 10, 200, false],
  [727, 7, 35, 8, false], [728, 12, 15, 15, false],
  [734, 10, 8, 5, true], [739, 10, 8, 10, false],
  [740, 15, 5, 15, false],
];

export const functionIds = Object.freeze([
  ...INITIALIZERS.map(([id]) => id),
  119, 413, 661, 663, 667, 725,
  665, 666, 669, 671, 680, 682, 684, 686, 688, 689, 692, 723, 733, 738,
].sort((a, b) => a - b));

export function createPetalHooks(runtime) {
  let buffer, view;
  function memory() {
    if (buffer !== runtime.memory.buffer) {
      buffer = runtime.memory.buffer;
      view = new DataView(buffer);
    }
    return view;
  }
  function access(address, width) {
    const current = memory();
    // Effective WASM addresses add the static offset without wrapping at 2^32.
    // Converting the final sum with >>> 0 would turn an invalid entity into a
    // low-memory write, so pointer coercion belongs at the hook ABI boundary.
    if (address < 0 || address + width > current.byteLength) {
      throw new WebAssembly.RuntimeError('memory access out of bounds');
    }
    return current;
  }
  const u8 = address => access(address, 1).getUint8(address);
  const u32 = address => access(address, 4).getUint32(address, true);
  const float = address => access(address, 4).getFloat32(address, true);
  const double = address => access(address, 8).getFloat64(address, true);
  const byte = (address, value) => access(address, 1).setUint8(address, value);
  const word = (address, value) => access(address, 4).setUint32(address, value, true);
  const writeFloat = (address, value) => access(address, 4).setFloat32(address, value, true);
  const writeDouble = (address, value) => access(address, 8).setFloat64(address, value, true);
  const short = (address, value) => access(address, 2).setUint16(address, value, true);
  const call = (id, ...args) => runtime.call(id, ...args);

  // Preserve the real WASM stack address so callbacks and unrecovered services
  // see precisely the same scratch pointers and lifetime as in the original.
  function stackFrame(size, body) {
    const frame = (runtime.stackPointer.value - size) >>> 0;
    runtime.stackPointer.value = frame;
    const result = body(frame);
    runtime.stackPointer.value = (frame + size) | 0;
    return result;
  }
  function invokeVirtual(object, slot) {
    // The native adapter checks the exact original call_indirect signature.
    return runtime.indirect({ parameters: ['i32'], results: slot === 4 ? ['i32'] : [] },
      u32(u32(object) + slot * 4), object);
  }
  function ensureWorldTransform(transform) {
    if (!u8(transform + TRANSFORM.worldValid)) call(17, transform);
  }
  function invalidateWorldTransform(transform) {
    if (!u8(transform + TRANSFORM.worldValid)) return;
    byte(transform + TRANSFORM.worldValid, 0);
    let node = u32(u32(transform) + 84);
    while (node) {
      const next = u32(node + 8);
      call(34, node);
      node = next;
    }
  }
  function timerElapsed(clock, behavior, duration) {
    return !u8(clock) || (u8(behavior + BEHAVIOR.clockValid) !== 0 &&
      double(clock + 8) - double(behavior + BEHAVIOR.startedAt) > duration);
  }
  function ownerInput(context) {
    const owner = u32(context + CONTEXT.owner);
    return owner ? u8(owner + 10) : 0;
  }
  function outputState(output, radius, consumed = false) {
    writeFloat(output, radius);
    byte(output + 4, Number(consumed));
  }
  function projectileOutput(output) {
    byte(output + 4, 0);
    word(output, 0);
  }

  function initialize(behavior, entity, radius, damage, maximumHealth, timestamped, heaviest) {
    return stackFrame(timestamped ? 32 : 16, frame => {
      const value = frame + (timestamped ? 8 : 0);
      const combat = u32(entity + ENTITY.combat);
      writeDouble(value, radius);
      call(26, combat + COMBAT.radius, value);
      writeFloat(u32(entity + ENTITY.combat) + COMBAT.damage, damage);

      const health = u32(entity + ENTITY.health);
      const current = health + HEALTH.current;
      const maximum = health + HEALTH.maximum;
      writeFloat(value, maximumHealth);
      const previousMaximum = float(maximum);
      if (previousMaximum <= 0) call(18, current, value);
      else {
        // WASM f32 multiplication rounds before division. Infinity and NaN must
        // take the same branch as the original, so do not use a truthy check.
        const scaled = f32(f32(float(current) * maximumHealth) / previousMaximum);
        writeFloat(frame + (timestamped ? 28 : 12), scaled);
        call(18, current, frame + (timestamped ? 28 : 12));
      }
      call(25, maximum, value);
      if (timestamped) {
        call(21, value);
        access(behavior + 16, 8).setBigUint64(behavior + 16, access(frame + 16, 8).getBigUint64(frame + 16, true), true);
        access(behavior + 8, 8).setBigUint64(behavior + 8, access(frame + 8, 8).getBigUint64(frame + 8, true), true);
      }
      if (heaviest) writeFloat(u32(entity + ENTITY.combat) + COMBAT.knockback, 4);
    });
  }

  function simpleOrbit(output, unusedBehavior, context, attack, defend) {
    outputState(output, 65);
    const inputs = ownerInput(context);
    if (inputs & INPUT.attack) writeFloat(output, attack);
    else if (inputs & INPUT.defend) writeFloat(output, defend);
  }

  function wingOrbit(output, behavior, context) {
    return stackFrame(16, frame => {
      call(21, frame);
      let phase = Infinity;
      if (u8(frame)) phase = u8(behavior + BEHAVIOR.clockValid)
        ? (double(frame + 8) - double(behavior + BEHAVIOR.startedAt)) * 0.005
        : -Infinity;
      // Use the recovered artifact's libm sine until that shared library is
      // independently recovered; JS Math.sin differs for very large arguments.
      byte(output + 4, 0);
      const wave = f32(call(149, phase));
      writeFloat(output, f32(f32(wave * 10) + 65));
      const inputs = ownerInput(context);
      if (inputs & INPUT.attack) writeFloat(output, f32(f32(50 * wave) + 140));
      else if (inputs & INPUT.defend) writeFloat(output, f32(f32(5 * wave) + 40));
    });
  }

  /** Remove the launched petal from its owner's slot handle, if still linked. */
  function detachFromSlot(entity) {
    const petalSlot = u32(entity + ENTITY.petalSlot);
    const slotEntity = u32(petalSlot);
    if (!(u8(slotEntity + ENTITY.flags93) & 64)) return;
    const owner = u32(slotEntity + ENTITY.owner);
    if (!owner) return;
    const loadout = u32(owner + ENTITY.loadout);
    if (!loadout) return;
    const slot = u8(petalSlot + 16), instance = u8(petalSlot + 17);
    if (slot > 7 || instance > 2) return;
    const handle = loadout + slot * 36 + instance * 12 + 296;
    if (u32(handle) !== slotEntity) return;
    const previous = u32(handle + 4), next = u32(handle + 8);
    word(previous + 8, next);
    word(next + 4, previous);
    word(handle, 0);
    word(handle + 8, handle);
    word(handle + 4, handle);
    call(85, loadout);
  }

  function unitDirection(x, y, roundComponents = false) {
    const length = Math.sqrt(x * x + y * y);
    if (length < EPSILON_LENGTH) return [1, 0];
    return roundComponents ? [f32(x / length), f32(y / length)] : [x / length, y / length];
  }
  function addVector(transform, offset, x, y) {
    writeDouble(transform + offset, x + double(transform + offset));
    writeDouble(transform + offset + 8, y + double(transform + offset + 8));
  }

  /** Missile and dandelion share launch rules; dandelion rounds each impulse. */
  function aimedProjectileOrbit(output, behavior, context, roundImpulse) {
    return stackFrame(32, frame => {
      projectileOutput(output);
      if (u8(behavior + BEHAVIOR.state)) { byte(output + 4, 1); return; }
      writeFloat(output, 65);
      const ownerContext = u32(context + CONTEXT.owner);
      if (!ownerContext) return;
      const ownerTransform = u32(u32(ownerContext) + ENTITY.transform);
      const transform = u32(u32(context) + ENTITY.transform);
      ensureWorldTransform(transform);
      let dy = double(transform + TRANSFORM.worldY);
      let dx = double(transform + TRANSFORM.worldX);
      ensureWorldTransform(ownerTransform);
      dy -= double(ownerTransform + TRANSFORM.worldY);
      dx -= double(ownerTransform + TRANSFORM.worldX);
      const angle = f32(call(164, dy, dx));
      invalidateWorldTransform(transform);
      writeDouble(frame, angle);
      writeDouble(frame + 8, 2 * Math.PI);
      writeDouble(frame + 16, runtime.host('a', 'a', 22903, 6924, frame));
      call(94, transform + TRANSFORM.angle, frame + 16);
      if (ownerInput(context) & INPUT.attack) {
        call(21, frame + 16);
        if (timerElapsed(frame + 16, behavior, 500)) {
          byte(behavior + BEHAVIOR.state, 1);
          [dx, dy] = unitDirection(dx, dy, roundImpulse);
          const velocityX = roundImpulse ? f32(dx * 1.4) : dx * 1.4;
          const velocityY = roundImpulse ? f32(dy * 1.4) : dy * 1.4;
          const accelerationX = roundImpulse ? f32(dx * 0.6) : dx * 0.6;
          const accelerationY = roundImpulse ? f32(dy * 0.6) : dy * 0.6;
          addVector(transform, TRANSFORM.velocityX, velocityX, velocityY);
          addVector(transform, TRANSFORM.accelerationX, accelerationX, accelerationY);
          detachFromSlot(u32(context));
          writeFloat(u32(u32(context) + ENTITY.health) + HEALTH.lifetime, 1500);
          return;
        }
      }
      if (ownerInput(context) & INPUT.defend) writeFloat(output, 40);
    });
  }

  function bubbleOrbit(output, behavior, context) {
    return stackFrame(16, frame => {
      projectileOutput(output);
      if (u8(behavior + BEHAVIOR.state)) { byte(output + 4, 1); return; }
      writeFloat(output, 60);
      const owner = u32(context + CONTEXT.owner);
      if (!owner || !(u8(owner + 10) & INPUT.defend)) return;
      const ownerTransform = u32(u32(owner) + ENTITY.transform);
      const transform = u32(u32(context) + ENTITY.transform);
      call(21, frame);
      if (!timerElapsed(frame, behavior, 500)) return;
      byte(behavior + BEHAVIOR.state, 1);
      ensureWorldTransform(ownerTransform);
      let dy = double(ownerTransform + TRANSFORM.worldY);
      let dx = double(ownerTransform + TRANSFORM.worldX);
      ensureWorldTransform(transform);
      dy -= double(transform + TRANSFORM.worldY);
      dx -= double(transform + TRANSFORM.worldX);
      const length = Math.sqrt(dx * dx + dy * dy);
      let impulseX = 1.4, impulseY = 0;
      if (!(length < EPSILON_LENGTH)) {
        // Multiplication before division is intentional in this behavior.
        impulseX = dx * 1.4 / length;
        impulseY = dy * 1.4 / length;
      }
      addVector(ownerTransform, TRANSFORM.velocityX, impulseX, impulseY);
      short(frame, 1);
      const health = u32(u32(context) + ENTITY.health);
      call(43, health, 0, float(health + HEALTH.current), frame);
    });
  }

  function pollenOrbit(output, behavior, context) {
    return stackFrame(16, frame => {
      projectileOutput(output);
      if (u8(behavior + BEHAVIOR.state)) { byte(output + 4, 1); return; }
      writeFloat(output, 65);
      const owner = u32(context + CONTEXT.owner);
      if (!owner || !(u8(owner + 10) & 3)) return;
      const ownerTransform = u32(u32(owner) + ENTITY.transform);
      const transform = u32(u32(context) + ENTITY.transform);
      call(21, frame);
      if (!timerElapsed(frame, behavior, 500)) return;
      byte(behavior + BEHAVIOR.state, 1);
      ensureWorldTransform(transform);
      let dy = double(transform + TRANSFORM.worldY);
      let dx = double(transform + TRANSFORM.worldX);
      ensureWorldTransform(ownerTransform);
      dy -= double(ownerTransform + TRANSFORM.worldY);
      dx -= double(ownerTransform + TRANSFORM.worldX);
      const length = Math.sqrt(dx * dx + dy * dy);
      let impulseX = 0.5, impulseY = 0;
      if (!(length < EPSILON_LENGTH)) {
        impulseX = dx * 0.5 / length;
        impulseY = dy * 0.5 / length;
      }
      const direction = ownerInput(context) & INPUT.attack ? 1 : -1;
      // Original expression evaluates the old velocity before the impulse.
      writeDouble(transform + TRANSFORM.velocityX,
        double(transform + TRANSFORM.velocityX) + impulseX * direction);
      writeDouble(transform + TRANSFORM.velocityY,
        double(transform + TRANSFORM.velocityY) + impulseY * direction);
      detachFromSlot(u32(context));

      // Park-Miller generator, Schrage form; all arithmetic is 32-bit unsigned
      // at exactly the original operations. The lifetime jitter is up to 1000ms.
      const seed = u32(RANDOM_SEED_ADDRESS);
      const quotient = Math.trunc(seed / 44488);
      const product = Math.imul((Math.imul(quotient, -44488) + seed) | 0, 48271) >>> 0;
      const correction = Math.imul(quotient, 3399) >>> 0;
      const next = ((product < correction ? 2147483647 : 0) + product - correction) >>> 0;
      word(RANDOM_SEED_ADDRESS, next);
      const lifetime = f32(f32(f32((next - 1) >>> 0) * f32(1000 / 2147483648)) + 4500);
      writeFloat(u32(u32(context) + ENTITY.health) + HEALTH.lifetime, lifetime);
    });
  }

  function webOrbit(output, behavior, context) {
    return stackFrame(16, frame => {
      projectileOutput(output);
      if (u8(behavior + BEHAVIOR.state)) { byte(output + 4, 1); return; }
      writeFloat(output, 65);
      if (!u32(context + CONTEXT.owner)) return;
      if (ownerInput(context) & INPUT.attack) {
        call(21, frame);
        if (timerElapsed(frame, behavior, 500)) {
          byte(behavior + BEHAVIOR.state, 1);
          const ownerTransform = u32(u32(u32(context + CONTEXT.owner)) + ENTITY.transform);
          const transform = u32(u32(context) + ENTITY.transform);
          ensureWorldTransform(transform);
          let dy = double(transform + TRANSFORM.worldY);
          let dx = double(transform + TRANSFORM.worldX);
          ensureWorldTransform(ownerTransform);
          dy -= double(ownerTransform + TRANSFORM.worldY);
          dx -= double(ownerTransform + TRANSFORM.worldX);
          const length = Math.sqrt(dx * dx + dy * dy);
          const impulseX = length < EPSILON_LENGTH ? f32(2.2) : f32(f32(dx / length) * 2.2);
          const impulseY = length < EPSILON_LENGTH ? 0 : f32(f32(dy / length) * 2.2);
          addVector(transform, TRANSFORM.velocityX, impulseX, impulseY);
          detachFromSlot(u32(context));
          writeFloat(u32(u32(context) + ENTITY.health) + HEALTH.lifetime, 650);
          return;
        }
      }
      if (ownerInput(context) & INPUT.defend) writeFloat(output, 40);
    });
  }

  function blocksHealing(effects) {
    if (!effects) return false;
    for (const [countOffset, itemsOffset] of [[16, 24], [28, 36]]) {
      const count = u32(effects + countOffset);
      const start = u32(effects + itemsOffset), end = (start + (count << 2)) >>> 0;
      for (let item = start; count && item !== end; item = (item + 4) >>> 0) {
        if (invokeVirtual(u32(item), 4)) return true;
      }
    }
    return false;
  }
  /** Follow the original ownership chain to a flower-capable ancestor. */
  function flowerAncestor(entity) {
    let current = entity;
    while (current && !(u8(current + ENTITY.flags92) & 32)) {
      const flags = u8(current + ENTITY.flags93);
      const owner = u32(current + ENTITY.owner) & ((flags << 25) >> 31);
      if (owner) current = owner >>> 0;
      else {
        if (!(flags & 64)) return 0;
        current = u32(current + ENTITY.parent);
      }
    }
    return current;
  }

  function roseOrbit(output, behavior, context, healAmount) {
    return stackFrame(32, frame => {
      outputState(output, 65);
      const ownerContext = u32(context + CONTEXT.owner);
      if (!ownerContext) return;
      if (u8(ownerContext + 10) & INPUT.defend) writeFloat(output, 40);
      const ownerEntity = u32(ownerContext);
      const ownerTransform = u32(ownerEntity + ENTITY.transform);
      const health = u32(ownerEntity + ENTITY.health);
      if (!u32(behavior + BEHAVIOR.state)) {
        call(21, frame + 8);
        let mayHeal = timerElapsed(frame + 8, behavior, 1000);
        const current = float(health + HEALTH.current);
        mayHeal &&= current > 0 && current < float(health + HEALTH.maximum);
        mayHeal &&= !blocksHealing(u32(u32(health) + ENTITY.effects));
        if (mayHeal) {
          const entity = u32(health);
          if (u32(entity + ENTITY.loadout)) {
            const ancestor = flowerAncestor(entity);
            mayHeal = !!ancestor && !!u32(ancestor + 120);
          }
        }
        if (mayHeal) word(behavior + BEHAVIOR.state, u32(behavior + BEHAVIOR.state) + 1);
      }
      if (!u32(behavior + BEHAVIOR.state)) return;
      byte(output + 4, 1);
      const transform = u32(u32(context) + ENTITY.transform);
      const localX = float(transform + TRANSFORM.localX);
      ensureWorldTransform(ownerTransform);
      let worldX = double(ownerTransform + TRANSFORM.worldX);
      if (!(Math.abs(localX - worldX) < EPSILON_POSITION)) {
        const weight = 1 - call(95, 0.8, float(context + CONTEXT.elapsed) * 0.06);
        worldX = (worldX - localX) * (weight < 0 ? 0 : Math.min(weight, 1)) + localX;
      }
      const localY = float(transform + TRANSFORM.localY);
      ensureWorldTransform(ownerTransform);
      let worldY = double(ownerTransform + TRANSFORM.worldY);
      if (!(Math.abs(localY - worldY) < EPSILON_POSITION)) {
        const weight = 1 - call(95, 0.8, float(context + CONTEXT.elapsed) * 0.06);
        worldY = (worldY - localY) * (weight < 0 ? 0 : Math.min(weight, 1)) + localY;
      }
      writeDouble(frame + 24, worldY);
      writeDouble(frame + 8, worldX);
      if (Number.isFinite(worldX) && Number.isFinite(worldY)) {
        invalidateWorldTransform(transform);
        call(44, transform + TRANSFORM.localX, frame + 8);
        call(47, transform + TRANSFORM.localY, frame + 24);
      }
      const state = (u32(behavior + BEHAVIOR.state) + 1) >>> 0;
      word(behavior + BEHAVIOR.state, state);
      if (state !== 10) return;
      call(216, health, f32(healAmount));
      short(frame + 8, 1);
      const petalHealth = u32(u32(context) + ENTITY.health);
      call(43, petalHealth, 0, float(petalHealth + HEALTH.current), frame + 8);
    });
  }

  function effectSource(entity) {
    if (!entity) return 0;
    const ancestor = flowerAncestor(entity);
    if (!ancestor) return entity;
    const flower = u32(ancestor + 120);
    if (!flower) return entity;
    return u32(flower + 100) || u32(flower);
  }
  function appendEffect(effects, effect) {
    if (call(118, effect) <= 0) { invokeVirtual(effect, 1); return; }
    const count = u32(effects + 16), nextCount = (count + 1) >>> 0;
    let capacity = u32(effects + 20), items = u32(effects + 24);
    if (capacity < nextCount) {
      let candidate = capacity ? capacity << 1 : 1024;
      do { capacity = candidate >>> 0; candidate = (candidate << 1) >>> 0; } while (capacity < nextCount);
      const previousItems = items;
      items = call(16, capacity << 2) >>> 0;
      for (let index = 0; index < count; index++) {
        const previous = previousItems + index * 4;
        const moved = u32(previous);
        word(previous, 0);
        word(items + index * 4, moved);
        // These memory operations retain the original unique_ptr move order.
        const residual = u32(previous);
        word(previous, 0);
        if (residual) invokeVirtual(residual, 1);
      }
      call(14, previousItems);
      word(effects + 24, items);
      word(effects + 20, capacity);
    }
    word(items + count * 4, effect);
    word(effects + 16, nextCount);
  }
  function poisonOnHit(unusedBehavior, attacker, target, duration) {
    return stackFrame(16, frame => {
      const effects = u32(target + ENTITY.effects);
      if (!effects) return;
      const source = effectSource(attacker);
      const effect = call(20, 40) >>> 0;
      call(21, frame);
      byte(effect + 8, 1);
      writeDouble(effect + 16, double(frame + 8) + duration);
      const handle = effect + 24;
      word(effect + 32, handle);
      word(handle, 0);
      word(effect, 5564);
      if (source) {
        word(handle, u32(source + 4));
        const tail = u32(source + 12);
        word(effect + 32, tail);
        word(tail + 4, handle);
        word(effect + 28, source + 4);
        word(source + 12, handle);
      } else {
        word(handle, 0);
        word(effect + 28, handle);
        word(effect + 32, handle);
      }
      appendEffect(effects, effect);
    });
  }
  function timedEffectOnHit(unusedBehavior, unusedAttacker, target, vtable, duration) {
    return stackFrame(16, frame => {
      const effects = u32(target + ENTITY.effects);
      if (!effects) return;
      call(21, frame);
      const now = double(frame + 8);
      const effect = call(20, 24) >>> 0;
      byte(effect + 8, 1);
      word(effect, vtable);
      writeDouble(effect + 16, now + duration);
      appendEffect(effects, effect);
    });
  }

  const hooks = {};
  for (const [id, radius, damage, health, timestamped] of INITIALIZERS) {
    hooks[id] = (behavior, entity) => initialize(behavior, entity, radius, damage, health, timestamped, id === 726);
  }
  for (const [id, attack, defend] of [[119, 130, 40], [413, 145, 40], [661, 120, 50], [663, 110, 55], [667, 140, 40], [725, 100, 65]]) {
    hooks[id] = (output, behavior, context) => simpleOrbit(output, behavior, context, attack, defend);
  }
  Object.assign(hooks, {
    665: (output, behavior, context) => roseOrbit(output, behavior, context, 10),
    666: (behavior, attacker, target) => poisonOnHit(behavior, attacker, target, 20000 / 3),
    669: wingOrbit,
    671: (output, behavior, context) => aimedProjectileOrbit(output, behavior, context, false),
    680: (behavior, attacker, target) => poisonOnHit(behavior, attacker, target, 8000 / 9),
    682: (output, behavior, context) => roseOrbit(output, behavior, context, 22),
    684: bubbleOrbit,
    686: pollenOrbit,
    688: (behavior, attacker, target) => timedEffectOnHit(behavior, attacker, target, 6116, 10000),
    689: (output, behavior, context) => aimedProjectileOrbit(output, behavior, context, true),
    692: (behavior, attacker, target) => poisonOnHit(behavior, attacker, target, 666.6666666666667),
    723: (output, behavior, context) => roseOrbit(output, behavior, context, 3.5),
    733: webOrbit,
    738: (behavior, attacker, target) => timedEffectOnHit(behavior, attacker, target, 6592, 4000),
  });
  for (const id of functionIds) {
    const body = hooks[id];
    hooks[id] = (...args) => body(...args.map(value => value >>> 0));
  }
  return hooks;
}
