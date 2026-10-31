import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotDecoder } from '../../../build/client/state/snapshot.js';
import { DenseGroupDecoder, DensePlanDecoder } from '../support/dense-codec.mjs';
import { DENSE_GROUP_SPECS } from '../../../build/client/state/field-types.js';
import { WorldState } from '../../../build/client/state/world.js';
import { interpolateCameraTarget, interpolateEntity } from '../../../build/client/state/interpolation.js';

test('pickup constructor marker survives position deltas before the first render and resets on deletion', () => {
  const world = new WorldState();
  const drop = { handle: 91, typeId: 7, kind: 4, x: 0, y: 0, angle: 0, health: 0, maxHealth: 0, flags: 129 };
  const apply = (entities, deletedHandles = []) => world.applyDeltaSnapshot({ sequence: 1, serverTime: 0, entities, events: [], deletedHandles }, 100);
  apply([drop]); apply([{ ...drop, flags: 2, x: 1 }]);
  assert.equal(world.get(91).flags, 2);
  assert.equal(world.get(91).arrivalMarked, true);
  apply([], [91]); apply([{ ...drop, flags: 1 }]);
  assert.equal(world.get(91).arrivalMarked, false, 'old scene pickups stay settled');
});

function varint(value) {
  const bytes = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function f32(value) {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  return [...new Uint8Array(buffer)];
}

function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** One mask entry using the same field order as the C++ domain writer. */
function domainPacket(handle = 0x12345678) {
  const bytes = [
    1,
    ...varint(42),
    ...varint(7),
    ...varint(0), // deletes
    ...varint(1), // updates
    ...varint(1), // events
    ...u32(handle),
    55, // flags=1 XOR 54
    ...u32((1 << 0) | (1 << 1) | (1 << 19) | (1 << 20)),
    ...varint(2), 4, // field 2 species id
    ...varint(3), ...f32(123), // field 5 x
    ...varint(3), ...u16(0x4000), // field 8 raw angle
    ...varint(16), ...f32(-45), // field 24 y
    ...varint(2), 2, // field 26 domain kind
    ...varint(5), 0, // field 31 variant
    ...varint(22), ...f32(17), // field 53 health
    ...varint(2), ...f32(25), // field 55 maximum health
    0, // field terminator
    11, ...u32(handle), // entity-time event
  ];
  return { bytes: Uint8Array.from(bytes), handle };
}

test('original mask entry projects species, kind, health and maximum', () => {
  const { bytes, handle } = domainPacket();
  const snapshot = new SnapshotDecoder().decode(bytes);
  assert.ok(snapshot);
  assert.equal(snapshot.sequence, 42);
  assert.equal(snapshot.entities.length, 1);
  const entity = snapshot.entities[0];
  assert.equal(entity.handle, handle);
  assert.equal(entity.typeId, 2);
  assert.equal(entity.kind, 2);
  assert.equal(snapshot.entities[0].speciesId, 4);
  assert.equal(entity.x, 123);
  assert.equal(entity.y, -45);
  assert.equal(entity.health, 17);
  assert.equal(entity.maxHealth, 25);
  assert.equal(entity.healthKnown, true);
  assert.equal(entity.maxHealthKnown, true);
  assert.ok(Math.abs(entity.angle - Math.PI / 2) < 1e-3);
});

test('schema component locations project progression, variant, radius and known zero health', () => {
  const handle = 0x76543210;
  const values = [[2, [4]], [7, f32(9.25)], [26, [2]], [31, [3]],
    [53, f32(0)], [55, f32(25)], [58, varint(32768)], [59, f32(1234.5)], [62, [9]]];
  let previous = 0;
  const fields = values.flatMap(([field, encoded]) => {
    const result = [...varint(field - previous), ...encoded]; previous = field; return result;
  });
  const snapshot = new SnapshotDecoder().decode(Uint8Array.from([
    1, 1, 0, 0, 1, 0, ...u32(handle), 55, ...u32(0), ...fields, 0,
  ]));
  assert.ok(snapshot);
  const entity = snapshot.entities[0];
  assert.deepEqual({ species: entity.speciesId, kind: entity.kind, variant: entity.variant,
    radius: entity.radius, health: entity.health, max: entity.maxHealth,
    healthKnown: entity.healthKnown, maxKnown: entity.maxHealthKnown, level: entity.level,
    progress: entity.levelProgress, score: entity.score },
  { species: 4, kind: 2, variant: 3, radius: 9.25, health: 0, max: 25,
    healthKnown: true, maxKnown: true, level: 9, progress: 32768 / 65535, score: 1234.5 });
});

test('visual position, camera follow and collider radius use distinct original fields', () => {
  const handle = 0x12345678;
  const fields = [[5, 100], [7, 25], [24, 200], [28, -40], [49, -90]];
  let previous = 0;
  const payload = fields.flatMap(([field, value]) => {
    const bytes = [...varint(field - previous), ...f32(value)];
    previous = field;
    return bytes;
  });
  const bytes = Uint8Array.from([1, 1, 0, 0, 1, 0, ...u32(handle), 55,
    ...u32((1 << 5) | (1 << 20) | (1 << 25)), ...payload, 0]);
  const decoder = new SnapshotDecoder();
  const snapshot = decoder.decode(bytes);
  assert.ok(snapshot);
  const entity = snapshot.entities[0];
  assert.deepEqual([entity.x, entity.y, entity.cameraX, entity.cameraY, entity.radius], [-90, -40, 100, 200, 25]);
  const world = new WorldState();
  world.applyDeltaSnapshot(snapshot, 0);
  // A camera-only update must not move artwork or restart its clocks.
  const camera = decoder.decode(Uint8Array.from([1, 2, 0, 0, 1, 0,
    ...u32(handle), 52, 5, ...f32(300), 19, ...f32(400), 0]));
  assert.ok(camera);
  world.applyDeltaSnapshot(camera, 60);
  assert.deepEqual(interpolateEntity(world.get(handle), 120), { x: -90, y: -40, angle: 0, radius: 25 });
  assert.deepEqual(interpolateCameraTarget(world.get(handle), 120), { x: 200, y: 300 });
  assert.equal(world.get(handle).radius, 25);
});

test('dense convenience decoders preserve coordinate semantics, removals and full framing', () => {
  const specs = [5, 7, 24, 28, 49].map(field => ({ field, type: 'f32' }));
  const bytes = Uint8Array.from([1, 1, 0, 1, 1, 0, ...u32(7),
    ...u32(8), 62, ...[100, 25, 200, -40, -90].flatMap(f32)]);
  for (const decoder of [new DenseGroupDecoder(specs), new DensePlanDecoder([{ offset: 120, specs }], new Set([120]))]) {
    const snapshot = decoder.decode(bytes);
    assert.ok(snapshot);
    const entity = snapshot.entities[0];
    assert.deepEqual([entity.x, entity.y, entity.cameraX, entity.cameraY, entity.radius], [-90, -40, 100, 200, 25]);
    assert.deepEqual(snapshot.deletedHandles, [7]);
    assert.equal(decoder.decode(Uint8Array.from([...bytes, 0])), null);
  }
});

test('authoritative deletion removes artwork immediately (no flash-back)', () => {
  const world = new WorldState(), { bytes, handle } = domainPacket();
  world.applyDeltaSnapshot(new SnapshotDecoder().decode(bytes), 0);
  world.applyDeltaSnapshot({ sequence: 43, serverTime: 0, entities: [], events: [], deletedHandles: [handle] }, 100);
  assert.equal(world.get(handle), undefined);
  assert.equal(world.count, 0);
  assert.equal([...world.all()].length, 0);
  assert.equal([...world.renderable(100)].length, 0);
  assert.equal([...world.renderable(249)].length, 0);
  assert.equal([...world.renderable(250)].length, 0);
  world.applyDeltaSnapshot(new SnapshotDecoder().decode(bytes), 300);
  assert.equal([...world.renderable(300)].length, 1);
  world.reset();
  assert.equal([...world.renderable(300)].length, 0);
});

test('indexed visual effects do not reset the independent hit and camera-shake clock', () => {
  const world = new WorldState();
  const update = (events, at) => world.applyDeltaSnapshot({ sequence: at, serverTime: 0, entities: [], events }, at);
  update([{ opcode: 14, handle: 7, index: 3 }], 100);
  assert.equal(world.hitTime(7), undefined);
  assert.equal(world.hitFlash(7, 100), 0);
  update([{ opcode: 11, handle: 7 }], 200);
  assert.equal(world.hitFlash(7, 200), 1);
  update([{ opcode: 14, handle: 7, index: 4 }], 250);
  assert.equal(world.hitTime(7), 200);
  assert.equal(world.hitFlash(7, 275), 0.5);
  assert.equal(world.visualIndex(7, 275), 4);
  assert.equal(world.hitFlash(7, 350), 0);
});

test('applyPartial merges health without dropping prior position', () => {
  const world = new WorldState();
  const { bytes, handle } = domainPacket();
  world.applyDeltaSnapshot(new SnapshotDecoder().decode(bytes), 0);
  const first = world.get(handle);
  assert.ok(first);
  assert.equal(first.health, 17);
  assert.equal(first.maxHealth, 25);
  assert.equal(first.typeId, 2);

  // A sparse update carrying only health must preserve the earlier position.
  const healthOnly = Uint8Array.from([
    1,
    ...varint(43),
    ...varint(0),
    ...varint(0),
    ...varint(1),
    ...varint(0),
    ...u32(handle),
    55,
    ...u32(1 << 19),
    ...varint(53), ...f32(9),
    0,
  ]);
  const snapshot = new SnapshotDecoder().decode(healthOnly);
  assert.ok(snapshot);
  world.applyDeltaSnapshot(snapshot, 16);
  const merged = world.get(handle);
  assert.ok(merged);
  assert.equal(merged.health, 9);
  assert.equal(merged.x, 123);
  assert.equal(merged.y, -45);
  assert.equal(merged.typeId, 2);
});


test('event block decodes chat, entity time and visual opcodes', () => {
  const handle = 0x12345678;
  const bytes = Uint8Array.from([
    1,
    ...varint(50),
    ...varint(0),
    ...varint(0), // deletes
    ...varint(0), // updates
    ...varint(3), // events
    9, ...Array.from(new TextEncoder().encode('hello')), 0,
    11, ...u32(handle),
    14, ...u32(handle), 3,
  ]);
  const snapshot = new SnapshotDecoder().decode(bytes);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.events, [
    { opcode: 9, text: 'hello' },
    { opcode: 11, handle },
    { opcode: 14, handle, index: 3 },
  ]);
});

