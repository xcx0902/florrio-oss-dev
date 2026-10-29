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

test('native WorkerApi fixture covers player, mob, inventory, chat event, truncation and deletion', async () => {
  const fixture = path.join(root, 'build/engine/engine_native_snapshot_fixture');
  assert.ok(existsSync(fixture), 'build the native fixture with npm run build:engine');
  const output = path.join(temporary, 'snapshot.bin');
  const run = spawnSync(fixture, [output], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const packets = parseFixture(await readFile(output));
  assert.equal(packets.length, 2);
  const decoder = new BareSnapshotDecoder(plans);

  const first = decoder.decode(packets[0]);
  assert.ok(first, 'first native snapshot decodes');
  assert.equal(first.sequence, 7);
  assert.deepEqual(first.events, [{ opcode: 9, text: 'fixture' }]);
  assert.equal(first.deletedHandles.length, 0);
  const playerRecord = first.entities.find(entity => entity.kind === 1 && entity.x === 100);
  const mobRecord = first.entities.find(entity => entity.kind === 2);
  assert.ok(playerRecord, 'player record is present');
  assert.equal(playerRecord.y, 50);
  assert.equal(playerRecord.health, 100);
  assert.ok(mobRecord, 'mob record is present');
  assert.equal(mobRecord.speciesId, 1);
  assert.equal(mobRecord.x, 140);
  assert.equal(mobRecord.y, 90);
  assert.ok(mobRecord.health > 0 && mobRecord.maxHealth >= mobRecord.health);

  const world = new WorldState();
  world.applyPartial(first, 0);
  const player = [...world.all()].find(entity => entity.kind === 1);
  assert.ok(player);
  assert.deepEqual(playerLoadoutSlots(player)?.slice(0, 5), [1, 1, 1, 1, 1]);
  const mobHandle = [...world.all()].find(entity => entity.kind === 2)?.handle;
  assert.ok(mobHandle !== undefined);

  // A truncated packet fails without poisoning the decoder's component table.
  assert.equal(decoder.decode(packets[0].subarray(0, -1)), null);
  assert.ok(decoder.decode(packets[0]), 'decoder state is restored after a failed speculative decode');

  const second = decoder.decode(packets[1]);
  assert.ok(second, 'second native snapshot decodes');
  assert.deepEqual(second.deletedHandles, [mobHandle]);
  assert.equal(second.events.length, 0);
  world.applyPartial(second, 50);
  assert.equal(world.get(mobHandle), undefined, 'deletion removes the mob');
  assert.ok([...world.all()].some(entity => entity.kind === 1), 'player survives the mob deletion');
});
