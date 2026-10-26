import test from 'node:test';
import assert from 'node:assert/strict';
import { createPetalHooks, functionIds } from '../source/game/server/petals.mjs';
import { loadOriginal } from './helpers/wasm-probe.mjs';

const dependencies = [14, 16, 17, 18, 20, 21, 25, 26, 34, 43, 44, 47, 85, 94, 95, 118, 149, 164, 216];
let time = 2000;
let timeReads = null;
async function oracle() {
  let runtime;
  runtime = await loadOriginal('sp_server', {
    functionIds: [...functionIds, ...dependencies],
    imports: { a: { a(code, signature, args) {
      if (code === 22855) return timeReads?.length ? timeReads.shift() : time;
      if (code === 22903) {
        const view = new DataView(runtime.memory.buffer);
        return view.getFloat64(args, true) % view.getFloat64(args + 8, true);
      }
      return 0;
    } } },
  });
  return runtime;
}
const original = await oracle(), recovered = await oracle();
const hooks = createPetalHooks(recovered);
const initializers = [411, 412, 414, 432, 433, 434, 435, 662, 664, 668, 670, 672, 685, 687, 690, 694, 720, 724, 726, 727, 728, 734, 739, 740];
const simpleOrbits = [119, 413, 661, 663, 667, 725];
const addresses = {};
for (const runtime of [original, recovered]) {
  const world = runtime.call(16, 500000);
  const fixture = runtime.call(16, 20000);
  const expected = { world, fixture };
  if (addresses.world) assert.deepEqual(expected, { world: addresses.world, fixture: addresses.fixture });
  else Object.assign(addresses, expected);
}
Object.assign(addresses, {
  entity: addresses.fixture, owner: addresses.fixture + 512,
  context: addresses.fixture + 1024, ownerContext: addresses.fixture + 1040,
  behavior: addresses.fixture + 1088, output: addresses.fixture + 1152,
  health: addresses.fixture + 1200, ownerHealth: addresses.fixture + 1264,
  combat: addresses.fixture + 1328, transform: addresses.fixture + 1408,
  ownerTransform: addresses.fixture + 1536, slot: addresses.fixture + 1664,
  loadout: addresses.fixture + 1728, effects: addresses.fixture + 3200,
  items: addresses.fixture + 3264, flower: addresses.fixture + 8000,
});
const baseline = Buffer.from(new Uint8Array(original.memory.buffer));
const stack = original.stackPointer.value;
function reset() {
  time = 2000;
  timeReads = null;
  for (const runtime of [original, recovered]) {
    new Uint8Array(runtime.memory.buffer).set(baseline);
    runtime.stackPointer.value = stack;
    const view = new DataView(runtime.memory.buffer), a = addresses;
    const word = (at, value) => view.setUint32(at, value, true);
    const float = (at, value) => view.setFloat32(at, value, true);
    const double = (at, value) => view.setFloat64(at, value, true);
    for (const [entity, health, transform, id] of [[a.entity, a.health, a.transform, 1], [a.owner, a.ownerHealth, a.ownerTransform, 2]]) {
      word(entity, a.world); word(entity + 16, id);
      word(entity + 124, a.slot); word(entity + 164, health); word(entity + 168, transform);
      word(entity + 188, a.combat);
      word(health, entity); word(transform, entity);
      float(health + 8, 5); float(health + 12, 10);
      view.setUint8(transform + 80, 1);
      float(transform + 16, 3); float(transform + 20, 4);
      double(transform + 88, 3); double(transform + 96, 4);
    }
    word(a.entity + 236, a.owner); view.setUint8(a.entity + 93, 64);
    word(a.combat, a.entity); float(a.combat + 8, 8);
    word(a.context, a.entity); word(a.context + 4, a.ownerContext); float(a.context + 8, 16.67);
    word(a.ownerContext, a.owner);
    word(a.slot, a.entity);
    word(a.owner + 200, a.loadout); word(a.owner + 120, a.flower); view.setUint8(a.owner + 92, 32);
    view.setUint8(a.loadout + 20, 1);
    const handle = a.loadout + 296;
    word(handle, a.entity); word(handle + 4, handle); word(handle + 8, handle);
    double(a.ownerTransform + 88, 1); double(a.ownerTransform + 96, 2);
    word(a.world + 2140, 7);
    view.setUint8(a.behavior + 8, 1); double(a.behavior + 16, 1000);
    word(8573024, 123456789);
  }
}
function both(change) { for (const runtime of [original, recovered]) change(new DataView(runtime.memory.buffer), runtime); }
function compare(id, args, label) {
  const expected = original.call(id, ...args);
  const result = hooks[id](...args);
  assert.equal(result, expected, `${label}: return`);
  assert.equal(recovered.stackPointer.value, original.stackPointer.value, `${label}: stack`);
  const left = Buffer.from(original.memory.buffer), right = Buffer.from(recovered.memory.buffer);
  if (!left.equals(right)) {
    let offset = 0;
    while (offset < left.length && left[offset] === right[offset]) offset++;
    assert.fail(`${label}: memory differs at ${offset}: original ${left.subarray(offset, offset + 24).toString('hex')}, recovered ${right.subarray(offset, offset + 24).toString('hex')}`);
  }
}
function compareTrap(id, args, label) {
  let expected, actual;
  try { original.call(id, ...args); } catch (error) { expected = error; }
  try { hooks[id](...args); } catch (error) { actual = error; }
  assert.ok(expected instanceof WebAssembly.RuntimeError, `${label}: original trap`);
  assert.ok(actual instanceof WebAssembly.RuntimeError, `${label}: recovered trap`);
  assert.equal(recovered.stackPointer.value, original.stackPointer.value, `${label}: stack at trap`);
  assert.ok(Buffer.from(original.memory.buffer).equals(Buffer.from(recovered.memory.buffer)), `${label}: memory at trap`);
}
let state = 0x8172c35d;
function random() { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; }