test('world stores chat lines and visual hit indices', () => {
  const handle = 0x12345678;
  const bytes = Uint8Array.from([
    1,
    ...varint(51),
    ...varint(0),
    ...varint(0),
    ...varint(0),
    ...varint(2),
    9, ...Array.from(new TextEncoder().encode('garden')), 0,
    14, ...u32(handle), 3,
  ]);
  const snapshot = new SnapshotDecoder().decode(bytes);
  assert.ok(snapshot);
  const world = new WorldState();
  world.applyFullSnapshot(snapshot, 100);
  assert.deepEqual(world.chat, ['garden']);
  assert.equal(world.visualIndex(handle, 100), 3);
  assert.equal(world.visualIndex(handle, 400), 0);
});

test('dense groups use native component-pointer presence from the mask entry', () => {
  const handle = 0x22334455;
  const dense = DENSE_GROUP_SPECS[72];
  const bytes = [
    1,
    ...varint(52),
    ...varint(0),
    ...varint(0), // deletes
    ...varint(2), // updates
    ...varint(0), // events
    ...u32(handle),
    55, // mask entry
    ...u32(1 << 5), // component ordinal 6 -> dense group offset 72
    ...varint(2), 4, // species id
    0, // field terminator
    ...u32(handle),
    62, // dense existing-component entry (8 XOR 54)
    1, // field 1
    ...f32(10), // field 5 x
    ...Array.from(new TextEncoder().encode('x')), 0, // field 6
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, // field 16 byteArray10
    20, // field 20
    ...f32(0), // field 21
    ...f32(30), // field 24 y
    ...f32(40), // field 32
    34, // field 34
    47, // field 47
    ...u32(0), // field 56 reference
  ];
  const decoder = new SnapshotDecoder([{ offset: 72, specs: dense }]);
  const snapshot = decoder.decode(Uint8Array.from(bytes));
  assert.ok(snapshot);
  // The mask entry and the dense entry are two update records for one handle;
  // WorldState.applyPartial merges them. Inspect the dense record here.
  const entity = snapshot.entities[1];
  assert.equal(entity.x, 10);
  assert.equal(entity.y, 30);
  assert.equal(snapshot.entities[0].speciesId, 4);
  assert.equal(entity.denseFields[32], 40);
  assert.equal(entity.denseFields[20], 20);
});

