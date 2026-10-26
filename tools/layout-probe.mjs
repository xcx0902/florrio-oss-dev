#!/usr/bin/env node
/**
 * Read the original server's catalog tables and world globals through their
 * documented offsets, then compare the decoded values with schema/catalogs/*.json.
 *
 * Two instances are used:
 *   - pristine: p() + lazy entity-definition initializer 103, matching the
 *     extractor that produced source/semantic/server-catalogs.json;
 *   - initialized: p() + sp_server_init 656, for world globals and entity slots.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadOriginal } from '../test/helpers/wasm-probe.mjs';
import { createServerWorld } from '../test/helpers/server-world.mjs';

const root = path.resolve('.');
const decoder = new TextDecoder('utf-8');

function reader(memory) {
  const view = new DataView(memory.buffer);
  const bytes = new Uint8Array(memory.buffer);
  const stringAt = (address, limit = 512) => {
    let end = address;
    while (end < address + limit && bytes[end] !== 0) end++;
    return decoder.decode(bytes.subarray(address, end));
  };
  return {
    u8: address => view.getUint8(address),
    u16: address => view.getUint16(address, true),
    u32: address => view.getUint32(address, true),
    f32: address => view.getFloat32(address, true),
    u64: address => view.getBigUint64(address, true),
    stringAt,
    hexAt: (address, length) => Array.from(bytes.subarray(address, address + length), byte => byte.toString(16).padStart(2, '0')).join(''),
  };
}

const WORLD_BASE = 22928;
const ENTITY_BASE = 419020;
const ENTITY_BYTES = 496;
const ENTITY_COUNT = 16384;
const PETAL_BASE = 8545792;
const PETAL_BYTES = 52;
const PETAL_COUNT = 39;
const SPAWN_BASE = 8547824;
const SPAWN_BYTES = 16;
const SPAWN_COUNT = 20;
const ENTITY_DEFINITION_BASE = 8548368;
const ENTITY_DEFINITION_BYTES = 116;
const ENTITY_DEFINITION_COUNT = 23;

const petals = JSON.parse(await readFile(path.join(root, 'schema/catalogs/petals.json'), 'utf8'));
const entities = JSON.parse(await readFile(path.join(root, 'schema/catalogs/entities.json'), 'utf8'));
const spawnRules = JSON.parse(await readFile(path.join(root, 'schema/catalogs/spawn-rules.json'), 'utf8'));

const pristine = await loadOriginal('sp_server', { functionIds: [103], construct: true });
pristine.call(103, 1);
const catalogMemory = pristine.memory;
const catalog = reader(catalogMemory);

const decodedPetals = [];
const petalMismatches = [];
for (let index = 0; index < PETAL_COUNT; index++) {
  const base = PETAL_BASE + index * PETAL_BYTES;
  const descriptionCount = catalog.u32(base + 4);
  const record = {
    typeId: index,
    address: base,
    name: catalog.stringAt(catalog.u32(base + 0)),
    descriptions: Array.from({ length: Math.min(descriptionCount, 4) }, (_, slot) => catalog.stringAt(catalog.u32(base + 8 + slot * 4))),
    rarityIndex: catalog.u32(base + 24),
    rechargeMilliseconds: catalog.f32(base + 28),
    instancesPerSlot: catalog.u32(base + 32),
    radius: catalog.f32(base + 36),
    flag40: catalog.u8(base + 40),
    flag41: catalog.u8(base + 41),
    field44: catalog.f32(base + 44),
    factoryTableIndex: catalog.u32(base + 48),
    bytesHex: catalog.hexAt(base, PETAL_BYTES),
  };
  const expected = petals.petals[index];
  if (!expected) petalMismatches.push({ typeId: index, field: 'missing', actual: record.name });
  else {
    const checks = {
      name: [record.name, expected.name],
      rarityIndex: [record.rarityIndex, expected.rarityIndex],
      rechargeMilliseconds: [record.rechargeMilliseconds, expected.rechargeMilliseconds],
      instancesPerSlot: [record.instancesPerSlot, expected.instancesPerSlot],
      radius: [record.radius, expected.radius],
      factoryTableIndex: [record.factoryTableIndex, expected.factory.tableIndex],
      flag40: [record.flag40, expected.flags.offset40],
      flag41: [record.flag41, expected.flags.offset41],
      field44: [record.field44, expected.flags.offset44],
      descriptions: [JSON.stringify(record.descriptions), JSON.stringify(expected.descriptions)],
      bytesHex: [record.bytesHex, expected.evidence.bytesHex],
    };
    for (const [field, [actual, wanted]] of Object.entries(checks)) if (actual !== wanted) petalMismatches.push({ typeId: index, field, actual, expected: wanted });
  }
  decodedPetals.push(record);
}

const decodedEntities = [];
const entityMismatches = [];
for (let index = 0; index < ENTITY_DEFINITION_COUNT; index++) {
  const base = ENTITY_DEFINITION_BASE + index * ENTITY_DEFINITION_BYTES;
  const descriptionCount = catalog.u32(base + 4);
  const componentPairCount = catalog.u8(base + 32);
  const record = {
    typeId: index,
    address: base,
    name: catalog.stringAt(catalog.u32(base + 0)),
    descriptions: Array.from({ length: Math.min(descriptionCount, 4) }, (_, slot) => catalog.stringAt(catalog.u32(base + 8 + slot * 4))),
    rarity: catalog.u32(base + 24),
    scale: catalog.f32(base + 28),
    componentPairCount,
    petalTypeIds: Array.from({ length: Math.min(componentPairCount, 8) }, (_, pair) => catalog.u32(base + 36 + pair * 8)),
    componentPairs: Array.from({ length: Math.min(componentPairCount, 8) }, (_, pair) => [catalog.u8(base + 36 + pair * 8), catalog.u8(base + 37 + pair * 8)]),
    field100: catalog.u32(base + 100),
    field104: catalog.u32(base + 104),
    field108: catalog.u8(base + 108),
    field109: catalog.u8(base + 109),
    field110: catalog.u8(base + 110),
    secondaryScale: catalog.f32(base + 112),
    bytesHex: catalog.hexAt(base, ENTITY_DEFINITION_BYTES),
  };
  const expected = entities.entities[index];
  if (!expected) entityMismatches.push({ typeId: index, field: 'missing', actual: record.name });
  else {
    const checks = {
      name: [record.name, expected.name],
      rarity: [record.rarity, expected.rarity],
      scale: [record.scale, expected.scale],
      petalTypeIds: [JSON.stringify(record.petalTypeIds), JSON.stringify(expected.petalTypeIds)],
      field100: [record.field100, expected.field100],
      field104: [record.field104, expected.field104],
      field108: [record.field108, expected.field108],
      field109: [record.field109, expected.field109],
      field110: [record.field110, expected.field110],
      secondaryScale: [record.secondaryScale, expected.field112],
      descriptions: [JSON.stringify(record.descriptions), JSON.stringify(expected.descriptions)],
      bytesHex: [record.bytesHex, expected.evidence.bytesHex],
    };
    for (const [field, [actual, wanted]] of Object.entries(checks)) if (actual !== wanted) entityMismatches.push({ typeId: index, field, actual, expected: wanted });
  }
  decodedEntities.push(record);
}

const decodedSpawnRules = [];
const spawnMismatches = [];
for (let index = 0; index < SPAWN_COUNT; index++) {
  const base = SPAWN_BASE + index * SPAWN_BYTES;
  const regionCount = catalog.u8(base + 4);
  const record = {
    index,
    address: base,
    weight: catalog.f32(base + 0),
    regionCount,
    regionIds: Array.from({ length: regionCount }, (_, slot) => catalog.u8(base + 5 + slot)),
    entityTypeId: catalog.u8(base + 13),
    bytesHex: catalog.hexAt(base, SPAWN_BYTES),
  };
  const expected = spawnRules.rules[index];
  if (!expected) spawnMismatches.push({ index, field: 'missing' });
  else {
    const checks = {
      weight: [record.weight, expected.weight],
      regionIds: [JSON.stringify(record.regionIds), JSON.stringify(expected.regionIds)],
      entityTypeId: [record.entityTypeId, expected.entityTypeId],
      bytesHex: [record.bytesHex, expected.evidence.bytesHex],
    };
    for (const [field, [actual, wanted]] of Object.entries(checks)) if (actual !== wanted) spawnMismatches.push({ index, field, actual, expected: wanted });
  }
  decodedSpawnRules.push(record);
}

const initialized = await createServerWorld(false);
const live = reader(initialized.runtime.memory);
let liveSlots = 0;
let firstLive = null;
for (let index = 0; index < ENTITY_COUNT; index++) {
  const base = ENTITY_BASE + index * ENTITY_BYTES;
  if (live.u32(base) === WORLD_BASE) {
    liveSlots++;
    if (!firstLive) firstLive = { index, address: base, handle: live.u32(base + 16) };
  }
}
const worldGlobals = {
  base: WORLD_BASE,
  initialized: live.u8(8545776),
  outputCount: live.u8(8545512),
  outputPointers: live.u32(8545516),
  revision: live.u32(WORLD_BASE + 2140),
  rngState: live.u64(8569392).toString(),
  entityDefinitionGuard: live.u8(8551036),
  entitySlotsWithWorldPointer: liveSlots,
  firstLiveEntity: firstLive,
  worldFlags: live.u8(WORLD_BASE + 95),
};

const result = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  artifact: 'web/sp_server.wasm',
  sha256: '75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d',
  sequence: { pristine: ['p', '103'], initialized: ['p', '656'] },
  tables: {
    petals: { base: PETAL_BASE, stride: PETAL_BYTES, count: PETAL_COUNT, decoded: decodedPetals.length },
    entityDefinitions: { base: ENTITY_DEFINITION_BASE, stride: ENTITY_DEFINITION_BYTES, count: ENTITY_DEFINITION_COUNT, decoded: decodedEntities.length },
    spawnRules: { base: SPAWN_BASE, stride: SPAWN_BYTES, count: SPAWN_COUNT, decoded: decodedSpawnRules.length },
  },
  worldGlobals,
  mismatches: { petals: petalMismatches, entities: entityMismatches, spawnRules: spawnMismatches },
  decoded: { petals: decodedPetals, entities: decodedEntities, spawnRules: decodedSpawnRules },
};
await mkdir(path.join(root, 'schema/generated'), { recursive: true });
await writeFile(path.join(root, 'schema/generated/layout-probe.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  petals: { decoded: decodedPetals.length, mismatches: petalMismatches.length },
  entities: { decoded: decodedEntities.length, mismatches: entityMismatches.length },
  spawnRules: { decoded: decodedSpawnRules.length, mismatches: spawnMismatches.length },
  worldGlobals,
  mismatches: result.mismatches,
}, null, 2));
if (petalMismatches.length || entityMismatches.length || spawnMismatches.length) process.exitCode = 1;
