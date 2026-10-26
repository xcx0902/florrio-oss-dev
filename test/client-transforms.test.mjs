import test from "node:test";

import assert from "node:assert/strict";

import { loadOriginal } from "./helpers/wasm-probe.mjs";

import { createClientTransformHooks, functionIds } from "../source/game/client/transforms.mjs";

async function oracle() {
  let runtime, now = 160, throwAt = 0, mutateHost;
  const events = [];
  function host(address, signature, pointer) {
    const view = new DataView(runtime.memory.buffer);
    events.push({
      address: address,
      signature: signature,
      pointer: pointer,
      bytes: Buffer.from(new Uint8Array(runtime.memory.buffer, pointer, 16)).toString("hex")
    });
    if (throwAt === events.length) throw new Error("clock failure");
    mutateHost?.(address, events.length, view);
    if (address === 150328) return view.getFloat64(pointer, true) % view.getFloat64(pointer + 8, true);
    return address === 141250 ? 1 : now;
  }
  runtime = await loadOriginal("client", {
    functionIds: [ ...functionIds, 368, 372, 403, 407 ],
    imports: {
      a: {
        a: host,
        c: host
      }
    }
  });
  const bytes = Buffer.from(runtime.memory.buffer), view = new DataView(runtime.memory.buffer), hooks = createClientTransformHooks(runtime);
  const word = (a, v) => view.setUint32(a, v, true), float = (a, v) => view.setFloat32(a, v, true), double = (a, v) => view.setFloat64(a, v, true);
  const allocate = size => {
    const p = runtime.call(368, size);
    bytes.fill(0, p, p + size);
    return p;
  };
  const state = allocate(3e3), handle = allocate(4), record = allocate(160);
  word(state + 264, handle);
  word(handle, record);
  float(state + 900, 1e3);
  float(state + 988, 800);
  float(state + 2048, -2.5);
  float(state + 2052, 7.75);
  function entity() {
    const entity = allocate(448), transform = allocate(184), bounds = allocate(64);
    word(entity, state);
    word(entity + 120, transform);
    word(entity + 140, bounds);
    word(transform, entity);
    word(bounds, entity);
    double(transform + 8, .3);
    double(transform + 16, -.4);
    double(transform + 32, 100);
    float(transform + 64, 32.25);
    float(transform + 68, -5.5);
    double(transform + 80, 100);
    float(transform + 40, -28.75);
    float(transform + 44, 3.25);
    double(transform + 56, 100);
    float(bounds + 8, 4);
    float(bounds + 12, 2);
    double(bounds + 24, 100);
    return {
      entity: entity,
      transform: transform,
      bounds: bounds
    };
  }
  const capture = () => ({
    memory: Buffer.from(bytes),
    stack: runtime.stackPointer.value
  });
  const restore = s => {
    bytes.set(s.memory);
    runtime.stackPointer.value = s.stack;
  };
  function compare(id, args, label) {
    const before = capture();
    events.length = 0;
    let expectedReturn, actualReturn, expectedError, actualError;
    try {
      expectedReturn = runtime.call(id, ...args);
    } catch (e) {
      expectedError = [ e.constructor.name, e.message ];
    }
    const expected = capture(), expectedEvents = structuredClone(events);
    restore(before);
    events.length = 0;
    try {
      actualReturn = hooks[id](...args);
    } catch (e) {
      actualError = [ e.constructor.name, e.message ];
    }
    assert.deepEqual(actualError, expectedError, `${label}: exception`);
    assert.equal(actualReturn, expectedReturn, `${label}: return`);
    assert.deepEqual(events, expectedEvents, `${label}: host calls and live arguments`);
    assert.equal(runtime.stackPointer.value, expected.stack, `${label}: stack`);
    if (!bytes.equals(expected.memory)) {
      const differences = [];
      for (let i = 0; i < bytes.length && differences.length < 20; i++) if (bytes[i] !== expected.memory[i]) differences.push({
        address: i,
        original: expected.memory[i],
        recovered: bytes[i]
      });
      assert.fail(`${label}: memory ${JSON.stringify(differences)}`);
    }
    return {
      result: expectedReturn,
      error: expectedError
    };
  }
  return {
    runtime: runtime,
    bytes: bytes,
    view: view,
    word: word,
    float: float,
    double: double,
    allocate: allocate,
    state: state,
    record: record,
    entity: entity,
    capture: capture,
    restore: restore,
    compare: compare,
    configure(time, throws = 0, mutation) {
      now = time;
      throwAt = throws;
      mutateHost = mutation;
    }
  };
}

