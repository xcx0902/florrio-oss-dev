/** Side-effect-free validation for every product schema input. */
import { compileProtocol } from './protocol.mjs';
import { validateTransport } from './transport.mjs';
import { parseChangelog } from './menu.mjs';
import { validateDropInputs } from './drop-chances.mjs';
import { PUBLISHABLE_TYPE_ID_MAX } from './wire-ids.mjs';

const fail = (location, message) => { throw new Error(`${location}: ${message}`); };
const object = (value, location) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(location, 'expected object');
  return value;
};
const array = (value, location) => {
  if (!Array.isArray(value)) fail(location, 'expected array');
  return value;
};
const string = (value, location) => {
  if (typeof value !== 'string') fail(location, 'expected string');
  return value;
};
const nonempty = (value, location) => {
  string(value, location);
  if (value.length === 0) fail(location, 'must not be empty');
  return value;
};
const integer = (value, location, minimum = 0, maximum = 0xffffffff) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    fail(location, `expected integer ${minimum}..${maximum}`);
  return value;
};
const finite = (value, location, minimum = -Infinity, maximum = Infinity) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(location, `expected finite number ${minimum}..${maximum}`);
  return value;
};
const boolean = (value, location) => {
  if (typeof value !== 'boolean') fail(location, 'expected boolean');
  return value;
};
const unique = (values, location) => {
  if (new Set(values).size !== values.length) fail(location, 'contains duplicate values');
};
const uniqueIds = (rows, location) => {
  unique(rows.map(row => row.typeId), `${location}.typeId`);
};
const typeId = (value, location) => integer(value, location, 0, PUBLISHABLE_TYPE_ID_MAX);

function validatePetal(petal, index, combat) {
  const at = `petals[${index}]`;
  object(petal, at);
  typeId(petal.typeId, `${at}.typeId`);
  nonempty(petal.name, `${at}.name`);
  array(petal.descriptions, `${at}.descriptions`).forEach((description, descriptionIndex) =>
    string(description, `${at}.descriptions[${descriptionIndex}]`));
  integer(petal.rarityIndex, `${at}.rarityIndex`, 0, 7);
  finite(petal.rechargeMilliseconds, `${at}.rechargeMilliseconds`, 0);
  integer(petal.instancesPerSlot, `${at}.instancesPerSlot`, 1, 3);
  finite(petal.labelFontSize, `${at}.labelFontSize`, 1);
  boolean(petal.orbitHidden, `${at}.orbitHidden`);
  boolean(petal.sharedOrbit, `${at}.sharedOrbit`);
  finite(petal.extraOrbitRadius, `${at}.extraOrbitRadius`, 0);
  object(combat, `${at}.combat`);
  finite(combat.drawRadius, `${at}.combat.drawRadius`, 0);
  finite(combat.collisionRadius, `${at}.combat.collisionRadius`, 0);
  finite(combat.damage, `${at}.combat.damage`, 0);
  finite(combat.health, `${at}.combat.health`, 0);
  nonempty(combat.orbitProfile, `${at}.combat.orbitProfile`);
  if (combat.orbitFunctionIndex !== null)
    integer(combat.orbitFunctionIndex, `${at}.combat.orbitFunctionIndex`, 0, 0xffff);
}

function validateEntity(entity, index) {
  const at = `entities[${index}]`;
  object(entity, at);
  typeId(entity.typeId, `${at}.typeId`);
  nonempty(entity.name, `${at}.name`);
  array(entity.descriptions, `${at}.descriptions`).forEach((description, descriptionIndex) =>
    string(description, `${at}.descriptions[${descriptionIndex}]`));
  integer(entity.rarity, `${at}.rarity`, 0, 7);
  finite(entity.scale, `${at}.scale`, 0);
  array(entity.petalTypeIds, `${at}.petalTypeIds`).forEach((id, petalIndex) =>
    typeId(id, `${at}.petalTypeIds[${petalIndex}]`));
  unique(entity.petalTypeIds, `${at}.petalTypeIds`);
  integer(entity.componentDrawCount, `${at}.componentDrawCount`, 0, 0xff);
  typeId(entity.dropAliasOf, `${at}.dropAliasOf`);
  finite(entity.dropWeight, `${at}.dropWeight`, 0);
  for (const field of ['opaque100', 'opaque104', 'opaque108', 'opaque110'])
    integer(entity[field], `${at}.${field}`, 0, 0xff);
}

