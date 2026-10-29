import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createCombatHooks, functionIds } from '../source/game/server/combat.mjs';

const dependencies = [14, 15, 16, 17, 18, 25, 26, 64, 65, 67, 68, 73, 114, 115, 144, 149, 169, 267, 422, 423, 703, 712, 715];

async function oracle() {
  const calls = [];
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencies],
    imports: { a: {
      a: (...args) => { calls.push(['a', ...args]); return 0; },
      b: (...args) => { calls.push(['b', ...args]); return 0; },
    } },
  });
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer), hooks = createCombatHooks(runtime);
  const u32 = address => view.getUint32(address, true), putUint = (address, value) => view.setUint32(address, value, true);
  const putFloat = (address, value) => view.setFloat32(address, value, true), putDouble = (address, value) => view.setFloat64(address, value, true);
  const allocate = size => { const pointer = runtime.call(16, size); bytes.fill(0, pointer, pointer + size); return pointer; };
  function compare(id, args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    calls.length = 0;
    const expectedReturn = runtime.call(id, ...args), expectedStack = runtime.stackPointer.value;
    const expected = Buffer.from(bytes), expectedCalls = structuredClone(calls);
    bytes.set(before); runtime.stackPointer.value = stack; calls.length = 0;
    const result = hooks[id](...args);
    assert.equal(result, expectedReturn, `${label}: return`); assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    assert.deepEqual(calls, expectedCalls, `${label}: host callbacks`);
    if (Buffer.compare(bytes, expected)) {
      const differences = [];
      for (let address = 0; address < bytes.length && differences.length < 16; address++) {
        if (bytes[address] !== expected[address]) differences.push({ address, original: expected[address], recovered: bytes[address] });
      }
      assert.fail(`${label}: memory differences ${JSON.stringify(differences)}`);
    }
    return result;
  }
  const capture = () => ({ memory: Buffer.from(bytes), stack: runtime.stackPointer.value });
  const restore = saved => { bytes.set(saved.memory); runtime.stackPointer.value = saved.stack; };
  return { runtime, bytes, view, hooks, u32, putUint, putFloat, putDouble, allocate, compare, capture, restore };
}

test('centipede, ant and ladybug family profiles match real game state and random boundaries', async () => {
  const o = await oracle(), { runtime, putUint, putFloat, u32, compare, capture, restore } = o;
  runtime.exports.u(0, 0);
  const entity = runtime.call(144, 22928 + 1936, 1, 1000, 1000, -1);
  runtime.call(703, entity); runtime.call(712, entity); runtime.call(715, entity);
  const initial = capture();
  let generatedSegments = 0;
  for (const [id, offset, variants] of [[205, 172, [[0, 0], [1, 0], [0, 1], [1, 1]]], [208, 132, [[0], [1], [2], [3], [4], [-1]]], [210, 144, [[-1], [0], [1], [2], [3]]]]) {
    for (const args of variants) {
      // 209/320/516 expose the low-bit difference between the original
      // 0x1.9999ap-34 coefficient and the tempting f32(0.2 / 2^31).
      for (const seed of [1, 47, 209, 320, 516, 123456789, 2147483646, 0xffffffff]) {
        restore(initial); putUint(8573024, seed);
        const health = u32(entity + 164); putFloat(health + 8, 7.5); putFloat(health + 12, 31);
        const freeBefore = u32(22928 + 2148);
        compare(id, [u32(entity + offset), ...args], `func${id} profile=${args}, seed=${seed}`);
        generatedSegments += freeBefore - u32(22928 + 2148);
      }
    }
  }
  assert.ok(generatedSegments > 0, 'centipede scenarios must actually create body segments');
});

test('ant/ladybug initialization creates missing health and physics in original allocator order', async () => {
  const { runtime, allocate, putUint, compare, capture, restore } = await oracle();
  const world = allocate(530000), entity = allocate(512), position = allocate(128), ant = allocate(16), ladybug = allocate(8);
  for (const offset of [48, 1176, 1440]) putUint(world + offset, 1024);
  putUint(world + 2140, 77); putUint(entity, world); putUint(entity + 16, 13); putUint(entity + 168, position);
  putUint(position, entity); putUint(ant, entity); putUint(ladybug, entity);
  const initial = capture();
  for (const [id, component, variants] of [[208, ant, [0, 1, 2, 3]], [210, ladybug, [-1, 0, 1, 2]]]) {
    for (const variant of variants) { restore(initial); putUint(8573024, 47); compare(id, [component, variant], `func${id} missing health/physics, variant=${variant}`); }
  }
});

