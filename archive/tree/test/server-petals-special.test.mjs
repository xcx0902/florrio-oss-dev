import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { createSpecialPetalHooks, functionIds } from '../source/game/server/petals-special.mjs';

const dependencies = [14, 15, 16, 17, 18, 20, 21, 25, 26, 34, 43, 44, 47, 64, 65,
  67, 68, 73, 74, 77, 78, 85, 96, 97, 106, 118, 128, 144, 147, 148, 150, 151,
  217, 218, 271, 275, 276, 277, 278];
let time = 5000;
async function oracle() {
  const events = [];
  const runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencies],
    imports: { a: {
      a: (code, ...args) => { events.push(['a', code, ...args]); return code === 22855 ? time : 0; },
      b: (...args) => { events.push(['b', ...args]); return 0; },
    } },
  });
  runtime.exports.u(0, 0);
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer);
  const hooks = createSpecialPetalHooks(runtime), world = 22928;
  const entity = runtime.call(144, world + 1936, 1, 300, 400, -1);
  const petal = runtime.call(128, world + 268);
  view.setUint32(entity + 124, petal, true); view.setUint32(petal, entity, true);
  view.setUint32(petal + 4, view.getUint32(world + 2140, true), true);
  view.setUint32(petal + 20, 0, true); view.setUint32(petal + 12, 0, true);
  view.setUint8(petal + 8, 0); view.setUint32(petal + 15, 0, true);
  runtime.call(218, entity, petal);
  const context = runtime.call(16, 16), ownerContext = runtime.call(16, 16), output = runtime.call(16, 8);
  view.setUint32(context, entity, true); view.setUint32(context + 4, ownerContext, true);
  view.setUint32(ownerContext, entity, true); view.setUint8(ownerContext + 10, 1);
  const behavior = runtime.call(16, 32);
  function compare(id, args, label) {
    const before = Buffer.from(bytes), stack = runtime.stackPointer.value;
    events.length = 0;
    const expectedReturn = runtime.call(id, ...args), expected = Buffer.from(bytes);
    const expectedEvents = structuredClone(events), expectedStack = runtime.stackPointer.value;
    bytes.set(before); runtime.stackPointer.value = stack; events.length = 0;
    const result = hooks[id](...args);
    assert.equal(result, expectedReturn, `${label}: return`);
    assert.equal(runtime.stackPointer.value, expectedStack, `${label}: stack`);
    assert.deepEqual(events, expectedEvents, `${label}: host calls`);
    if (!bytes.equals(expected)) {
      let at = 0;
      while (at < bytes.length && bytes[at] === expected[at]) at++;
      assert.fail(`${label}: memory ${at}, original=${expected.subarray(at, at + 32).toString('hex')}, recovered=${bytes.subarray(at, at + 32).toString('hex')}`);
    }
    return result;
  }
  function initialize(type) {
    runtime.call(217, petal, -1, -1, type);
    const activeBehavior = view.getUint32(petal + 20, true);
    view.setUint8(activeBehavior + 8, 1); view.setFloat64(activeBehavior + 16, 0, true);
    return activeBehavior;
  }
  return { runtime, bytes, view, world, entity, petal, context, ownerContext, output, behavior, compare, initialize };
}

test('all Peas variants reproduce real four-child creation and deferred launch scheduling', async () => {
  const o = await oracle();
  for (const [id, type] of [[431, 34], [676, 11], [681, 12]]) {
    const behavior = o.initialize(type);
    o.compare(id, [o.output, behavior, o.context], `Peas func${id} split`);
    o.compare(id, [o.output, behavior, o.context], `Peas func${id} already split`);
  }
});

test('Egg variants hatch real entities and update ownership and movement components', async () => {
  const o = await oracle();
  for (const [id, type] of [[693, 22], [719, 23]]) {
    const behavior = o.initialize(type);
    o.compare(id, [o.output, behavior, o.context], `Egg func${id} hatch`);
    o.compare(id, [o.output, behavior, o.context], `Egg func${id} already hatched`);
  }
});

test('Web collision creates a world entity with collision, health, lifetime and slow effect', async () => {
  const o = await oracle();
  const behavior = o.initialize(29);
  o.view.setUint8(behavior + 4, 1);
  o.compare(732, [behavior, o.entity, 0], 'Web active hit');
  o.view.setUint8(behavior + 4, 0);
  o.compare(732, [behavior, o.entity, 0], 'Web inactive hit');
});

test('Cactus incoming-hit and Peas R4 poison match source handles, lifetime and effect insertion', async () => {
  const o = await oracle();
  const effects = o.runtime.call(16, 64);
  o.view.setUint32(o.entity + 192, effects, true);
  for (const id of [691, 747]) {
    const args = id === 691 ? [o.behavior, 0, o.entity, o.entity] : [o.behavior, o.entity, o.entity];
    o.compare(id, args, `poison func${id}`);
  }
});