/** Validate all inputs and return the compiled protocol contract. */
export function validateInputs(inputs) {
  const at = 'schema';
  object(inputs, at);
  const contract = compileProtocol(inputs.protocolDocument);
  const transportBytes = validateTransport(inputs.transport);

  object(inputs.petals, 'petals');
  integer(inputs.petals.count, 'petals.count', 1);
  uniqueIds(array(inputs.petals.petals, 'petals.petals'), 'petals');
  if (inputs.petals.count !== inputs.petals.petals.length)
    fail('petals.count', `declares ${inputs.petals.count} rows but has ${inputs.petals.petals.length}`);

  object(inputs.entities, 'entities');
  integer(inputs.entities.count, 'entities.count', 1);
  uniqueIds(array(inputs.entities.entities, 'entities.entities'), 'entities');
  if (inputs.entities.count !== inputs.entities.entities.length)
    fail('entities.count', `declares ${inputs.entities.count} rows but has ${inputs.entities.entities.length}`);

  object(inputs.spawnRules, 'spawnRules');
  integer(inputs.spawnRules.count, 'spawnRules.count', 1);
  array(inputs.spawnRules.rules, 'spawnRules.rules').forEach((rule, index) => {
    const ruleAt = `spawnRules.rules[${index}]`;
    object(rule, ruleAt);
    integer(rule.index, `${ruleAt}.index`, 0, inputs.spawnRules.count - 1);
    finite(rule.weight, `${ruleAt}.weight`, 0);
    if (!(rule.weight > 0)) fail(`${ruleAt}.weight`, 'must be positive');
    array(rule.regionIds, `${ruleAt}.regionIds`).forEach((band, bandIndex) =>
      integer(band, `${ruleAt}.regionIds[${bandIndex}]`, 0, 7));
    unique(rule.regionIds, `${ruleAt}.regionIds`);
    typeId(rule.entityTypeId, `${ruleAt}.entityTypeId`);
  });
  if (inputs.spawnRules.count !== inputs.spawnRules.rules.length)
    fail('spawnRules.count', `declares ${inputs.spawnRules.count} rows but has ${inputs.spawnRules.rules.length}`);

  object(inputs.strings, 'strings');
  integer(inputs.strings.count, 'strings.count', 1);
  array(inputs.strings.strings, 'strings.strings').forEach((entry, index) => {
    const entryAt = `strings.strings[${index}]`;
    object(entry, entryAt);
    nonempty(entry.key, `${entryAt}.key`);
    string(entry.value, `${entryAt}.value`);
    nonempty(entry.kind, `${entryAt}.kind`);
  });
  if (inputs.strings.count !== inputs.strings.strings.length)
    fail('strings.count', `declares ${inputs.strings.count} rows but has ${inputs.strings.strings.length}`);
  unique(inputs.strings.strings.map(entry => entry.key), 'strings.strings.key');

  object(inputs.spawnDefaults, 'spawnDefaults');
  array(inputs.spawnDefaults.defaults, 'spawnDefaults.defaults').forEach((entry, index) => {
    const entryAt = `spawnDefaults.defaults[${index}]`;
    object(entry, entryAt);
    typeId(entry.typeId, `${entryAt}.typeId`);
    nonempty(entry.name, `${entryAt}.name`);
    finite(entry.radius, `${entryAt}.radius`, 0);
    finite(entry.contactDamage, `${entryAt}.contactDamage`, 0);
    finite(entry.health, `${entryAt}.health`, 0);
    finite(entry.maxHealth, `${entryAt}.maxHealth`, 0);
    integer(entry.flags92, `${entryAt}.flags92`, 0, 0xff);
    integer(entry.flags93, `${entryAt}.flags93`, 0, 0xff);
    integer(entry.flags95, `${entryAt}.flags95`, 0, 0xff);
    integer(entry.physicsFlag48, `${entryAt}.physicsFlag48`, 0);
    boolean(entry.dynamicRadius, `${entryAt}.dynamicRadius`);
    boolean(entry.dynamicHealth, `${entryAt}.dynamicHealth`);
  });
  if (typeof inputs.spawnDefaults.notes !== 'string' || inputs.spawnDefaults.notes.length === 0)
    fail('spawnDefaults.notes', 'must be a nonempty product note');

  object(inputs.petalCombat, 'petalCombat');
  integer(inputs.petalCombat.count, 'petalCombat.count', 1);
  const combatById = new Map();
  for (const [index, entry] of array(inputs.petalCombat.petals, 'petalCombat.petals').entries()) {
    const entryAt = `petalCombat.petals[${index}]`;
    object(entry, entryAt);
    typeId(entry.typeId, `${entryAt}.typeId`);
    if (combatById.has(entry.typeId)) fail(entryAt, `duplicate combat typeId ${entry.typeId}`);
    combatById.set(entry.typeId, entry);
  }
  if (inputs.petalCombat.count !== inputs.petalCombat.petals.length)
    fail('petalCombat.count', `declares ${inputs.petalCombat.count} rows but has ${inputs.petalCombat.petals.length}`);

  const petalIds = new Set(inputs.petals.petals.map(petal => petal.typeId));
  for (const combat of combatById.values())
    if (!petalIds.has(combat.typeId)) fail(`petalCombat.petals`, `unknown petal ${combat.typeId}`);
  for (const [index, petal] of inputs.petals.petals.entries())
    validatePetal(petal, index, combatById.get(petal.typeId));
  if (combatById.size !== petalIds.size)
    fail('petalCombat.petals', 'must cover every petal exactly once');

  for (const [index, entity] of inputs.entities.entities.entries()) validateEntity(entity, index);
  const entityIds = new Set(inputs.entities.entities.map(entity => entity.typeId));
  for (const [index, entity] of inputs.entities.entities.entries()) {
    for (const petalId of entity.petalTypeIds)
      if (!petalIds.has(petalId)) fail(`entities[${index}].petalTypeIds`, `unknown petal ${petalId}`);
    if (entity.dropAliasOf !== 0 && !entityIds.has(entity.dropAliasOf))
      fail(`entities[${index}].dropAliasOf`, `unknown entity ${entity.dropAliasOf}`);
  }
  for (const [index, rule] of inputs.spawnRules.rules.entries())
    if (!entityIds.has(rule.entityTypeId))
      fail(`spawnRules.rules[${index}].entityTypeId`, `unknown entity ${rule.entityTypeId}`);
  for (const [index, entry] of inputs.spawnDefaults.defaults.entries())
    if (!entityIds.has(entry.typeId))
      fail(`spawnDefaults.defaults[${index}].typeId`, `unknown entity ${entry.typeId}`);

  object(inputs.dropRules, 'dropRules');
  validateDropInputs({
    entities: inputs.entities.entities, spawnRules: inputs.spawnRules.rules,
    petals: inputs.petals.petals, rules: inputs.dropRules,
  });

  object(inputs.galleryOverrides, 'galleryOverrides');
  array(inputs.galleryOverrides.overrides, 'galleryOverrides.overrides').forEach((entry, index) => {
    const entryAt = `galleryOverrides.overrides[${index}]`;
    object(entry, entryAt);
    typeId(entry.typeId, `${entryAt}.typeId`);
    if (!entityIds.has(entry.typeId)) fail(`${entryAt}.typeId`, `unknown entity ${entry.typeId}`);
    nonempty(entry.reason, `${entryAt}.reason`);
    if (entry.rarity !== undefined) integer(entry.rarity, `${entryAt}.rarity`, 0, 7);
    for (const field of ['addDrops', 'removeDrops', 'replaceDrops']) {
      if (entry[field] === undefined) continue;
      if (!Array.isArray(entry[field])) fail(`${entryAt}.${field}`, 'expected array');
      for (const [dropIndex, drop] of entry[field].entries()) {
        if (field === 'removeDrops') { typeId(drop, `${entryAt}.${field}[${dropIndex}]`); continue; }
        object(drop, `${entryAt}.${field}[${dropIndex}]`);
        typeId(drop.petalTypeId, `${entryAt}.${field}[${dropIndex}].petalTypeId`);
        finite(drop.chance, `${entryAt}.${field}[${dropIndex}].chance`, 0, 1);
        if (!petalIds.has(drop.petalTypeId))
          fail(`${entryAt}.${field}[${dropIndex}].petalTypeId`, `unknown petal ${drop.petalTypeId}`);
      }
    }
  });
  unique(inputs.galleryOverrides.overrides.map(entry => entry.typeId), 'galleryOverrides.overrides.typeId');

  parseChangelog(inputs.changelog);
  return { contract, transportBytes };
}