test('all 24 petal initializers preserve every memory byte, dirty notifications, ratio, and timestamp', () => {
  const values = [0, -0, -1, 1, 7.25, 1e-45, 1e-30, Infinity, -Infinity, NaN];
  for (const id of initializers) {
    for (let sample = 0; sample < 24; sample++) {
      reset();
      const maximum = sample < values.length ? values[sample] : Math.fround(random() * 10000);
      const current = sample < values.length ? values[values.length - sample - 1] : Math.fround(random() * maximum);
      both(view => {
        view.setFloat32(addresses.health + 8, current, true);
        view.setFloat32(addresses.health + 12, maximum, true);
      });
      compare(id, [addresses.behavior, addresses.entity], `initializer ${id}, ${current}/${maximum}`);
    }
  }
});

test('six steady orbit methods preserve ABI and all 256 input combinations', () => {
  reset();
  for (const id of simpleOrbits) {
    for (let input = -1; input < 256; input++) {
      both(view => {
        view.setUint32(addresses.context + 4, input === -1 ? 0 : addresses.ownerContext, true);
        view.setUint8(addresses.ownerContext + 10, input);
        view.setBigUint64(addresses.output, 0xa5a5a5a5a5a5a5a5n, true);
      });
      compare(id, [addresses.output, addresses.behavior, addresses.context], `orbit ${id}, input ${input}`);
    }
  }
});

test('wing oscillation preserves f32 roundings and original libm behavior over large timer ranges', () => {
  for (let sample = 0; sample < 72; sample++) {
    reset();
    time = sample < 8 ? [0, 500, 1000, 1000.0001, 2000, 1e12, Infinity, NaN][sample] : random() * 1e9;
    both(view => {
      view.setUint8(addresses.ownerContext + 10, sample % 4);
      view.setUint8(addresses.behavior + 8, sample % 5 !== 0 ? 1 : 0);
      if (sample % 7 === 0) view.setUint32(addresses.context + 4, 0, true);
    });
    compare(669, [addresses.output, addresses.behavior, addresses.context], `wing sample ${sample}`);
  }
});

test('missile, dandelion, pollen, web and bubble match cooldown, launch, vector, slot and lifetime effects', () => {
  const cases = [
    [0, 0, 0, 2000, 0], [1, 3, 4, 1500, 0], [3, 3, 4, 1500.0001, 0],
    [2, 3, 4, 2000, 0], [1, 0, 0, 2000, 0], [1, 1e-18, -1e-18, 2000, 0],
    [1, 2 ** -52, 0, 2000, 0], [1, 1e150, -1e150, 2000, 0],
    [3, -3, -4, 2000, 1], [1, 3, 4, 2000, 2],
  ];
  for (const id of [671, 689, 686, 733, 684]) {
    for (let sample = 0; sample < 48; sample++) {
      reset();
      const [input, x, y, now, mode] = sample < cases.length ? cases[sample]
        : [sample % 4, random() * 200 - 100, random() * 200 - 100, 2000, 0];
      time = now;
      both(view => {
        view.setUint8(addresses.ownerContext + 10, input);
        view.setFloat64(addresses.transform + 88, x, true);
        view.setFloat64(addresses.transform + 96, y, true);
        view.setFloat64(addresses.ownerTransform + 88, 0, true);
        view.setFloat64(addresses.ownerTransform + 96, 0, true);
        view.setFloat32(addresses.health + 8, 0, true); // Damage callback's valid already-dead case.
        view.setUint8(addresses.behavior + 4, mode === 1 ? 1 : 0);
        view.setUint8(addresses.behavior + 8, mode === 2 ? 0 : 1);
        view.setUint32(8573024, Math.floor(random() * 2147483646) + 1, true);
      });
      // both() deliberately calls its callback twice: use one common random seed.
      const seed = new DataView(original.memory.buffer).getUint32(8573024, true);
      new DataView(recovered.memory.buffer).setUint32(8573024, seed, true);
      compare(id, [addresses.output, addresses.behavior, addresses.context], `projectile ${id}, sample ${sample}`);
    }
  }
});