test('live profile fields project and merge XP, score and displayed level', () => {
  const handle = 0x12345678;
  const mask = (1 << 29) >>> 0;
  const bytes = Uint8Array.from([
    1, ...varint(44), ...varint(0), ...varint(0), ...varint(1), ...varint(0),
    ...u32(handle), 55, ...u32(mask),
    ...varint(58), ...varint(49151),
    ...varint(1), ...f32(43),
    ...varint(3), 20, 0,
  ]);
  const decoder = new SnapshotDecoder();
  const snapshot = decoder.decode(bytes);
  assert.ok(snapshot);
  const player = snapshot.entities[0];
  assert.equal(player.level, 20);
  assert.equal(player.score, 43);
  assert.equal(player.levelProgress, 49151 / 65535);
  const world = new WorldState();
  world.applyDeltaSnapshot(snapshot, 0);
  const { bytes: update } = domainPacket(handle);
  world.applyDeltaSnapshot(decoder.decode(update), 50);
  assert.equal(world.get(handle).level, 20);
  assert.equal(world.get(handle).score, 43);
  assert.equal(world.get(handle).levelProgress, 49151 / 65535);
});

test('delta interpolation starts at the displayed value and keeps independent clocks', async () => {
  const { interpolateEntity } = await import('../../../build/client/state/interpolation.js');
  const world = new WorldState();
  const put = (x, at, fields = { 5: x, 24: 0 }) => world.applyDeltaSnapshot({ sequence: at + 1,
    serverTime: at, entities: [{ handle: 1, typeId: 2, kind: 2, x, y: 0,
      angle: 0, health: 10, maxHealth: 10, flags: 0, floatFields: fields }], events: [] }, at);
  put(0, 0);
  put(120, 50);
  assert.equal(interpolateEntity(world.get(1), 100).x, 50);
  put(240, 100);
  assert.equal(interpolateEntity(world.get(1), 100).x, 50, 'a new target preserves continuity');
  assert.equal(interpolateEntity(world.get(1), 160).x, 145);
  put(0, 130, { 53: 9 });
  assert.equal(interpolateEntity(world.get(1), 160).x, 145, 'health does not restart motion');
});

