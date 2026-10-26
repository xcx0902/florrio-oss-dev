#!/usr/bin/env node
/**
 * Derive per-petal combat statistics from the original catalog and recovered
 * petal initializer bodies.
 *
 * Evidence:
 * - `source/semantic/server-catalogs.json` petal records (type id, rarity,
 *   recharge, instances, draw radius, vtable slots).
 * - `source/game/server/petals.mjs` INITIALIZERS: the slot-2 virtual method of
 *   each catalog vtable is the petal's initializer. It writes the collision
 *   radius (physics +8), contact damage (physics +44) and maximum health
 *   (health +12).
 *
 * The output is derived data; the source of truth stays the original wasm and
 * the recorded catalog bytes.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.');
const catalogs = JSON.parse(await readFile(path.join(root, 'source/semantic/server-catalogs.json'), 'utf8'));

/** Recovered slot-2 initializer bodies: [id, collisionRadius, damage, health]. */
const INITIALIZERS = new Map([
  [411, [7, 8, 20]], [412, [10, 5, 5]], [414, [7, 8, 5]], [432, [10, 12, 20]],
  [433, [10, 10, 10]], [434, [10, 5, 5]], [435, [10, 1, 2000]],
  [662, [12, 20, 20]], [664, [14, 10, 90]], [668, [6, 5, 5]],
  [670, [15, 15, 15]], [672, [10, 35, 10]], [685, [12, 0, 1]],
  [687, [7, 8, 5]], [690, [9, 5, 10]], [694, [13, 1, 50]],
  [720, [15, 1, 50]], [724, [7, 5, 5]], [726, [16, 10, 200]],
  [727, [7, 35, 8]], [728, [12, 15, 15]], [734, [10, 8, 5]],
  [739, [10, 8, 10]], [740, [15, 5, 15]],
]);

/** Recovered slot-3 orbit bodies: id -> [profile, attack, defend]. */
const ORBIT_PROFILES = new Map([
  [119, ['basic', 130, 40]],
  [413, ['fast', 145, 40]],
  [661, ['heavy', 120, 50]],
  [663, ['rock', 110, 55]],
  [667, ['iris', 140, 40]],
  [725, ['heaviest', 100, 65]],
  [669, ['wing', 140, 40]],
]);

const petals = [];
for (const record of catalogs.petalDefinitions) {
  const initializer = record.virtualMethods.find(method => method.slot === 2);
  const id = initializer ? initializer.functionIndex : null;
  const stats = id === null ? null : INITIALIZERS.get(id) ?? null;
  if (record.typeId !== 0 && stats === null) {
    throw new Error(`petal ${record.typeId} (${record.name}) has no recovered slot-2 initializer`);
  }
  const orbit = record.virtualMethods.find(method => method.slot === 3);
  const orbitId = orbit ? orbit.functionIndex : null;
  const orbitProfile = orbitId === null ? null : ORBIT_PROFILES.get(orbitId) ?? null;
  petals.push({
    typeId: record.typeId,
    name: record.name,
    rarityIndex: record.rarityIndex,
    rechargeMilliseconds: record.rechargeMilliseconds,
    instancesPerSlot: record.instancesPerSlot,
    drawRadius: record.radius,
    initializerFunctionIndex: id,
    collisionRadius: stats ? stats[0] : 0,
    damage: stats ? stats[1] : 0,
    health: stats ? stats[2] : 0,
    orbitFunctionIndex: orbitId,
    orbitProfile: orbitProfile ? orbitProfile[0] : 'default',
    orbitAttack: orbitProfile ? orbitProfile[1] : 130,
    orbitDefend: orbitProfile ? orbitProfile[2] : 40,
    confidence: stats ? 'high' : 'catalog-only',
  });
}

const output = {
  schema: 1,
  source: {
    artifact: catalogs.artifact,
    sha256: catalogs.sha256,
    petalCatalog: 'source/semantic/server-catalogs.json',
    initializerEvidence: 'source/game/server/petals.mjs INITIALIZERS + catalog virtual slot 2',
    note: 'collisionRadius is the physics +8 value written by the slot-2 initializer; damage is physics +44; health is the health maximum.',
  },
  count: petals.length,
  petals,
};
await writeFile(path.join(root, 'schema/catalogs/petal-combat.json'), JSON.stringify(output, null, 2) + '\n');
console.log(`wrote schema/catalogs/petal-combat.json (${petals.length} petals)`);
