import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createEntityHooks, functionIds } from '../source/game/server/entities.mjs';

const dependencies = [
  14, 15, 16, 18, 25, 26, 64, 65, 67, 68, 74, 97, 102, 106, 114, 115, 116,
  128, 143, 144, 147, 148, 205, 206, 207, 208, 209, 210, 211, 265, 266, 415,
  416, 417, 418,
];

async function oracle() {
  const callbacks = [];
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencies],
    imports: { a: {
      a: (...args) => { callbacks.push(['a', ...args]); return 0; },
      b: (...args) => { callbacks.push(['b', ...args]); return 0; },
    } },
  });
  const bytes = Buffer.from(runtime.memory.buffer);
  const hooks = createEntityHooks(runtime);
  const view = new DataView(runtime.memory.buffer);

  function compare(id, args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    callbacks.length = 0;
    const expectedReturn = runtime.call(id, ...args);
    const expected = Buffer.from(bytes), expectedCallbacks = structuredClone(callbacks);
    const expectedStack = runtime.stackPointer.value;
    bytes.set(before); runtime.stackPointer.value = stack; callbacks.length = 0;
    const result = hooks[id](...args);
    assert.equal(result, expectedReturn, `${label}: return value`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack pointer`);
    assert.deepEqual(callbacks, expectedCallbacks, `${label}: host callback order/arguments`);
    if (Buffer.compare(bytes, expected) !== 0) {
      const differences = [];
      for (let address = 0; address < bytes.length && differences.length < 16; address++) {
        if (bytes[address] !== expected[address]) differences.push({ address, original: expected[address], recovered: bytes[address] });
      }
      assert.fail(`${label}: linear memory differs: ${JSON.stringify(differences)}`);
    }
  }
  return { runtime, bytes, view, hooks, compare };
}

test('all 22 recovered entity initializers equal original WASM in a populated game world', async () => {
  const { runtime, bytes, view, compare } = await oracle();
  runtime.exports.u(0, 0);
  const entity = runtime.call(144, 22928 + 1936, 1, 0, 0, -1);
  assert.ok(entity > 0);
  const baseline = Buffer.from(bytes), stack = runtime.stackPointer.value;
  for (let id = 697; id <= 718; id++) {
    bytes.set(baseline); runtime.stackPointer.value = stack;
    compare(id, [entity], `func${id} fresh species component`);
    // Run again with its component present and a nontrivial current/max ratio.
    const health = view.getUint32(entity + 164, true);
    view.setFloat32(health + 8, Math.fround(view.getFloat32(health + 12, true) * 0.4375), true);
    view.setUint32(8573024, 2147483646, true);
    compare(id, [entity], `func${id} existing species component and partially depleted health`);
  }
});

test('large initializers match from empty component pools, including heap allocation state', async () => {
  const { runtime, bytes, view, compare } = await oracle();
  const world = runtime.call(16, 530000), entity = runtime.call(16, 512), position = runtime.call(16, 128);
  bytes.fill(0, world, world + 530000); bytes.fill(0, entity, entity + 512); bytes.fill(0, position, position + 128);
  for (const offset of [48, 92, 136, 348, 392, 436, 524, 1044, 1132, 1176, 1220, 1264, 1308, 1352, 1396, 1440, 1644, 1688, 1776]) {
    view.setUint32(world + offset, 1024, true);
  }
  view.setUint32(world + 2140, 37, true); view.setUint32(entity, world, true);
  view.setUint32(entity + 16, 123, true); view.setUint32(entity + 168, position, true); view.setUint32(position, entity, true);
  const baseline = Buffer.from(bytes), stack = runtime.stackPointer.value;
  for (const id of [697, 700, 705, 713, 716]) {
    for (const seed of [1, 47, 123456789, 2147483646, 0xffffffff]) {
      bytes.set(baseline); runtime.stackPointer.value = stack; view.setUint32(8573024, seed, true);
      compare(id, [entity], `func${id} empty pools, RNG seed ${seed}`);
    }
  }
});

test('rock/beetle family profiles match seeded sizes and variant coercion', async () => {
  const { runtime, bytes, view, compare } = await oracle();
  runtime.exports.u(0, 0);
  const entity = runtime.call(144, 22928 + 1936, 1, 0, 0, -1);
  runtime.call(707, entity);
  const baseline = Buffer.from(bytes), stack = runtime.stackPointer.value;
  for (const [id, offset] of [[415, 152], [417, 108]]) {
    for (const variant of [0, 1, -1, 0x80000000]) {
      for (const seed of [1, 47, 123456789, 2147483646, 0xffffffff]) {
        bytes.set(baseline); runtime.stackPointer.value = stack;
        view.setUint32(8573024, seed, true);
        compare(id, [view.getUint32(entity + offset, true), variant], `profile func${id}, variant=${variant}, seed=${seed}`);
      }
    }
  }
});

test('ant-hole free-slot heap ordering and serialized packet invalidation match', async () => {
  const { runtime, bytes, view, compare } = await oracle();
  runtime.exports.u(0, 0);
  const entity = runtime.call(144, 22928 + 1936, 1, 0, 0, -1);
  const pool = 22928 + 436, heap = runtime.call(16, 128), slots = runtime.call(16, 256);
  const baseline = Buffer.from(bytes), stack = runtime.stackPointer.value;
  for (const freeCount of [1, 2, 3, 4, 7, 8, 15, 17]) {
    bytes.set(baseline); runtime.stackPointer.value = stack;
    view.setUint32(entity + 136, 0, true);
    view.setUint32(pool + 16, freeCount, true); view.setUint32(pool + 24, heap, true);
    // Descending addresses are a valid maximum heap; replacing the root by the
    // last element exercises each sift-down level in the recovered pool.
    for (let index = 0; index < freeCount; index++) view.setUint32(heap + index * 4, slots + (freeCount - index - 1) * 12, true);
    const index = view.getUint32(entity + 16, true) & 16383;
    for (const offset of [264876, 264880]) {
      const packet = runtime.call(16, 32), payload = runtime.call(16, 64);
      bytes.fill(0, packet, packet + 32); view.setUint32(packet + 12, payload, true);
      view.setUint32(22928 + (index << 3) + offset, packet, true);
    }
    compare(708, [entity], `ant-hole free heap length=${freeCount}, populated packet caches`);
  }
});

test('species-definition constructor preserves copy order, padding and default fields', async () => {
  const { runtime, bytes, view, compare } = await oracle();
  const scratch = runtime.call(16, 4096), output = scratch + 1024, descriptions = scratch + 64, drops = scratch + 512;
  for (let index = 0; index < 4096; index++) bytes[scratch + index] = (index * 137 + 29) & 255;
  const baseline = Buffer.from(bytes);
  for (const count of [0, 1, 4, 8]) {
    for (const dropCount of [0, 1, 6, 8]) {
      for (const radius of [0, -0, 25.125, Infinity, NaN]) {
        bytes.set(baseline);
        view.setUint32(scratch, descriptions, true); view.setUint32(scratch + 4, count, true); view.setUint8(drops, dropCount);
        compare(56, [output, 3208, scratch, 5, radius, drops, 74], `definition descriptions=${count}, drops=${dropCount}, radius=${radius}`);
      }
    }
  }
  // These exercise actual overlapping forward copies rather than a slice/copy.
  for (const [source, destination] of [[output + 4, output + 8], [output + 12, output + 8]]) {
    bytes.set(baseline); view.setUint32(scratch, source, true); view.setUint32(scratch + 4, 4, true); view.setUint8(drops, 0);
    compare(56, [destination - 8, 17, scratch, 1, 12, drops, 70], 'definition overlapping descriptions');
  }
});

test('healing matches dead/alive, clamp, behavior veto and ownership gates', async () => {
  const { runtime, bytes, view, compare } = await oracle();
  runtime.exports.u(0, 0);
  const entity = runtime.call(144, 22928 + 1936, 1, 0, 0, -1);
  const health = view.getUint32(entity + 164, true), owner = runtime.call(16, 512);
  const behaviorSet = runtime.call(16, 64), behavior = runtime.call(16, 16), virtualTable = runtime.call(16, 32), pointers = runtime.call(16, 16);
  bytes.fill(0, owner, owner + 512); bytes.fill(0, behaviorSet, behaviorSet + 64);
  view.setUint32(behavior, virtualTable, true); view.setUint32(pointers, behavior, true);
  const tableIndexes = {};
  for (let index = 0; index < runtime.table.length; index++) {
    const name = runtime.table.get(index)?.name;
    if (name === '117') tableIndexes.veto = index; // original returnTrue
    if (name === '76') tableIndexes.allow = index; // original returnZero
  }
  assert.ok(tableIndexes.veto >= 0 && tableIndexes.allow >= 0);
  const baseline = Buffer.from(bytes), stack = runtime.stackPointer.value;
  for (const current of [-1, 0, 0.25, 7, 25, Infinity, NaN]) {
    for (const amount of [-Infinity, -30, -1.25, 0, 0.125, 30, Infinity, NaN]) {
      bytes.set(baseline); runtime.stackPointer.value = stack;
      view.setFloat32(health + 8, current, true); view.setFloat32(health + 12, 25, true);
      compare(216, [health, amount], `heal current=${current}, amount=${amount}`);
    }
  }
  for (const list of [0, 1]) {
    for (const veto of [false, true]) {
      bytes.set(baseline); runtime.stackPointer.value = stack;
      view.setUint32(entity + 192, behaviorSet, true);
      view.setUint32(behaviorSet + (list ? 28 : 16), 1, true); view.setUint32(behaviorSet + (list ? 36 : 24), pointers, true);
      view.setUint32(virtualTable + 16, veto ? tableIndexes.veto : tableIndexes.allow, true);
      view.setFloat32(health + 8, 4, true); view.setFloat32(health + 12, 25, true);
      compare(216, [health, 2.5], `heal behavior list=${list}, veto=${veto}`);
    }
  }
  for (const flags of [0, 32, 64]) {
    for (const linked of [false, true]) {
      for (const ownerEnabled of [false, true]) {
        bytes.set(baseline); runtime.stackPointer.value = stack;
        view.setUint32(entity + 200, 1, true); view.setUint8(entity + 92, flags === 32 ? 32 : 0);
        view.setUint8(entity + 93, flags === 64 ? 64 : 0);
        view.setUint32(entity + 236, linked ? owner : 0, true); view.setUint32(entity + 224, owner, true);
        view.setUint8(owner + 92, 32); view.setUint32(owner + 120, ownerEnabled ? 1 : 0, true);
        view.setUint32(entity + 120, ownerEnabled ? 1 : 0, true); view.setFloat32(health + 8, 4, true);
        compare(216, [health, 2.5], `heal owner flags=${flags}, linked=${linked}, enabled=${ownerEnabled}`);
      }
    }
  }
});