test('delta snapshots retain omitted entities and apply explicit removals', () => {
  const world = new WorldState();
  const entity = handle => ({ handle, typeId: 2, kind: 2, x: 0, y: 0,
    angle: 0, health: 10, maxHealth: 10, flags: 0, floatFields: { 5: 0, 24: 0 } });
  world.applyDeltaSnapshot({ sequence: 1, serverTime: 0, entities: [entity(1), entity(2)], events: [] }, 0);
  world.applyDeltaSnapshot({ sequence: 2, serverTime: 50, entities: [entity(1)], events: [] }, 50);
  assert.equal(world.count, 2);
  world.applyDeltaSnapshot({ sequence: 3, serverTime: 100, entities: [], deletedHandles: [2], events: [] }, 100);
  assert.equal(world.count, 1);
  assert.equal(world.get(2), undefined);
});

test('decoders reject trailing bytes and non-finite values', () => {
  const { bytes } = domainPacket();
  const decoder = new SnapshotDecoder();
  assert.equal(decoder.decode(Uint8Array.from([...bytes, 0])), null);
  const bad = bytes.slice();
  const position = bad.findIndex((_, i) => bad[i] === 3 && bad[i + 1] === 0 && bad[i + 2] === 0 && bad[i + 3] === 246 && bad[i + 4] === 66);
  assert.ok(position > 0);
  bad.set(f32(NaN), position + 1);
  assert.equal(decoder.decode(bad), null);
});

test('failed packets roll back component masks before the next dense update', () => {
  const handle = 0x12345678;
  const decoder = new SnapshotDecoder([{ offset: 52, specs: [{ field: 22, type: 'byte' }, { field: 54, type: 'byte' }] }]);
  const mask = Uint8Array.from([1, 1, 0, 0, 1, 0, ...u32(handle), 55, ...u32(1 << 0), 0]);
  assert.ok(decoder.decode(mask));
  // A truncated replacement mask must not erase the previous component.
  assert.equal(decoder.decode(Uint8Array.from([1, 2, 0, 0, 1, 0, ...u32(handle), 55, ...u32(0)])), null);
  const dense = Uint8Array.from([1, 3, 0, 0, 1, 0, ...u32(handle), 62, 7, 9]);
  const snapshot = decoder.decode(dense);
  assert.ok(snapshot);
  assert.deepEqual(snapshot.entities[0].denseFields, { 22: 7, 54: 9 });
});