test('collision bounds retain float32 geometry, child unions and memoization', async () => {
  const { allocate, putUint, putFloat, putDouble, bytes, compare, capture, restore } = await oracle();
  const entity = allocate(512), position = allocate(112), physics = allocate(56);
  const child = allocate(512), childPosition = allocate(112), childPhysics = allocate(56), link = allocate(136);
  putUint(entity + 168, position); putUint(physics, entity); putUint(child + 168, childPosition); putUint(childPhysics, child);
  putUint(entity + 84, link); putUint(link + 132, childPhysics); bytes[position + 80] = 1; bytes[childPosition + 80] = 1;
  const initial = capture();
  for (const value of [0, -0, 0.125, -2, 1e20, Infinity, NaN]) {
    for (const withChild of [false, true]) {
      restore(initial); putUint(entity + 84, withChild ? link : 0);
      putFloat(physics + 8, value); putDouble(position + 88, 1.234567890123); putDouble(position + 96, -34.0000007);
      putFloat(childPhysics + 8, 7.5); putDouble(childPosition + 88, -12.0000001); putDouble(childPosition + 96, 99.33333333333);
      compare(167, [physics], `bounds radius=${value}, child=${withChild}`);
      compare(167, [physics], `bounds cached radius=${value}, child=${withChild}`);
    }
  }
});

test('spawn collision queries traverse quadrants and apply player/circle filters', async () => {
  const { allocate, putUint, putFloat, putDouble, bytes, compare, capture, restore } = await oracle();
  const root = allocate(40), children = allocate(160), entity = allocate(512), position = allocate(112), physics = allocate(56);
  const list = allocate(4), rectangle = allocate(16), candidate = allocate(4), coordinates = allocate(16);
  putUint(entity + 168, position); putUint(physics, entity); bytes[position + 80] = 1;
  putFloat(root + 8, -100); putFloat(root + 12, -100); putFloat(root + 16, 200); putFloat(root + 20, 200);
  putUint(root + 36, children); putUint(list, physics); putUint(candidate, coordinates);
  putFloat(physics + 8, 20); putFloat(physics + 20, -20); putFloat(physics + 24, -20); putFloat(physics + 28, 40); putFloat(physics + 32, 40);
  putDouble(position + 88, 0); putDouble(position + 96, 0);
  const initial = capture();
  for (const quadrant of [-1, 0, 1, 2, 3]) {
    for (const player of [false, true]) {
      for (const distance of [0, 64.99, 65, 65.01, 500]) {
        restore(initial);
        const node = quadrant === -1 ? root : children + quadrant * 40;
        putUint(node + 24, 1); putUint(node + 32, list); bytes[entity + 95] = player ? 32 : 0;
        putDouble(coordinates, distance); putDouble(coordinates + 8, 0);
        putFloat(rectangle, -100); putFloat(rectangle + 4, -100); putFloat(rectangle + 8, 200); putFloat(rectangle + 12, 200);
        const result = compare(165, [root, rectangle, candidate], `spawn quadrant=${quadrant}, player=${player}, distance=${distance}`);
        assert.equal(result, player && distance < 65 ? 1 : 0);
      }
    }
  }
});