test("client coordinates match independent interpolation flags, clock boundaries and local-player constraints", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, float: float, double: double, record: record, entity: entity, capture: capture, restore: restore, compare: compare, configure: configure} = o;
  const node = entity(), initial = capture();
  for (let flags = 0; flags < 8; flags++) for (const player of [ false, true ]) for (const now of [ 0, 100, 160, 220, 1e3, NaN ]) for (const coordinate of [ 32.25, 1e3 ]) {
    restore(initial);
    configure(now);
    word(record + 144, player ? node.entity : 0);
    bytes[node.transform + 72] = flags & 1;
    bytes[node.transform + 48] = flags >>> 1 & 1;
    bytes[node.transform + 24] = flags >>> 2 & 1;
    float(node.transform + 64, coordinate);
    float(node.transform + 40, -coordinate);
    double(node.transform + 32, 100);
    const result = compare(409, [ node.transform ], `flags=${flags},player=${player},now=${now},coordinate=${coordinate}`);
    assert.equal(result.error, undefined);
  }
}));

test("client transforms retain recursive parents, exact rotation epsilon and absolute local angles", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, float: float, double: double, entity: entity, capture: capture, restore: restore, compare: compare} = o;
  const root = entity(), parent = entity(), child = entity();
  bytes[parent.entity + 46] = 64;
  word(parent.entity + 176, root.entity);
  bytes[child.entity + 46] = 64;
  word(child.entity + 176, parent.entity);
  const initial = capture();
  for (const angle of [ 0, -0, 2 ** -53, -(2 ** -52), 2 ** -52, Math.PI / 2, Math.PI, 1e20, Infinity, NaN ]) for (const cached of [ false, true ]) for (const absolute of [ 0, 1 ]) {
    restore(initial);
    for (const [index, node] of [ root, parent, child ].entries()) {
      float(node.transform + 64, (index + 1) * 9.87654);
      float(node.transform + 40, (index + 1) * -3.14159);
      double(node.transform + 8, index ? angle / 3 : angle);
    }
    bytes[parent.transform + 144] = cached ? 1 : 0;
    double(parent.transform + 152, 23.123456789);
    double(parent.transform + 160, -49.123456789);
    double(parent.transform + 168, angle);
    word(child.transform + 176, absolute);
    assert.equal(compare(409, [ child.transform ], `angle=${angle},cached=${cached},absolute=${absolute}`).error, undefined);
  }
  for (const ownership of [ 0, 64 ]) for (const absent of [ false, true ]) {
    restore(initial);
    bytes[child.entity + 46] = ownership;
    word(child.entity + 176, absent ? 0 : parent.entity);
    compare(409, [ child.transform ], `ownership=${ownership},absent=${absent}`);
  }
}));

test("client visual bounds match cached states and interpolated radius and position", (async () => {
  const o = await oracle(), {bytes: bytes, float: float, double: double, entity: entity, capture: capture, restore: restore, compare: compare, configure: configure} = o;
  const node = entity(), initial = capture();
  for (const cached of [ false, true ]) for (const radiusInterpolated of [ false, true ]) for (const positionInterpolated of [ false, true ]) for (const now of [ 100, 160, 220, NaN ]) for (const radius of [ 0, 4, -3, Infinity ]) {
    restore(initial);
    configure(now);
    bytes[node.bounds + 36] = cached ? 1 : 0;
    bytes[node.bounds + 16] = radiusInterpolated ? 1 : 0;
    bytes[node.transform + 72] = positionInterpolated ? 1 : 0;
    bytes[node.transform + 48] = positionInterpolated ? 1 : 0;
    float(node.bounds + 8, radius);
    double(node.bounds + 24, 100);
    assert.equal(compare(672, [ node.bounds ], `cached=${cached},radiusInterpolated=${radiusInterpolated},positionInterpolated=${positionInterpolated},now=${now},radius=${radius}`).error, undefined);
  }
}));

// Fixtures populate the archived implementation's intrusive owner index. The
// native result must include both children's extents, proving this path runs.
function fixtureHash(pointer) {
  let h = Math.imul(pointer, 1540483477);
  h = Math.imul(h >>> 24 ^ h, 1540483477) ^ 1866966612;
  h = Math.imul(h >>> 13 ^ h, 1540483477);
  return (h >>> 15 ^ h) >>> 0;
}

