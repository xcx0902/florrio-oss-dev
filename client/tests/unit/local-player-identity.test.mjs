import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldState } from '../../../build/client/state/world.js';
import { DeathLifecycle } from '../../../build/client/state/death.js';
import { snapshot, selfState } from '../support/multiplayer.mjs';
const entity = (handle, ownerPlayerId, kind = 1, health = 100) => ({ ownership: { handle, ownerPlayerId, ownerHandle: handle, slot: 0, instance: 0 }, records: [{ handle, kind, typeId: kind, health, maxHealth: 100, healthKnown: true, maxHealthKnown: true, x: handle, y: 0, angle: 0, flags: 0, floatFields: { 49: handle, 28: 0 } }] });
function apply(world, overrides, entries = [entity(10, 1), entity(20, 2)], events = []) {
  const entities = new Map(entries.map(e => [e.ownership.handle, e]));
  const s = snapshot({ controlledHandle: 20, entities: entries.map(e => ({ ...e.ownership, fields: new Uint8Array() })), selfState: selfState({ lifeEpoch: 1, life: 1, inventory: Array(16).fill(3), level: 15, experience: 4, score: 30, cameraX: 20, cameraY: 0 }), ...overrides });
  world.applyNetworkSnapshot({ snapshot: s, entities, events }, 2, s.snapshotSeq * 50);
}
test('opponent arrives first and missing self never switches local control or HUD ownership', () => {
  const world = new WorldState(); world.setControlledPlayer(2, 20);
  world.applyFullSnapshot({ sequence: 1, serverTime: 0, entities: entity(10, 1).records, events: [] }, 0);
  assert.equal(world.playerEntity(), undefined); assert.equal([...world.entitiesOfKind(1)].length, 1);
  apply(world, {}); assert.equal(world.healthyPlayer().handle, 20); assert.equal([...world.entitiesOfKind(1)].length, 2);
  assert.deepEqual(world.playerLoadout(), Array(16).fill(3)); assert.equal(world.playerEntity().level, 15); assert.equal(world.playerEntity().score, 30);
  const death = new DeathLifecycle(); death.observe(world);
  apply(world, { full: false, snapshotSeq: 2, removed: [20], controlledHandle: 20 }, [entity(10, 1)]);
  death.observe(world); assert.equal(world.playerEntity(), undefined); assert.equal(death.dead, false);
});
test('self death metadata/corpse removal/respawn stay bound to persistent PlayerId and remote death stays remote', () => {
  const world = new WorldState(), death = new DeathLifecycle(); apply(world, {}); death.observe(world);
  apply(world, { full: false, snapshotSeq: 2 }, [entity(10, 1, 1, 0), entity(20, 2)]); death.observe(world); assert.equal(death.dead, false);
  const self = selfState({ lifeEpoch: 1, life: 2, inventory: Array(16).fill(3), deathLevel: 15, deathScore: 30, killerName: 'Alice', kept: [3, 3], nextSpawnTick: 50 });
  apply(world, { full: false, snapshotSeq: 3, selfState: self }, [entity(10, 1), entity(20, 2, 1, 0)]); death.observe(world);
  assert.equal(death.dead, true); assert.equal(death.snapshot.metadata.killerName, 'Alice'); assert.deepEqual(death.snapshot.metadata.keptItems, [3, 3]);
  apply(world, { full: false, snapshotSeq: 4, controlledHandle: 0, removed: [20], selfState: { ...self, life: 3 } }, [entity(10, 1)]); death.observe(world);
  assert.equal(world.healthyPlayer(), undefined); assert.equal(death.snapshot.metadata.killerName, 'Alice');
  apply(world, { full: false, snapshotSeq: 5, controlledHandle: 30, selfState: selfState({ lifeEpoch: 2, life: 1 }) }, [entity(10, 1), entity(30, 2)]); death.observe(world);
  assert.equal(world.controlledPlayerId, 2); assert.equal(world.healthyPlayer().handle, 30); assert.equal(death.dead, false);
});
test('full replacement clears entity masks, visual events, collection and ownership; pickup events affect only self HUD', () => {
  const world = new WorldState(); apply(world, {}); world.markCollected(10);
  const pickup = actorPlayerId => ({ kind: 2, actorPlayerId, target: 10, slot: 0 });
  apply(world, { full: false, snapshotSeq: 2 }, undefined, [pickup(1)]); assert.equal(world.lastEvents.length, 0);
  apply(world, { full: false, snapshotSeq: 3 }, undefined, [pickup(2)]); assert.equal(world.lastEvents[0].opcode, 14);
  apply(world, { full: true, snapshotSeq: 4, baselineId: 2 }); assert.equal(world.lastEvents.length, 0); assert.equal(world.isRenderable(10), true);
  world.reset(); assert.equal(world.selfState, undefined); assert.equal(world.controlledPlayerId, 0); assert.equal(world.count, 0);
});
test('resuming a dead player after the corpse was removed retains death UI without a live local entity', () => {
  const world = new WorldState(), death = new DeathLifecycle();
  apply(world, { controlledHandle: 0, selfState: selfState({ lifeEpoch: 2, life: 3, killerName: 'Alice', deathLevel: 12, kept: [1] }) }, [entity(10, 1)]);
  death.observe(world); assert.equal(death.dead, true); assert.equal(death.snapshot.metadata.killerName, 'Alice'); assert.equal(world.healthyPlayer(), undefined);
});