test('rose variants match delayed healing, movement, consumption and state completion', () => {
  for (const id of [665, 682, 723]) {
    for (let sample = 0; sample < 40; sample++) {
      reset();
      time = sample % 4 === 0 ? 2000 : 2000.0001;
      both(view => {
        view.setUint8(addresses.ownerContext + 10, sample % 4);
        view.setUint32(addresses.behavior + 4, sample < 12 ? sample : 0, true);
        view.setFloat32(addresses.health + 8, 0, true);
        view.setFloat32(addresses.context + 8, sample < 12 ? [-1, 0, 1e-9, 16.7, 1e9, Infinity, -Infinity, NaN, 16.7, 16.7, 16.7, 16.7][sample] : Math.fround(sample / 3), true);
        if (sample % 5 === 0) view.setUint8(addresses.behavior + 8, 0);
        if (sample % 7 === 0) view.setFloat32(addresses.ownerHealth + 8, 10, true);
        if (sample % 11 === 0) view.setFloat32(addresses.ownerHealth + 8, 0, true);
      });
      compare(id, [addresses.output, addresses.behavior, addresses.context], `rose ${id}, sample ${sample}`);
    }
  }
});

test('poison, healing suppression and honey effects preserve allocation, expiry, source handles and vector growth', () => {
  for (const id of [666, 680, 688, 692, 738]) {
    for (let sample = 0; sample < 8; sample++) {
      reset();
      both(view => {
        view.setUint32(addresses.entity + 192, addresses.effects, true);
        if (sample & 1) {
          view.setUint32(addresses.effects + 20, 1024, true);
          view.setUint32(addresses.effects + 24, addresses.items, true);
        }
        if (sample & 2) {
          // A linked source list permits the poison handle insertion branch.
          view.setUint32(addresses.owner + 4, addresses.owner, true);
          view.setUint32(addresses.owner + 12, addresses.owner + 4, true);
          view.setUint32(addresses.flower, addresses.owner, true);
        }
      });
      compare(id, [addresses.behavior, sample & 4 ? addresses.entity : 0, addresses.entity], `hit ${id}, sample ${sample}`);
      compare(id, [addresses.behavior, sample & 4 ? addresses.entity : 0, addresses.entity], `repeat hit ${id}, sample ${sample}`);
    }
  }
});

test('status arrays grow with live prior elements and preserve the unique pointer move order', () => {
  for (const id of [666, 680, 688, 692, 738]) {
    reset();
    for (const runtime of [original, recovered]) {
      const items = runtime.call(16, 4), effect = runtime.call(20, 24);
      const view = new DataView(runtime.memory.buffer);
      view.setUint32(effect, 6116, true); view.setUint8(effect + 8, 1);
      view.setFloat64(effect + 16, 10000, true);
      view.setUint32(items, effect, true);
      view.setUint32(addresses.effects + 16, 1, true);
      view.setUint32(addresses.effects + 20, 1, true);
      view.setUint32(addresses.effects + 24, items, true);
      view.setUint32(addresses.entity + 192, addresses.effects, true);
    }
    compare(id, [addresses.behavior, 0, addresses.entity], `effect array growth ${id}`);
  }
});

test('rose healing consults active and pending effect lists and ownership ancestors', () => {
  for (const id of [665, 682, 723]) {
    for (let sample = 0; sample < 8; sample++) {
      reset();
      time = 3000;
      both(view => {
        view.setFloat32(addresses.health + 8, 0, true);
        view.setUint32(addresses.owner + 192, addresses.effects, true);
        view.setUint32(addresses.effects + (sample & 1 ? 28 : 16), 1, true);
        view.setUint32(addresses.effects + (sample & 1 ? 36 : 24), addresses.items, true);
        view.setUint32(addresses.items, addresses.items + 16, true);
        view.setUint32(addresses.items + 16, sample & 2 ? 6116 : 6592, true);
        if (sample & 4) {
          view.setUint8(addresses.owner + 92, 0);
          view.setUint8(addresses.owner + 93, 0);
        }
      });
      compare(id, [addresses.output, addresses.behavior, addresses.context], `rose effects ${id}, sample ${sample}`);
    }
  }
});

test('memory bounds and malformed effect virtual dispatch preserve WASM traps and partial writes', () => {
  for (const [id, args] of [
    [119, [addresses.output, 0, -1]],
    [119, [original.memory.buffer.byteLength - 4, 0, addresses.context]],
    [433, [addresses.behavior, -1]],
    [670, [-1, addresses.entity]],
    [671, [original.memory.buffer.byteLength - 4, addresses.behavior, addresses.context]],
    [669, [original.memory.buffer.byteLength - 4, addresses.behavior, addresses.context]],
  ]) {
    reset();
    compareTrap(id, args, `memory trap ${id}`);
  }
  for (const index of [0, 102, 528, 0xffffffff]) {
    reset();
    time = 3000;
    both(view => {
      view.setUint32(addresses.owner + 192, addresses.effects, true);
      view.setUint32(addresses.effects + 16, 1, true);
      view.setUint32(addresses.effects + 24, addresses.items, true);
      view.setUint32(addresses.items, addresses.items + 16, true);
      view.setUint32(addresses.items + 16, addresses.items + 32, true);
      view.setUint32(addresses.items + 48, index, true);
    });
    compareTrap(665, [addresses.output, addresses.behavior, addresses.context], `virtual trap index ${index}`);
  }
});