test('target selection respects arena gate, range, health, leash and shared ownership', async () => {
  const { runtime, u32, putUint, putFloat, putDouble, bytes, compare, capture, restore } = await oracle();
  runtime.exports.u(0, 0);
  const entity = runtime.call(144, 22928 + 1936, 1, 0, 0, -1), target = runtime.call(144, 22928 + 1936, 1, 0, 0, -1);
  runtime.call(703, entity);
  const ai = u32(entity + 104), position = u32(entity + 168), targetPosition = u32(target + 168), targetHealth = u32(target + 164);
  putFloat(ai + 120, 100); putFloat(ai + 124, 1); putFloat(ai + 140, 50); putFloat(ai + 104, 0);
  putDouble(position + 88, 0); putDouble(position + 96, 0); bytes[position + 80] = 1;
  putDouble(targetPosition + 96, 0); bytes[targetPosition + 80] = 1;
  const initial = capture();
  for (const x of [-10000, -100, 0, 50, 100, 100.00001, 10000, NaN]) {
    for (const currentHealth of [0, 0.125, NaN]) {
      for (const owner of [0, entity]) {
        restore(initial); putDouble(targetPosition + 88, x); putFloat(targetHealth + 8, currentHealth); putUint(ai + 164, owner);
        compare(168, [ai, target], `target x=${x}, health=${currentHealth}, owner=${owner}`);
      }
    }
  }
  restore(initial); bytes[target + 93] |= 64; putUint(target + 236, entity); putDouble(targetPosition + 88, 0);
  assert.equal(compare(168, [ai, target], 'target shares controlling root'), 0);
});

test('damage health notifications invalidate caches and attacker aggro respects flags', async () => {
  const { runtime, u32, putUint, putFloat, putDouble, allocate, bytes, compare, capture, restore } = await oracle();
  runtime.exports.u(0, 0);
  const entity = runtime.call(144, 22928 + 1936, 1, 0, 0, -1), attacker = runtime.call(144, 22928 + 1936, 1, 1, 0, -1);
  runtime.call(703, entity);
  const ai = u32(entity + 104), health = u32(entity + 164), index = u32(entity + 16) & 16383;
  for (const offset of [264876, 264880]) {
    const packet = allocate(32), payload = allocate(64); putUint(packet + 12, payload); putUint(22928 + (index << 3) + offset, packet);
  }
  compare(280, [health + 8], 'health field dirty notification and packet cache release');
  for (const actor of [entity, attacker]) {
    const position = u32(actor + 168); bytes[position + 80] = 1; putDouble(position + 88, 0); putDouble(position + 96, 0);
  }
  putFloat(ai + 120, 1000); putFloat(ai + 124, 1); putFloat(ai + 104, 0);
  const initial = capture();
  for (const enabled of [false, true]) {
    for (const player of [false, true]) {
      for (const hasController of [false, true]) {
        restore(initial); bytes[ai + 108] = enabled ? 1 : 0; bytes[ai + 109] = 0;
        bytes[attacker + 92] = player ? 32 : 0; bytes[attacker + 95] = 32; putUint(attacker + 120, hasController ? 1 : 0);
        compare(426, [entity, attacker], `aggro enabled=${enabled}, player=${player}, controller=${hasController}`);
      }
    }
  }
  restore(initial); compare(426, [entity, 0], 'aggro absent attacker');
});

test('damage health setters preserve tracking buffers, float bits and radius conversion', async () => {
  const { runtime, allocate, u32, putUint, putDouble, compare, capture, restore } = await oracle();
  runtime.exports.u(0, 0);
  const entity = runtime.call(144, 22928 + 1936, 1, 0, 0, -1), health = u32(entity + 164), physics = u32(entity + 188), source = allocate(16);
  const initial = capture();
  const bits = [0, 0x80000000, 0x3f800000, 0xbf800000, 0x7f800000, 0xff800000, 0x7fc00000, 0x7fc12345, 0x7f812345, 0xff812345];
  for (const [id, destination] of [[18, health + 8], [25, health + 12]]) {
    for (const previous of bits) {
      for (const next of bits) {
        restore(initial); putUint(destination, previous); putUint(source, next);
        compare(id, [destination, source], `tracked func${id} oldBits=${previous.toString(16)}, newBits=${next.toString(16)}`);
      }
    }
  }
  for (const previous of bits) {
    for (const next of [0, -0, 1, 1 + 2 ** -30, 1 / 3, -100, Infinity, -Infinity, NaN]) {
      restore(initial); putUint(physics + 8, previous); putDouble(source, next);
      compare(26, [physics + 8, source], `tracked radius oldBits=${previous.toString(16)}, new=${next}`);
    }
  }
});
