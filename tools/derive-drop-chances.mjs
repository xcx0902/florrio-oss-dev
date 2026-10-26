#!/usr/bin/env node
/**
 * Derive the mutable entity drop probabilities computed by sp_server_init.
 *
 * The original initializer builds eight spawn-band histograms (including
 * summoned children), weights them with the unequal area constants, then
 * distributes each petal's drop mass across the species that can drop it.
 * The algorithm and constants are recorded in
 * `source/game/server/initialization.mjs` and the WAT at 192700..193300.
 *
 * Output: `schema/catalogs/drop-chances.json`.
 *
 * `--verify` loads the original sp_server wasm, runs `sp_server_init`, reads
 * each entity definition's finalized drop table and compares it with the
 * derived table. This is a bounded probe, not a test suite.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.');
const f32 = Math.fround;

const entities = JSON.parse(await readFile(path.join(root, 'schema/catalogs/entities.json'), 'utf8')).entities;
const rules = JSON.parse(await readFile(path.join(root, 'schema/catalogs/spawn-rules.json'), 'utf8')).rules;
const petals = JSON.parse(await readFile(path.join(root, 'schema/catalogs/petals.json'), 'utf8')).petals;

/** Unequal band-area constants from the initializer (f64 bits in WAT). */
const AREA_MIX = [
  0x1333334 * 2 ** -27, 0x1333334 * 2 ** -27,
  0x133333 * 2 ** -24, 0x1333338 * 2 ** -28,
  0x19999955555555 * 2 ** -57, 0x19999955555555 * 2 ** -57,
  0x19999a * 2 ** -27, 0x19999a * 2 ** -27,
];

/** Original petal drop mass by rarity, read from address 5120 after init. */
const PETAL_DROP_MASS = [50000, 15000, 2500, 100, 5, 1];

/** Summoned children written by the initializer: parent -> [child, weight]. */
const CHILDREN = new Map([
  [11, [[7, 5], [8, 8], [9, 26], [10, 1]]],
  [15, [[16, 9.399999618530273]]],
  [17, [[18, 9.399999618530273]]],
]);

const byId = new Map(entities.map(entity => [entity.typeId, entity]));
const alias = new Map();
for (const entity of entities) if (entity.field109 !== 0) alias.set(entity.typeId, entity.field109);
const canonical = species => alias.get(species) ?? species;

/** One entry per spawn rule occurrence in each band, matching the sorted table. */
const bands = Array.from({ length: 8 }, () => ({ entries: [], total: 0 }));
for (const rule of rules) {
  for (const band of rule.regionIds) {
    bands[band].entries.push({ species: rule.entityTypeId, weight: f32(rule.weight) });
    bands[band].total = f32(bands[band].total + f32(rule.weight));
  }
}

/** Band histogram: probability mass per canonical species, normalized by the
 * band total plus summoned child contributions. */
const histograms = Array.from({ length: 8 }, () => new Map());
for (let band = 0; band < 8; band++) {
  let total = 0;
  for (const entry of bands[band].entries) {
    const probability = f32(entry.weight / bands[band].total);
    histograms[band].set(entry.species, (histograms[band].get(entry.species) ?? 0) + probability);
    total += probability;
    for (const [child, weight] of CHILDREN.get(entry.species) ?? []) {
      const contribution = f32(probability * f32(weight));
      const key = canonical(child);
      histograms[band].set(key, (histograms[band].get(key) ?? 0) + contribution);
      total += contribution;
    }
  }
  for (const [species, value] of histograms[band]) histograms[band].set(species, value / total);
}

/** Area-weighted spawn mass per species; species 19 (Square) is the reference. */
const speciesMass = new Map();
for (const entity of entities) {
  let weighted = 0;
  for (let band = 0; band < 8; band++) weighted += (histograms[band].get(entity.typeId) ?? 0) * AREA_MIX[band];
  speciesMass.set(entity.typeId, weighted);
}
const REFERENCE_SPECIES = 19;
const referenceMass = speciesMass.get(REFERENCE_SPECIES);

/** Petal -> species that can drop it. Aliases are skipped: they inherit the
 * finalized table after the distribution. */
const sources = new Map();
for (const entity of entities) {
  if (entity.typeId === 0 || alias.has(entity.typeId)) continue;
  for (const petal of entity.petalTypeIds) {
    if (!sources.has(petal)) sources.set(petal, []);
    sources.get(petal).push(entity.typeId);
  }
}