test('sparse field boundaries accept 1 and 63 and reject direct or accumulated overflow', () => {
  const packet = fields => Uint8Array.from([1, 1, 0, 0, 1, 0,
    ...u32(0x12345678), 55, ...u32(1), ...fields, 0]);
  const decoder = new SnapshotDecoder();
  assert.deepEqual(decoder.decode(packet([1, 7, 62, 9])).entities[0].byteFields, { 1: 7, 63: 9 });
  for (const fields of [[64, 7], [63, 9, 1, 7], [...varint(0xffffffff), 7]]) {
    assert.equal(decoder.decode(packet(fields)), null, `invalid field bytes: ${fields}`);
  }
});

test('out-of-range fields cannot install masks or enable dense groups on a fresh decoder', () => {
  const handle = 0x12345678;
  const decoder = new SnapshotDecoder([{ offset: 52, specs: DENSE_GROUP_SPECS[52] }]);
  const dense = values => Uint8Array.from([1, 2, 0, 0, 1, 0, ...u32(handle), 62, ...values]);
  const before = decoder.decode(dense([]));
  assert.equal(decoder.decode(dense([2, 0])), null);
  // Exact audit vector: the old decoder rewrote field 64 to 1 and committed mask 1.
  assert.equal(decoder.decode(Uint8Array.from(Buffer.from('010100000100785634123701000000400700', 'hex'))), null);
  assert.deepEqual(decoder.decode(dense([])), before);
  assert.equal(decoder.decode(dense([2, 0])), null);
});

test('invalid sparse fields roll back deletions, earlier records and ordinal presence together', () => {
  const first = 7, second = 8, added = 9;
  const decoder = new SnapshotDecoder([{ offset: 52, specs: DENSE_GROUP_SPECS[52] }]);
  assert.ok(decoder.decode(Uint8Array.from([1, 1, 0, 0, 2, 0,
    ...u32(first), 55, ...u32(1), 0,
    ...u32(second), 55, ...u32(0), 0])));
  const dense = (handle, values) => Uint8Array.from([1, 3, 0, 0, 1, 0, ...u32(handle), 62, ...values]);
  const firstBefore = decoder.decode(dense(first, [7, 9]));
  const secondBefore = decoder.decode(dense(second, []));
  const addedBefore = decoder.decode(dense(added, []));
  assert.ok(firstBefore); assert.ok(secondBefore); assert.ok(addedBefore);
  assert.equal(decoder.decode(Uint8Array.from([1, 2, 0, 1, 3, 0, ...u32(first),
    ...u32(first), 55, ...u32(0), 0, // Valid replacement after deletion.
    ...u32(second), 54, 0, 1, 0, // Valid ordinal 1 addition, then terminators.
    ...u32(added), 55, ...u32(1), 64, 7, 0])), null);
  assert.deepEqual(decoder.decode(dense(first, [7, 9])), firstBefore);
  assert.deepEqual(decoder.decode(dense(second, [])), secondBefore);
  assert.deepEqual(decoder.decode(dense(added, [])), addedBefore);
  assert.equal(decoder.decode(dense(second, [7, 9])), null);
  assert.equal(decoder.decode(dense(added, [7, 9])), null);
});

test('a sparse record without angle leaves its interpolation clock unchanged', () => {
  const decoder = new SnapshotDecoder();
  const world = new WorldState();
  const { bytes, handle } = domainPacket();
  world.applyDeltaSnapshot(decoder.decode(bytes), 0);
  const update = Uint8Array.from([1, 43, 0, 0, 1, 0, ...u32(handle), 52,
    ...varint(53), ...f32(9), 0]);
  const snapshot = decoder.decode(update);
  assert.ok(snapshot);
  assert.equal(snapshot.entities[0].angleField8, undefined);
  world.applyDeltaSnapshot(snapshot, 50);
  assert.equal(world.get(handle).receivedAngleAt, 0);
  assert.equal(world.get(handle).angle, Math.PI * 2 * 0x4000 / 65535);
});

