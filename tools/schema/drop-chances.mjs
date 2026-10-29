/** Pure drop-chance derivation from product inputs.
 *
 * The rules live in schema/catalogs/drop-rules.json:
 *   - eight unequal spawn-band area weights;
 *   - petal drop mass by rarity;
 *   - summoned-child contributions;
 *   - reference species and numeric thresholds.
 *
 * This module has no top-level I/O and never reads the archive or the original
 * runtime. Callers pass already-loaded product catalog arrays.
 */

const f32 = Math.fround;
const fail = message => { throw new Error(`drop rules: ${message}`); };

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite`);
  return value;
};
const integer = (value, label) => {
  if (!Number.isInteger(value)) fail(`${label} must be an integer`);
  return value;
};
const positive = (value, label) => {
  finite(value, label);
  if (!(value > 0)) fail(`${label} must be positive`);
  return value;
};

/** Validate the product entity/petal/spawn inputs and the drop rules. */
export function validateDropInputs({ entities, spawnRules, petals, rules }) {
  if (!isObject(rules)) fail('document must be an object');
  if (!Array.isArray(rules.areaMix) || rules.areaMix.length === 0)
    fail('areaMix must be a nonempty array');
  rules.areaMix.forEach((value, index) => finite(value, `areaMix[${index}]`));
  if (!rules.areaMix.some(value => value > 0)) fail('areaMix must contain a positive weight');
  if (!Array.isArray(rules.petalDropMass) || rules.petalDropMass.length === 0)
    fail('petalDropMass must be a nonempty array');
  rules.petalDropMass.forEach((value, index) => positive(value, `petalDropMass[${index}]`));
  const floor = finite(rules.chanceFloor, 'chanceFloor');
  if (floor < 0 || floor > 1) fail('chanceFloor must be in 0..1');
  const saturation = finite(rules.saturationChance, 'saturationChance');
  if (!(saturation > 0 && saturation <= 1)) fail('saturationChance must be in (0, 1]');
  const iterations = integer(rules.maxIterations, 'maxIterations');
  if (iterations < 1 || iterations > 1000) fail('maxIterations must be 1..1000');
  integer(rules.areaMix.length, 'areaMix.length');

  const entityIds = new Set();
  const byId = new Map();
  for (const entity of entities) {
    if (!isObject(entity)) fail('entity must be an object');
    integer(entity.typeId, 'entity.typeId');
    if (entityIds.has(entity.typeId)) fail(`duplicate entity typeId ${entity.typeId}`);
    entityIds.add(entity.typeId);
    byId.set(entity.typeId, entity);
    if (!Array.isArray(entity.petalTypeIds)) fail(`entity ${entity.typeId} petalTypeIds must be an array`);
    if (new Set(entity.petalTypeIds).size !== entity.petalTypeIds.length)
      fail(`entity ${entity.typeId} has duplicate petalTypeIds`);
    for (const petalId of entity.petalTypeIds) {
      integer(petalId, `entity ${entity.typeId} petalTypeId`);
      if (!petals.some(petal => petal.typeId === petalId))
        fail(`entity ${entity.typeId} references unknown petal ${petalId}`);
    }
    integer(entity.dropAliasOf ?? 0, `entity ${entity.typeId} dropAliasOf`);
    if ((entity.dropAliasOf ?? 0) !== 0 && entity.dropAliasOf === entity.typeId)
      fail(`entity ${entity.typeId} cannot alias itself`);
    positive(entity.dropWeight, `entity ${entity.typeId} dropWeight`);
  }

  const reference = integer(rules.referenceSpecies, 'referenceSpecies');
  if (!byId.has(reference)) fail(`referenceSpecies ${reference} does not exist`);
  if (!isObject(rules.children)) fail('children must be an object');
  for (const [parentText, children] of Object.entries(rules.children)) {
    const parent = Number(parentText);
    if (!Number.isInteger(parent) || !byId.has(parent))
      fail(`children parent ${parentText} is not an entity`);
    if (!Array.isArray(children)) fail(`children.${parentText} must be an array`);
    for (const [index, child] of children.entries()) {
      if (!Array.isArray(child) || child.length !== 2)
        fail(`children.${parentText}[${index}] must be [entity, weight]`);
      const [type, weight] = child;
      if (!byId.has(type)) fail(`children.${parentText}[${index}] references unknown entity ${type}`);
      if (!(typeof weight === 'number' && Number.isFinite(weight) && weight >= 0))
        fail(`children.${parentText}[${index}] weight must be finite and nonnegative`);
    }
  }

  // Alias cycles make the inherited drop table undefined.
  for (const entity of entities) {
    const seen = new Set([entity.typeId]);
    let current = entity;
    while ((current.dropAliasOf ?? 0) !== 0) {
      if (seen.has(current.dropAliasOf)) fail(`alias cycle at entity ${entity.typeId}`);
      seen.add(current.dropAliasOf);
      current = byId.get(current.dropAliasOf);
      if (current === undefined) fail(`entity ${entity.typeId} aliases missing entity ${entity.dropAliasOf}`);
    }
  }

  const bands = rules.areaMix.length;
  for (const rule of spawnRules) {
    integer(rule.index, 'spawn rule index');
    positive(rule.weight, `spawn rule ${rule.index} weight`);
    if (!Array.isArray(rule.regionIds))
      fail(`spawn rule ${rule.index} regionIds must be an array`);
    if (new Set(rule.regionIds).size !== rule.regionIds.length)
      fail(`spawn rule ${rule.index} has duplicate bands`);
    for (const band of rule.regionIds) {
      integer(band, `spawn rule ${rule.index} band`);
      if (band < 0 || band >= bands)
        fail(`spawn rule ${rule.index} band ${band} is outside 0..${bands - 1}`);
    }
    if (!byId.has(rule.entityTypeId))
      fail(`spawn rule ${rule.index} references unknown entity ${rule.entityTypeId}`);
  }

  for (const petal of petals) {
    integer(petal.typeId, 'petal.typeId');
    integer(petal.rarityIndex, `petal ${petal.typeId} rarityIndex`);
    if (petal.rarityIndex < 0 || petal.rarityIndex >= rules.petalDropMass.length)
      fail(`petal ${petal.typeId} rarity ${petal.rarityIndex} has no drop mass`);
  }
  return { rules, byId };
}

/** Derive the complete drop table. The result depends only on the arguments. */
export function deriveDropChances({ entities, spawnRules, petals, rules }) {
  const { byId } = validateDropInputs({ entities, spawnRules, petals, rules });
  const bands = rules.areaMix.length;
  const alias = new Map();
  for (const entity of entities) if ((entity.dropAliasOf ?? 0) !== 0) alias.set(entity.typeId, entity.dropAliasOf);
  const canonical = species => alias.get(species) ?? species;

  const bandRows = Array.from({ length: bands }, () => ({ entries: [], total: 0 }));
  for (const rule of spawnRules) {
    for (const band of rule.regionIds) {
      bandRows[band].entries.push({ species: rule.entityTypeId, weight: f32(rule.weight) });
      bandRows[band].total = f32(bandRows[band].total + f32(rule.weight));
    }
  }
  for (let band = 0; band < bands; ++band) {
    if (!(bandRows[band].total > 0))
      fail(`spawn band ${band} has no positive rule weight`);
  }

  const histograms = Array.from({ length: bands }, () => new Map());
  for (let band = 0; band < bands; ++band) {
    let total = 0;
    for (const entry of bandRows[band].entries) {
      const probability = f32(entry.weight / bandRows[band].total);
      histograms[band].set(entry.species, (histograms[band].get(entry.species) ?? 0) + probability);
      total += probability;
      for (const [child, weight] of rules.children[entry.species] ?? []) {
        const contribution = f32(probability * f32(weight));
        const key = canonical(child);
        histograms[band].set(key, (histograms[band].get(key) ?? 0) + contribution);
        total += contribution;
      }
    }
    if (!(total > 0)) fail(`spawn band ${band} normalizes to a zero denominator`);
    for (const [species, value] of histograms[band]) histograms[band].set(species, value / total);
  }

  const speciesMass = new Map();
  for (const entity of entities) {
    let weighted = 0;
    for (let band = 0; band < bands; ++band)
      weighted += (histograms[band].get(entity.typeId) ?? 0) * rules.areaMix[band];
    speciesMass.set(entity.typeId, weighted);
  }
  const referenceMass = speciesMass.get(rules.referenceSpecies);
  if (!(referenceMass > 0)) fail(`reference species ${rules.referenceSpecies} has zero spawn mass`);

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
  for (const petal of petals) {
    if (petal.typeId === 0) continue;
    const petalSources = sources.get(petal.typeId);
    if (!petalSources) continue;
    let remaining = rules.petalDropMass[petal.rarityIndex] * referenceMass;
    if (!(remaining > 1e-9)) continue;
    const saturated = new Set();
    for (let iteration = 0; iteration < rules.maxIterations; ++iteration) {
      const weights = new Map();
      let available = remaining;
      let totalWeight = 0;
      let active = false;
      for (const species of petalSources) {
        if (saturated.has(species)) continue;
        active = true;
        const weight = f32(byId.get(species).dropWeight);
        weights.set(species, weight);
        totalWeight += weight;
        for (const [type, chance] of chances.get(species))
          if (type === petal.typeId) available += speciesMass.get(species) * chance;
      }
      remaining = available;
      for (const species of petalSources) {
        const weight = weights.get(species);
        if (weight === undefined) continue;
        const mass = speciesMass.get(species);
        if (!(totalWeight > 0)) fail(`petal ${petal.typeId} has a zero source-weight denominator`);
        if (!(mass > 0)) fail(`petal ${petal.typeId} source entity ${species} has zero spawn mass`);
        let chance = f32((available * weight) / (totalWeight * mass));
        if (!Number.isFinite(chance)) fail(`petal ${petal.typeId} produced a non-finite chance`);
        if (chance > rules.saturationChance) chance = 1;
        if (chance < rules.chanceFloor) chance = 0;
        chances.get(species).set(petal.typeId, chance);
        if (chance >= 1) saturated.add(species);
        remaining -= mass * chance;
      }
      if (iteration === rules.maxIterations - 1 || !active || !(remaining > 1e-9)) break;
    }
  }

  for (const [species, source] of alias) chances.set(species, new Map(chances.get(source)));

  const finalized = entities.map(entity => ({
    typeId: entity.typeId,
    name: entity.name,
    aliasOf: alias.get(entity.typeId) ?? null,
    drops: [...chances.get(entity.typeId)]
      .filter(([, chance]) => chance >= rules.chanceFloor)
      .map(([petalTypeId, chance]) => ({
        petalTypeId, chance, order: entity.petalTypeIds.indexOf(petalTypeId),
      }))
      .sort((left, right) => left.chance - right.chance || left.order - right.order)
      .map(({ petalTypeId, chance }) => ({ petalTypeId, chance })),
  }));
  for (const entity of finalized)
    for (const drop of entity.drops) {
      if (!(drop.chance >= 0 && drop.chance <= 1))
        fail(`entity ${entity.typeId} petal ${drop.petalTypeId} probability ${drop.chance} is outside 0..1`);
    }

  return {
    schema: 2,
    generatedBy: 'tools/generate.mjs',
    rules: 'schema/catalogs/drop-rules.json',
    constants: {
      areaMix: [...rules.areaMix],
      petalDropMass: [...rules.petalDropMass],
      referenceSpecies: rules.referenceSpecies,
      referenceMass,
      children: structuredClone(rules.children),
    },
    speciesMass: Object.fromEntries([...speciesMass].map(([species, mass]) => [species, mass])),
    entities: finalized,
  };
}