const chances = new Map(entities.map(entity => [entity.typeId, new Map()]));
const petalById = new Map(petals.map(petal => [petal.typeId, petal]));
for (let petal = 1; petal < 39; petal++) {
  const petalSources = sources.get(petal);
  if (!petalSources) continue;
  const definition = petalById.get(petal);
  let remaining = PETAL_DROP_MASS[definition.rarityIndex] * referenceMass;
  if (!(remaining > 1e-9)) continue;
  const saturated = new Set();
  for (let iteration = 0; iteration < 64; iteration++) {
    const weights = new Map();
    let available = remaining;
    let totalWeight = 0;
    let active = false;
    for (const species of petalSources) {
      if (saturated.has(species)) continue;
      active = true;
      const weight = f32(byId.get(species).field112);
      weights.set(species, weight);
      totalWeight += weight;
      for (const [type, chance] of chances.get(species)) if (type === petal) available += speciesMass.get(species) * chance;
    }
    remaining = available;
    for (const species of petalSources) {
      const weight = weights.get(species);
      if (weight === undefined) continue;
      const mass = speciesMass.get(species);
      let chance = f32((available * weight) / (totalWeight * mass));
      if (chance > 0.9) chance = 1;
      if (chance < 0.00001) chance = 0;
      chances.get(species).set(petal, chance);
      if (chance >= 1) saturated.add(species);
      remaining -= mass * chance;
    }
    if (iteration === 63 || !active || !(remaining > 1e-9)) break;
  }
}

/** Alias species inherit the finalized table. */
for (const [species, source] of alias) chances.set(species, new Map(chances.get(source)));

/** Drop low-probability entries and sort by ascending chance (original call 247). */
const finalized = entities.map(entity => ({
  typeId: entity.typeId,
  name: entity.name,
  aliasOf: alias.get(entity.typeId) ?? null,
  drops: [...chances.get(entity.typeId)]
    .filter(([, chance]) => chance >= 0.00001)
    .map(([petalTypeId, chance]) => ({ petalTypeId, chance, order: entity.petalTypeIds.indexOf(petalTypeId) }))
    .sort((left, right) => left.chance - right.chance || left.order - right.order)
    .map(({ petalTypeId, chance }) => ({ petalTypeId, chance })),
}));

const output = {
  schema: 1,
  source: {
    artifact: 'web/sp_server.wasm',
    sha256: '75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d',
    algorithm: 'source/game/server/initialization.mjs initializeCatalog',
    evidence: 'source/wasm/sp_server.wat 192700..193300',
  },
  constants: {
    areaMix: AREA_MIX,
    petalDropMass: PETAL_DROP_MASS,
    referenceSpecies: REFERENCE_SPECIES,
    referenceMass,
    children: Object.fromEntries([...CHILDREN].map(([parent, list]) => [parent, list])),
  },
  speciesMass: Object.fromEntries([...speciesMass].map(([species, mass]) => [species, mass])),
  entities: finalized,
};

if (!process.argv.includes('--verify')) {
  await writeFile(path.join(root, 'schema/catalogs/drop-chances.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(`wrote schema/catalogs/drop-chances.json (${finalized.length} entities)`);
} else {
  const stored = JSON.parse(await readFile(path.join(root, 'schema/catalogs/drop-chances.json'), 'utf8'));
  if (JSON.stringify(stored) !== JSON.stringify(output)) throw new Error('derived drop catalog is stale; run npm run catalogs:drops');
}

if (process.argv.includes('--verify')) {
  const { loadOriginal } = await import('../test/helpers/wasm-probe.mjs');
  const runtime = await loadOriginal('sp_server', { functionIds: [103, 656] });
  runtime.call(656);
  const view = new DataView(runtime.memory.buffer);
  let compared = 0;
  let mismatches = 0;
  for (const entity of finalized) {
    const pointer = runtime.call(103, entity.typeId);
    const count = view.getUint8(pointer + 32);
    const actual = [];
    for (let index = 0; index < count; index++) {
      const entry = pointer + 36 + index * 8;
      actual.push({ petalTypeId: view.getUint32(entry, true), chance: view.getFloat32(entry + 4, true) });
    }
    const expected = entity.drops;
    if (actual.length !== expected.length) {
      console.log(`entity ${entity.typeId}: count ${actual.length} != ${expected.length}`);
      mismatches++;
      continue;
    }
    for (let index = 0; index < actual.length; index++) {
      compared++;
      if (actual[index].petalTypeId !== expected[index].petalTypeId || actual[index].chance !== expected[index].chance) {
        console.log(`entity ${entity.typeId}: [${index}] ${JSON.stringify(actual[index])} != ${JSON.stringify(expected[index])}`);
        mismatches++;
      }
    }
  }
  console.log(`verified ${compared} drop entries, ${mismatches} mismatches`);
  if (mismatches !== 0) process.exitCode = 1;
}