test('sparse angle updates replace a previously dense angle', () => {
  const world = new WorldState();
  const base = { handle: 21, typeId: 2, kind: 2, x: 0, y: 0,
    health: 10, maxHealth: 10, flags: 0 };
  const put = (at, record) => world.applyDeltaSnapshot({ sequence: at, serverTime: at,
    entities: [{ ...base, ...record }], events: [] }, at);
  const initial = 8192 * (2 * Math.PI / 65535);
  const next = 16384 * (2 * Math.PI / 65535);
  put(0, { angle: initial, denseFields: { 8: 8192 } });
  put(120, { angle: next, angleField8: next });
  assert.equal(world.get(21).angle, next);
  assert.equal(world.get(21).previousAngle, initial);
  assert.equal(world.get(21).receivedAngleAt, 120);
  put(180, { angle: 0, byteFields: { 36: 1 } });
  assert.equal(world.get(21).angle, next);
  assert.equal(world.get(21).receivedAngleAt, 120);
  assert.equal(interpolateEntity(world.get(21), 240).angle, next);
});

test('dense fields replace older sparse flags in the current component view', () => {
  const world = new WorldState();
  const base = { handle: 22, typeId: 2, kind: 2, x: 0, y: 0, angle: 0,
    health: 10, maxHealth: 10, flags: 0 };
  const put = (at, record) => world.applyDeltaSnapshot({ sequence: at, serverTime: at,
    entities: [{ ...base, ...record }], events: [] }, at);
  put(0, { byteFields: { 14: 1, 36: 1 }, floatFields: { 49: 0, 28: 0 } });
  put(50, { x: 10, y: 20, denseFields: { 14: 0, 36: 0, 49: 10, 28: 20 } });
  assert.deepEqual(world.get(22).byteFields, { 14: 0, 36: 0 });
  assert.deepEqual(world.get(22).floatFields, { 49: 10, 28: 20 });
  put(100, { byteFields: { 14: 2, 36: 1 } });
  assert.deepEqual(world.get(22).byteFields, { 14: 2, 36: 1 });
  assert.deepEqual(interpolateEntity(world.get(22), 170), { x: 10, y: 20, angle: 0 });
});

test('the first controlled player follows the existing menu camera from zero', () => {
  const world = new WorldState();
  world.applyDeltaSnapshot({ sequence: 1, serverTime: 1504, events: [], entities: [{
    handle: 23, typeId: 1, kind: 1, x: -24870.875, y: -918.9522094726562,
    cameraX: -24870.875, cameraY: -918.9522094726562, angle: 0,
    health: 100, maxHealth: 100, flags: 128,
    floatFields: { 5: -24870.875, 24: -918.9522094726562,
      49: -24870.875, 28: -918.9522094726562 },
  }] }, 1520);
  const player = world.get(23);
  assert.deepEqual(interpolateCameraTarget(player, 1520), { x: 0, y: 0 });
  assert.deepEqual(interpolateCameraTarget(player, 1640), { x: player.x, y: player.y });
  assert.equal(interpolateEntity(player, 1520).x, player.x);
  assert.equal(interpolateEntity(player, 1520).y, player.y);
  world.applyDeltaSnapshot({ sequence: 2, serverTime: 1700, events: [], entities: [], deletedHandles: [23] }, 1700);
  world.applyDeltaSnapshot({ sequence: 3, serverTime: 1800, events: [], entities: [{
    ...player, handle: 24, x: -24000, y: -1000, cameraX: -24000, cameraY: -1000,
    floatFields: { 5: -24000, 24: -1000, 49: -24000, 28: -1000 },
    denseFields: undefined,
  }] }, 1800);
  assert.deepEqual(interpolateCameraTarget(world.get(24), 1800), { x: player.x, y: player.y });
});

test('radius retargets from its displayed value with an independent field-seven clock', async () => {
  const { interpolateEntity } = await import('../../../build/client/state/interpolation.js');
  const world = new WorldState();
  const put = (radius, at, fields) => world.applyDeltaSnapshot({ sequence: at + 1, serverTime: at,
    entities: [{ handle: 9, typeId: 2, kind: 2, x: 0, y: 0, angle: 0,
      radius, health: 10, maxHealth: 10, flags: 0, floatFields: fields }], events: [] }, at);
  put(30, 0, { 7: 30 });
  put(60, 50, { 7: 60 });
  assert.equal(interpolateEntity(world.get(9), 110).radius, 45);
  put(90, 110, { 7: 90 });
  assert.equal(interpolateEntity(world.get(9), 110).radius, 45);
  put(undefined, 120, { 53: 9 });
  assert.equal(world.get(9).receivedRadiusAt, 110);
  assert.equal(interpolateEntity(world.get(9), 170).radius, 67.5);
});