test('Peas launch callbacks reproduce clone, allocation, handle destruction and f32 impulses', async () => {
  const o = await oracle();
  for (const [split, type, copy, allocate, destroy] of [[676, 11, 673, 674, 675], [681, 12, 677, 678, 679], [431, 34, 741, 742, 743]]) {
    const behavior = o.initialize(type);
    o.compare(split, [o.output, behavior, o.context], `callback setup ${split}`);
    const scheduled = o.view.getUint32(o.view.getUint32(o.world + 1920, true) - 4, true);
    const callback = o.view.getUint32(scheduled + 16, true);
    for (let count = 0; count <= 4; count++) {
      const baseline = Buffer.from(o.bytes), stack = o.runtime.stackPointer.value;
      o.view.setUint8(callback + 8, count);
      o.view.setFloat32(callback + 4, count === 0 ? NaN : count * 1e8, true);
      const destination = o.runtime.call(16, 60);
      o.compare(copy, [callback, destination], `callback ${copy} count ${count}`);
      const clone = o.compare(allocate, [callback], `callback ${allocate} count ${count}`);
      o.compare(272, [clone], `deferred launch count ${count}`);
      o.compare(destroy, [clone], `callback ${destroy} count ${count}`);
      o.compare(146, [clone], `callback free count ${count}`);
      o.compare(273, [destination], `callback clear count ${count}`);
      o.bytes.set(baseline); o.runtime.stackPointer.value = stack;
    }
  }
});

test('Peas cooldown, absent owner, consumed state, RNG seeds and partial entity exhaustion match', async () => {
  const o = await oracle();
  for (const [id, type] of [[431, 34], [676, 11], [681, 12]]) {
    const behavior = o.initialize(type), baseline = Buffer.from(o.bytes), stack = o.runtime.stackPointer.value;
    for (let sample = 0; sample < 20; sample++) {
      o.bytes.set(baseline); o.runtime.stackPointer.value = stack;
      time = sample < 3 ? [500, 500.00000001, 499.99999999][sample] : 5000;
      o.view.setUint8(o.ownerContext + 10, sample % 4);
      o.view.setUint8(behavior + 4, sample === 4 ? 1 : 0);
      o.view.setUint8(behavior + 8, sample === 5 ? 0 : 1);
      if (sample === 6) o.view.setUint32(o.context + 4, 0, true);
      o.view.setUint32(8573024, [1, 2147483646, 0xffffffff, 123456789][sample % 4], true);
      // Detach the remaining free chain after N entries, preserving the actual
      // entity nodes. The split must still schedule and remove itself at N=0..3.
      if (sample >= 8 && sample < 12) {
        const available = sample - 8;
        let node = o.view.getUint32(o.world + 2152, true);
        if (!available) o.view.setUint32(o.world + 2152, 0, true);
        else {
          for (let i = 1; i < available; i++) node = o.view.getUint32(node + 8, true);
          o.view.setUint32(node + 8, 0, true);
        }
        o.view.setUint32(o.world + 2148, available, true);
        o.view.setUint8(o.ownerContext + 10, 1);
      }
      o.compare(id, [o.output, behavior, o.context], `Peas ${id}, sample ${sample}`);
    }
  }
});

test('Egg cooldown boundaries and absent owner distinguish one-second and 2.5-second hatches', async () => {
  const o = await oracle();
  for (const [id, type, delay] of [[693, 22, 1000], [719, 23, 2500]]) {
    const behavior = o.initialize(type), baseline = Buffer.from(o.bytes), stack = o.runtime.stackPointer.value;
    for (const [now, valid, consumed] of [[delay, 1, 0], [delay + 1e-8, 1, 0], [delay - 1e-8, 1, 0], [5000, 0, 0], [5000, 1, 1]]) {
      o.bytes.set(baseline); o.runtime.stackPointer.value = stack; time = now;
      o.view.setUint8(behavior + 8, valid); o.view.setUint8(behavior + 24, consumed);
      o.view.setUint32(o.context + 4, 0, true);
      o.compare(id, [o.output, behavior, o.context], `Egg ${id}, clock ${now}, valid ${valid}, consumed ${consumed}`);
    }
  }
});

test('poison tick packet and effect handle destructors match their original callback ABI', async () => {
  const o = await oracle(), effects = o.runtime.call(16, 64), packet = o.runtime.call(16, 8);
  o.view.setUint32(o.entity + 192, effects, true);
  for (const id of [745, 746]) {
    o.compare(747, [o.behavior, o.entity, o.entity], `poison setup for ${id}`);
    const count = o.view.getUint32(effects + 16, true), items = o.view.getUint32(effects + 24, true);
    const effect = o.view.getUint32(items + (count - 1) * 4, true);
    o.compare(744, [packet, effect], `poison damage packet for ${id}`);
    o.compare(id, [effect], `poison destructor ${id}`);
  }
});