test("client visual bounds merge owned child ranges through power-of-two and prime bucket collisions", (async () => {
  const o = await oracle(), {bytes: bytes, word: word, float: float, double: double, allocate: allocate, state: state, entity: entity, capture: capture, restore: restore, compare: compare} = o;
  const root = entity(), children = [ entity(), entity() ], buckets = allocate(64), sentinel = allocate(16), nodes = Array.from({
    length: 5
  }, (() => allocate(16)));
  const initial = capture();
  for (const count of [ 1, 2, 3, 4, 5, 7, 8 ]) for (const childCached of [ false, true ]) for (const mode of [ "range", "missing-child", "empty-bucket", "empty-chain", "other-bucket" ]) {
    restore(initial);
    float(root.transform + 64, 0);
    float(root.transform + 40, 0);
    children.forEach(((child, index) => {
      float(child.bounds + 8, index ? 11 : 7);
      float(child.transform + 64, index ? 45 : -100);
      float(child.transform + 40, index ? 60 : -25);
      bytes[child.bounds + 36] = childCached ? 1 : 0;
      for (const [offset, value] of [ [ 40, index ? 34 : -107 ], [ 44, index ? 49 : -32 ], [ 48, index ? 22 : 14 ], [ 52, index ? 22 : 14 ] ]) float(child.bounds + offset, value);
    }));
    const hash = fixtureHash(root.entity), powerOfTwo = (count & count - 1) === 0, bucket = powerOfTwo ? hash & count - 1 : hash % count;
    word(state + 2220, buckets);
    word(state + 2224, count);
    word(buckets + bucket * 4, mode === "empty-bucket" ? 0 : sentinel);
    word(sentinel, mode === "empty-chain" ? 0 : nodes[0]);
    for (let i = 0; i < nodes.length; i++) {
      word(nodes[i], nodes[i + 1] ?? 0);
      word(nodes[i] + 4, hash);
      word(nodes[i] + 8, i === 2 || i === 3 ? root.entity : root.entity + 4);
      word(nodes[i] + 12, i === 3 ? children[1].entity : children[0].entity);
    }
    word(nodes[0] + 4, hash + count >>> 0);
    if (mode === "other-bucket" && count > 1) word(nodes[0] + 4, hash + 1 >>> 0);
    if (mode === "missing-child") word(children[0].entity + 140, 0);
    const result = compare(672, [ root.bounds ], `count=${count},cached=${childCached},mode=${mode}`);
    assert.equal(result.error, undefined);
    if (mode === "range") {
      assert.equal(o.view.getFloat32(root.bounds + 40, true), -107);
      assert.equal(o.view.getFloat32(root.bounds + 44, true), -32);
      assert.equal(o.view.getFloat32(root.bounds + 48, true), 163);
      assert.equal(o.view.getFloat32(root.bounds + 52, true), 103);
    }
  }
}));

test("client angular interpolation preserves nearest windings, full-precision endpoints and host remainder", (async () => {
  const o = await oracle(), {bytes: bytes, double: double, allocate: allocate, capture: capture, restore: restore, compare: compare, configure: configure} = o, angle = allocate(32), initial = capture();
  const values = [ 0, -0, 1e-15, -1e-15, Math.PI, -Math.PI, 2 * Math.PI, -2 * Math.PI, 1e20, Infinity, NaN ];
  for (const previous of values) for (const current of values) for (const now of [ 100, 160, 220 ]) {
    restore(initial);
    configure(now);
    bytes[angle + 16] = 1;
    double(angle, current);
    double(angle + 8, previous);
    double(angle + 24, 100);
    assert.equal(compare(705, [ angle ], `${previous}->${current},now=${now}`).error, undefined);
  }
  for (const current of values) {
    restore(initial);
    double(angle, current);
    compare(705, [ angle ], `no interpolation ${current}`);
  }
}));

test("client transforms retain clock mutations, host failures, bounds traps and partial cache writes", (async () => {
  const o = await oracle(), {runtime: runtime, bytes: bytes, word: word, entity: entity, capture: capture, restore: restore, compare: compare, configure: configure} = o;
  const node = entity(), initial = capture();
  for (const id of [ 409, 672, 705 ]) for (const pointer of [ -1, bytes.length - 4 ]) {
    restore(initial);
    compare(id, [ pointer ], `invalid func${id}/${pointer}`);
  }
  for (const id of [ 409, 672, 705 ]) for (const throws of [ 1, 2, 3 ]) {
    restore(initial);
    bytes[node.transform + 72] = 1;
    bytes[node.transform + 48] = 1;
    bytes[node.transform + 24] = 1;
    bytes[node.bounds + 16] = 1;
    configure(160, throws);
    compare(id, [ id === 409 ? node.transform : id === 672 ? node.bounds : node.transform + 8 ], `host failure func${id}/${throws}`);
  }
  for (const id of [ 409, 672 ]) {
    restore(initial);
    configure(160, 0, ((address, index, view) => {
      if (address !== 141314) return;
      view.setUint8(node.transform + 72, 0);
      view.setUint8(node.transform + 48, 0);
      view.setUint8(node.bounds + 16, 0);
    }));
    bytes[node.transform + 72] = 1;
    bytes[node.transform + 48] = 1;
    bytes[node.bounds + 16] = 1;
    compare(id, [ id === 409 ? node.transform : node.bounds ], `clock mutation func${id}`);
  }
  configure(160);
  restore(initial);
  word(node.transform, bytes.length - 40);
  compare(409, [ node.transform ], "entity flags trap after cache write");
  restore(initial);
  word(node.bounds, bytes.length - 100);
  compare(672, [ node.bounds ], "transform pointer trap after bounds-cache write");
  for (const id of [ 409, 672, 705 ]) {
    restore(initial);
    compare(id, [ runtime.stackPointer.value - 16 ], `scratch alias func${id}`);
  }
}));