test('visual fade follows field38 rather than a zero-health heuristic', () => {
  const world = new WorldState();
  const put = (at, extra) => world.applyDeltaSnapshot({ sequence: at + 1, serverTime: at,
    entities: [{ handle: 12, typeId: 2, kind: 2, x: 0, y: 0, angle: 0,
      health: 0, maxHealth: 10, flags: 0, ...extra }], events: [] }, at);
  put(0, {});
  assert.equal(world.get(12).fadingAt, undefined);
  put(50, { byteFields: { 38: 1 } });
  assert.equal(world.get(12).fadingAt, 50);
  put(100, { byteFields: { 38: 1 } });
  assert.equal(world.get(12).fadingAt, 50, 'repeated flag does not restart the fade');
  assert.equal(world.count, 1, 'invisible artwork can remain an authoritative entity');
});

test('score field retargets continuously and health updates retain its clock', () => {
  const world = new WorldState();
  const put = (score, at, fields) => world.applyDeltaSnapshot({ sequence: at + 1, serverTime: at,
    entities: [{ handle: 13, typeId: 1, kind: 1, x: 0, y: 0, angle: 0,
      health: 10, maxHealth: 10, flags: 0, score, floatFields: fields }], events: [] }, at);
  put(0, 0, { 59: 0 }); put(120, 50, { 59: 120 }); put(240, 110, { 59: 240 });
  assert.equal(world.get(13).previousScore, 60);
  put(undefined, 120, { 53: 9 });
  assert.equal(world.get(13).receivedScoreAt, 110);
  assert.equal(world.get(13).score, 240);
});

test('indexed inventory and recharge deltas merge without losing omitted elements', () => {
  const world = new WorldState();
  const put = (at, extra) => world.applyDeltaSnapshot({ sequence: at + 1, serverTime: at,
    entities: [{ handle: 14, typeId: 1, kind: 1, x: 0, y: 0, angle: 0,
      health: 10, maxHealth: 10, flags: 0, ...extra }], events: [] }, at);
  put(0, { byteArrayFields: { 60: [{ index: 0, value: 1 }, { index: 6, value: 11 }] },
    shortArrayFields: { 61: [{ index: 0, value: 65535 }, { index: 1, value: 12345 }] } });
  put(50, { byteArrayFields: { 60: [{ index: 0, value: 0 }] } });
  assert.deepEqual(world.get(14).byteArrayFields[60], [{ index: 0, value: 0 }, { index: 6, value: 11 }]);
  assert.deepEqual(world.get(14).shortArrayFields[61], [{ index: 0, value: 65535 }, { index: 1, value: 12345 }]);
  put(100, { denseFields: { 60: [6, 0], 61: [0, 65535] } });
  assert.deepEqual(world.get(14).byteArrayFields[60], [{ index: 0, value: 6 }, { index: 1, value: 0 }]);
  assert.deepEqual(world.get(14).shortArrayFields[61], [{ index: 0, value: 0 }, { index: 1, value: 65535 }]);
});

test('profile-only records preserve known health after a health record in the same packet', () => {
  const world = new WorldState();
  const base = { handle: 15, typeId: 1, kind: 1, x: 0, y: 0, angle: 0, flags: 0 };
  world.applyDeltaSnapshot({ sequence: 1, serverTime: 0, events: [], entities: [
    { ...base, health: 50, maxHealth: 100, healthKnown: true, maxHealthKnown: true,
      floatFields: { 53: 50, 55: 100 } },
    { ...base, health: 0, maxHealth: 0, healthKnown: false, maxHealthKnown: false,
      byteArrayFields: { 60: [{ index: 0, value: 1 }] } },
  ] }, 0);
  assert.equal(world.get(15).health, 50);
  assert.equal(world.get(15).maxHealth, 100);
  assert.equal(world.get(15).healthKnown, true);
  assert.equal(world.get(15).maxHealthKnown, true);
});
