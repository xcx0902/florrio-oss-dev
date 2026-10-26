#!/usr/bin/env node
/**
 * Split the extracted server/client catalogs into the data-driven
 * `schema/catalogs/*.json` files used by the new engine and client.
 *
 * Source: source/semantic/server-catalogs.json (authoritative shared rules) and
 * source/semantic/client-catalogs.json (client-side cross-check).
 * Expected counts: 39 petals, 23 entity definitions, 20 spawn rules.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = path.resolve('.');
const server = JSON.parse(await readFile(path.join(root, 'source/semantic/server-catalogs.json'), 'utf8'));
const client = JSON.parse(await readFile(path.join(root, 'source/semantic/client-catalogs.json'), 'utf8'));
const output = path.join(root, 'schema/catalogs');
await mkdir(output, { recursive: true });

function fail(message) { throw new Error(message); }
if (server.petalDefinitions.length !== 39) fail(`expected 39 petals, found ${server.petalDefinitions.length}`);
if (server.entityDefinitions.length !== 23) fail(`expected 23 entity definitions, found ${server.entityDefinitions.length}`);
if (server.spawnRules.length !== 20) fail(`expected 20 spawn rules, found ${server.spawnRules.length}`);

const source = {
  artifact: server.artifact,
  sha256: server.sha256,
  evidence: server.evidence,
  extractedBy: 'source/semantic/extract-catalogs.mjs',
};
const crossCheck = { petals: 0, entities: 0, mismatches: [] };
for (const petal of server.petalDefinitions) {
  const other = client.petalDefinitions.find(item => item.typeId === petal.typeId);
  if (!other) crossCheck.mismatches.push({ kind: 'petal', typeId: petal.typeId, issue: 'missing in client catalog' });
  else if (other.name !== petal.name || JSON.stringify(other.descriptions) !== JSON.stringify(petal.descriptions)) crossCheck.mismatches.push({ kind: 'petal', typeId: petal.typeId, issue: 'name/description differs' });
  else crossCheck.petals++;
}
for (const entity of server.entityDefinitions) {
  const other = client.entityDefinitions.find(item => item.typeId === entity.typeId);
  if (!other) crossCheck.mismatches.push({ kind: 'entity', typeId: entity.typeId, issue: 'missing in client catalog' });
  else if (other.name !== entity.name || JSON.stringify(other.descriptions) !== JSON.stringify(entity.descriptions)) crossCheck.mismatches.push({ kind: 'entity', typeId: entity.typeId, issue: 'name/description differs' });
  else crossCheck.entities++;
}

const petals = {
  schema: 1,
  source,
  count: server.petalDefinitions.length,
  petals: server.petalDefinitions.map(petal => ({
    typeId: petal.typeId,
    name: petal.name,
    descriptions: petal.descriptions,
    rarityIndex: petal.rarityIndex,
    rechargeMilliseconds: petal.rechargeMilliseconds,
    instancesPerSlot: petal.instancesPerSlot,
    radius: petal.radius,
    flags: { offset40: petal.flag40, offset41: petal.flag41, offset44: petal.field44 },
    factory: { tableIndex: petal.factoryTableIndex, functionIndex: petal.factoryFunctionIndex },
    virtualTable: { address: petal.virtualTableAddress, methods: petal.virtualMethods },
    evidence: { address: petal.address, bytesHex: petal.bytesHex },
  })),
};

const entities = {
  schema: 1,
  source,
  count: server.entityDefinitions.length,
  entities: server.entityDefinitions.map(entity => ({
    typeId: entity.typeId,
    name: entity.name,
    descriptions: entity.descriptions,
    rarity: entity.field24,
    scale: entity.field28,
    petalTypeIds: entity.petalTypeIds,
    field100: entity.field100,
    field104: entity.field104,
    field108: entity.field108,
    field109: entity.field109,
    field110: entity.field110,
    field112: entity.field112,
    evidence: { address: entity.address, bytesHex: entity.bytesHex },
  })),
};

const spawnRules = {
  schema: 1,
  source,
  count: server.spawnRules.length,
  rules: server.spawnRules.map((rule, index) => ({
    index,
    weight: rule.weight,
    regionIds: rule.regionIds,
    entityTypeId: rule.entityTypeId,
    evidence: { address: rule.address, bytesHex: rule.bytesHex },
  })),
};

const strings = [];
const seen = new Set();
const add = (key, value, kind) => {
  const identity = `${kind}\0${value}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  strings.push({ key, value, kind });
};
for (const petal of petals.petals) {
  add(`petal.${petal.typeId}.name`, petal.name, 'name');
  petal.descriptions.forEach((value, index) => add(`petal.${petal.typeId}.description.${index}`, value, 'description'));
}
for (const entity of entities.entities) {
  add(`entity.${entity.typeId}.name`, entity.name, 'name');
  entity.descriptions.forEach((value, index) => add(`entity.${entity.typeId}.description.${index}`, value, 'description'));
}
const stringCatalog = {
  schema: 1,
  source,
  count: strings.length,
  strings,
  lookup: Object.fromEntries(strings.map(item => [item.key, item.value])),
};

const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  source,
  counts: { petals: petals.count, entities: entities.count, spawnRules: spawnRules.count, strings: stringCatalog.count },
  crossCheck,
  validation: {
    petalTypeIdsAreDense: petals.petals.every((petal, index) => petal.typeId === index),
    entityTypeIdsAreDense: entities.entities.every((entity, index) => entity.typeId === index),
    allSpawnTargetsExist: spawnRules.rules.every(rule => rule.entityTypeId >= 0 && rule.entityTypeId < entities.count),
    allPetalDropsExist: entities.entities.every(entity => entity.petalTypeIds.every(id => id >= 0 && id < petals.count)),
    noDuplicateStringKeys: new Set(strings.map(item => item.key)).size === strings.length,
  },
};
if (Object.values(report.validation).some(value => value !== true)) throw new Error('catalog validation failed: ' + JSON.stringify(report.validation));

await writeFile(path.join(output, 'petals.json'), JSON.stringify(petals, null, 2) + '\n');
await writeFile(path.join(output, 'entities.json'), JSON.stringify(entities, null, 2) + '\n');
await writeFile(path.join(output, 'spawn-rules.json'), JSON.stringify(spawnRules, null, 2) + '\n');
await writeFile(path.join(output, 'strings.json'), JSON.stringify(stringCatalog, null, 2) + '\n');
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
