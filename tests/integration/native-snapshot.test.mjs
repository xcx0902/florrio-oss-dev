/** Native WorkerApi -> snapshot bytes -> product TS decoder integration. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BareSnapshotDecoder } from '../../client/public/state/snapshot.js';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from '../../client/public/state/field-types.js';
import { WorldState } from '../../client/public/state/world.js';
import { playerLoadoutSlots } from '../../client/public/state/loadout.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'florr-native-integration-'));
after(() => rm(temporary, { recursive: true, force: true }));
const plans = DENSE_GROUPS.map(group => ({ offset: group.offset, specs: DENSE_GROUP_SPECS[group.offset] ?? [] }));

function parseFixture(bytes) {
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'FLRR');
  assert.equal(bytes[4], 1);
  const count = bytes[5], packets = [];
  let offset = 6;
  for (let index = 0; index < count; ++index) {
    const length = bytes.readUInt32LE(offset); offset += 4;
    packets.push(bytes.subarray(offset, offset + length)); offset += length;
  }
  assert.equal(offset, bytes.length);
  return packets;
}

test('hand-authored protocol vectors decode without a generator-derived expectation', async () => {
  const document = JSON.parse(await readFile(
    path.join(root, 'tests/fixtures/product/protocol/manual_vectors.json'), 'utf8'));
  const decoder = new BareSnapshotDecoder();
  for (const vector of document.vectors) {
    const packet = Uint8Array.from(Buffer.from(vector.hex, 'hex'));
    const snapshot = decoder.decode(packet);
    assert.ok(snapshot, `${vector.name}: expected a packet`);
    assert.equal(snapshot.sequence, vector.sequence, vector.name);
    assert.deepEqual(snapshot.deletedHandles, vector.deletedHandles, vector.name);
    assert.deepEqual(snapshot.events, vector.events, vector.name);
    assert.equal(snapshot.entities.length, vector.entities.length, vector.name);
    for (const [index, expected] of vector.entities.entries()) {
      const actual = snapshot.entities[index];
      assert.equal(actual.handle, expected.handle, vector.name);
      assert.equal(actual.flags, expected.flags, vector.name);
      assert.equal(actual.typeId, expected.typeId, vector.name);
    }
  }
});

test('native WorkerApi fixture drives input, think and publish through player, mob, inventory, chat and deletion', async () => {
  const fixture = path.join(root, 'build/engine/engine_native_snapshot_fixture');
  assert.ok(existsSync(fixture), 'build the native fixture with npm run build:engine');
  const output = path.join(temporary, 'snapshot.bin');
  const run = spawnSync(fixture, [output], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const packets = parseFixture(await readFile(output));
  assert.equal(packets.length, 4);
  const decoder = new BareSnapshotDecoder(plans);

  const baseline = decoder.decode(packets[0]);
  assert.ok(baseline, 'post-spawn baseline decodes');
  assert.equal(baseline.sequence, 6);
  const baselinePlayer = baseline.entities.find(entity => entity.kind === 1);
  assert.ok(baselinePlayer, 'opcode 6 created a player through WorkerApi input');
  assert.equal(baselinePlayer.health, 100);
  const loadoutWorld = new WorldState();
  loadoutWorld.applyPartial(baseline, 0);
  const spawnedPlayer = loadoutWorld.get(baselinePlayer.handle);
  assert.deepEqual(playerLoadoutSlots(spawnedPlayer)?.slice(0, 5), [1, 1, 1, 1, 1],
    'spawn_loadout_petals created the real default inventory');

  const moved = decoder.decode(packets[1]);
  assert.ok(moved, 'input/think snapshot decodes');
  assert.equal(moved.sequence, 7);
  assert.deepEqual(moved.events.find(event => event.opcode === 9), { opcode: 9, text: 'fixture' });
  assert.equal(moved.deletedHandles.length, 0);
  const playerRecord = moved.entities.find(entity => entity.handle === baselinePlayer.handle);
  const mobRecord = moved.entities.find(entity => entity.kind === 2);
  assert.ok(playerRecord, 'player record is present after real ticks');
  assert.ok(playerRecord.x > baselinePlayer.x + 0.5, 'opcode 12 input moved the player through tick()');
  assert.ok(playerRecord.health > 0 && playerRecord.maxHealth >= playerRecord.health);
  assert.ok(mobRecord, 'mob record is present');
  assert.equal(mobRecord.speciesId, 1);
  assert.ok(mobRecord.x > playerRecord.x, 'mob was spawned by WorkerApi ahead of the moving player');
  assert.ok(mobRecord.health > 0 && mobRecord.maxHealth >= mobRecord.health);

  const world = new WorldState();
  world.applyPartial(baseline, 0);
  world.applyPartial(moved, 50);
  const player = world.get(baselinePlayer.handle);
  assert.ok(player);
  assert.deepEqual(playerLoadoutSlots(player)?.slice(0, 5), [1, 1, 1, 1, 1]);
  const mobHandle = [...world.all()].find(entity => entity.kind === 2)?.handle;
  assert.ok(mobHandle !== undefined);

  // A truncated packet fails without poisoning the decoder's component table.
  assert.equal(decoder.decode(packets[1].subarray(0, -1)), null);
  assert.ok(decoder.decode(packets[1]), 'decoder state is restored after a failed speculative decode');

  const deleted = decoder.decode(packets[2]);
  assert.ok(deleted, 'deletion snapshot decodes');
  assert.equal(deleted.sequence, 8);
  assert.deepEqual(deleted.deletedHandles, [mobHandle]);
  assert.equal(deleted.events.length, 0);
  world.applyPartial(deleted, 100);
  assert.equal(world.get(mobHandle), undefined, 'deletion removes the mob');
  assert.ok(world.get(baselinePlayer.handle), 'player survives the mob deletion');
});

test('native snapshot preserves the uint8 publishable id boundary', async () => {
  const fixture = path.join(root, 'build/engine/engine_native_snapshot_fixture');
  assert.ok(existsSync(fixture), 'build the native fixture with npm run build:engine');
  const output = path.join(temporary, 'boundary-snapshot.bin');
  const run = spawnSync(fixture, [output], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const packets = parseFixture(await readFile(output));
  assert.equal(packets.length, 4);
  const decoder = new BareSnapshotDecoder();
  const boundary = decoder.decode(packets[3]);
  assert.ok(boundary, 'boundary packet decodes');
  assert.equal(boundary.sequence, 9);
  assert.equal(boundary.entities.length, 2);
  const species = boundary.entities.find(entity => entity.typeId === 255);
  const loadout = boundary.entities.find(entity => entity.byteArrayField60?.[0]?.value === 255);
  assert.ok(species, 'species field 2 preserves 255');
  assert.equal(species.speciesId, 255);
  assert.ok(loadout, 'loadout field 60 preserves the same one-byte id');
});
