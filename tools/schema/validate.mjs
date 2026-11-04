/** Side-effect-free validation for every product schema input. */
import { compileProtocol } from './protocol.mjs';
import { validateTransport } from './transport.mjs';
import { parseChangelog } from './menu.mjs';
import { validateDropInputs } from './drop-chances.mjs';
import { PUBLISHABLE_TYPE_ID_MAX } from './wire-ids.mjs';

const fail = (location, message) => {
  throw new Error(`${location}: ${message}`);
};
const object = (value, location) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(location, 'expected object');
  }
  return value;
};
const array = (value, location) => {
  if (!Array.isArray(value)) {
    fail(location, 'expected array');
  }
  return value;
};
const string = (value, location) => {
  if (typeof value !== 'string') {
    fail(location, 'expected string');
  }
  return value;
};
const nonempty = (value, location) => {
  string(value, location);
  if (value.length === 0) {
    fail(location, 'must not be empty');
  }
  return value;
};
const integer = (value, location, minimum = 0, maximum = 0xffffffff) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(location, `expected integer ${minimum}..${maximum}`);
  }
  return value;
};
const finite = (value, location, minimum = -Infinity, maximum = Infinity) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(location, `expected finite number ${minimum}..${maximum}`);
  }
  return value;
};
const boolean = (value, location) => {
  if (typeof value !== 'boolean') {
    fail(location, 'expected boolean');
  }
  return value;
};
const unique = (values, location) => {
  if (new Set(values).size !== values.length) {
    fail(location, 'contains duplicate values');
  }
};
const uniqueIds = (rows, location) => {
  unique(
    rows.map((row) => row.typeId),
    `${location}.typeId`,
  );
};
const typeId = (value, location) => integer(value, location, 0, PUBLISHABLE_TYPE_ID_MAX);

/** C++ and TypeScript keywords that must not become generated identity names. */
const RESERVED_IDENTIFIERS = new Set([
  'alignas',
  'alignof',
  'and',
  'and_eq',
  'asm',
  'auto',
  'bitand',
  'bitor',
  'bool',
  'break',
  'case',
  'catch',
  'char',
  'char16_t',
  'char32_t',
  'class',
  'compl',
  'concept',
  'const',
  'consteval',
  'constexpr',
  'constinit',
  'const_cast',
  'continue',
  'co_await',
  'co_return',
  'co_yield',
  'decltype',
  'default',
  'delete',
  'do',
  'double',
  'dynamic_cast',
  'else',
  'enum',
  'explicit',
  'export',
  'extern',
  'false',
  'float',
  'for',
  'friend',
  'goto',
  'if',
  'inline',
  'int',
  'long',
  'mutable',
  'namespace',
  'new',
  'noexcept',
  'not',
  'not_eq',
  'nullptr',
  'operator',
  'or',
  'or_eq',
  'private',
  'protected',
  'public',
  'register',
  'reinterpret_cast',
  'requires',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'static_assert',
  'static_cast',
  'struct',
  'switch',
  'template',
  'this',
  'thread_local',
  'throw',
  'true',
  'try',
  'typedef',
  'typeid',
  'typename',
  'union',
  'unsigned',
  'using',
  'virtual',
  'void',
  'volatile',
  'wchar_t',
  'while',
  'xor',
  'xor_eq',
  'any',
  'boolean',
  'constructor',
  'declare',
  'get',
  'infer',
  'keyof',
  'module',
  'never',
  'readonly',
  'require',
  'set',
  'string',
  'symbol',
  'type',
  'undefined',
  'unique',
  'unknown',
  'var',
  'yield',
]);

function symbol(value, location) {
  nonempty(value, location);
  if (!/^[A-Z][A-Za-z0-9]*$/.test(value)) {
    fail(location, 'must be an ASCII PascalCase identifier');
  }
  // Symbols are PascalCase and C++ members add the `k` prefix, so lowercase
  // keywords cannot collide today; keep the check for future naming changes.
  if (RESERVED_IDENTIFIERS.has(value) || RESERVED_IDENTIFIERS.has(`k${value}`)) {
    fail(location, `conflicts with a target-language keyword: ${value}`);
  }
  return value;
}

function uniqueSymbols(rows, location) {
  const seen = new Map();
  for (const row of rows) {
    const key = row.symbol.toLowerCase();
    if (seen.has(key)) {
      fail(location, `duplicate symbol ${row.symbol} conflicts with ${seen.get(key)}`);
    }
    seen.set(key, row.symbol);
  }
}

function validatePetal(petal, index, combat, rarityCount) {
  const at = `petals[${index}]`;
  object(petal, at);
  typeId(petal.typeId, `${at}.typeId`);
  symbol(petal.symbol, `${at}.symbol`);
  nonempty(petal.name, `${at}.name`);
  array(petal.descriptions, `${at}.descriptions`).forEach((description, descriptionIndex) =>
    string(description, `${at}.descriptions[${descriptionIndex}]`),
  );
  integer(petal.rarityIndex, `${at}.rarityIndex`, 0, rarityCount - 1);
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
  nonempty(combat.behavior, `${at}.combat.behavior`);
  finite(combat.healAmount, `${at}.combat.healAmount`, 0);
  if (combat.behavior === 'RoseHeal' && !(combat.healAmount > 0)) {
    fail(`${at}.combat.healAmount`, 'RoseHeal requires a positive heal amount');
  }
  if (combat.behavior !== 'RoseHeal' && combat.healAmount !== 0) {
    fail(`${at}.combat.healAmount`, 'only RoseHeal may declare a heal amount');
  }
  nonempty(combat.orbitProfile, `${at}.combat.orbitProfile`);
}

function validateEntity(entity, index, rarityCount) {
  const at = `entities[${index}]`;
  object(entity, at);
  typeId(entity.typeId, `${at}.typeId`);
  symbol(entity.symbol, `${at}.symbol`);
  nonempty(entity.name, `${at}.name`);
  array(entity.descriptions, `${at}.descriptions`).forEach((description, descriptionIndex) =>
    string(description, `${at}.descriptions[${descriptionIndex}]`),
  );
  integer(entity.rarity, `${at}.rarity`, 0, rarityCount - 1);
  finite(entity.scale, `${at}.scale`, 0);
  array(entity.petalTypeIds, `${at}.petalTypeIds`).forEach((id, petalIndex) =>
    typeId(id, `${at}.petalTypeIds[${petalIndex}]`),
  );
  unique(entity.petalTypeIds, `${at}.petalTypeIds`);
  integer(entity.dropDrawCount, `${at}.dropDrawCount`, 0, 0xff);
  typeId(entity.dropAliasOf, `${at}.dropAliasOf`);
  finite(entity.dropWeight, `${at}.dropWeight`, 0);
}

/** Validate all inputs and return the compiled protocol contract. */
export function validateInputs(inputs) {
  const at = 'schema';
  object(inputs, at);
  const contract = compileProtocol(inputs.protocolDocument);
  const transportBytes = validateTransport(inputs.transport);

  object(inputs.rarities, 'rarities');
  integer(inputs.rarities.count, 'rarities.count', 1, 8);
  const rarities = array(inputs.rarities.rarities, 'rarities.rarities');
  if (inputs.rarities.count !== rarities.length) {
    fail('rarities.count', `declares ${inputs.rarities.count} rows but has ${rarities.length}`);
  }
  rarities.forEach((entry, index) => {
    const entryAt = `rarities.rarities[${index}]`;
    object(entry, entryAt);
    integer(entry.index, `${entryAt}.index`, 0, 7);
    if (entry.index !== index) {
      fail(`${entryAt}.index`, 'rarity indexes must be contiguous from zero in order');
    }
    symbol(entry.symbol, `${entryAt}.symbol`);
    nonempty(entry.name, `${entryAt}.name`);
  });
  uniqueSymbols(rarities, 'rarities.rarities.symbol');

  object(inputs.loadout, 'loadout');
  integer(inputs.loadout.inventorySlots, 'loadout.inventorySlots', 1, 16);
  integer(inputs.loadout.activeSlots, 'loadout.activeSlots', 1, 8);
  integer(inputs.loadout.instancesPerSlot, 'loadout.instancesPerSlot', 1, 3);
  if (inputs.loadout.activeSlots > inputs.loadout.inventorySlots) {
    fail('loadout.activeSlots', 'must not exceed inventorySlots');
  }
  const unlockLevels = array(inputs.loadout.unlockLevels, 'loadout.unlockLevels');
  const inventorySizes = array(inputs.loadout.inventorySizes, 'loadout.inventorySizes');
  const activeCounts = array(inputs.loadout.activeSlotCounts, 'loadout.activeSlotCounts');
  if (
    inventorySizes.length !== unlockLevels.length + 1 ||
    activeCounts.length !== unlockLevels.length + 1
  ) {
    fail('loadout', 'tier arrays must have one more entry than unlockLevels');
  }
  unlockLevels.forEach((level, index) => {
    integer(level, `loadout.unlockLevels[${index}]`, 1, 255);
    if (index > 0 && level <= unlockLevels[index - 1]) {
      fail(`loadout.unlockLevels[${index}]`, 'must be strictly increasing');
    }
  });
  inventorySizes.forEach((size, index) => integer(size, `loadout.inventorySizes[${index}]`, 1, 16));
  activeCounts.forEach((size, index) => integer(size, `loadout.activeSlotCounts[${index}]`, 1, 8));
  for (let index = 1; index < inventorySizes.length; ++index) {
    if (inventorySizes[index] <= inventorySizes[index - 1]) {
      fail('loadout.inventorySizes', 'must be strictly increasing');
    }
    if (activeCounts[index] <= activeCounts[index - 1]) {
      fail('loadout.activeSlotCounts', 'must be strictly increasing');
    }
  }
  if (inventorySizes.at(-1) !== inputs.loadout.inventorySlots) {
    fail('loadout.inventorySizes', 'last tier must equal inventorySlots');
  }
  if (activeCounts.at(-1) !== inputs.loadout.activeSlots) {
    fail('loadout.activeSlotCounts', 'last tier must equal activeSlots');
  }
  const rarityExperience = array(inputs.loadout.rarityExperience, 'loadout.rarityExperience');
  if (rarityExperience.length !== rarities.length) {
    fail('loadout.rarityExperience', 'must have one value per rarity');
  }
  rarityExperience.forEach((value, index) =>
    finite(value, `loadout.rarityExperience[${index}]`, 0),
  );
  array(inputs.loadout.notes, 'loadout.notes').forEach((note, index) =>
    nonempty(note, `loadout.notes[${index}]`),
  );

  object(inputs.stateFlags, 'stateFlags');
  const flagGroups = array(inputs.stateFlags.groups, 'stateFlags.groups');
  if (flagGroups.length === 0) {
    fail('stateFlags.groups', 'must declare at least one flag group');
  }
  flagGroups.forEach((group, index) => {
    const groupAt = `stateFlags.groups[${index}]`;
    object(group, groupAt);
    symbol(group.symbol, `${groupAt}.symbol`);
    integer(group.bits, `${groupAt}.bits`, 8, 32);
    if (group.bits !== 8 && group.bits !== 32) {
      fail(`${groupAt}.bits`, 'must be 8 or 32');
    }
    nonempty(group.description, `${groupAt}.description`);
    const flags = array(group.flags, `${groupAt}.flags`);
    if (flags.length === 0) {
      fail(`${groupAt}.flags`, 'must declare at least one bit');
    }
    flags.forEach((flag, flagIndex) => {
      const flagAt = `${groupAt}.flags[${flagIndex}]`;
      object(flag, flagAt);
      symbol(flag.symbol, `${flagAt}.symbol`);
      integer(flag.bit, `${flagAt}.bit`, 0, group.bits - 1);
      nonempty(flag.name, `${flagAt}.name`);
    });
    uniqueSymbols(flags, `${groupAt}.flags.symbol`);
    const seenBits = new Set();
    for (const flag of flags) {
      if (seenBits.has(flag.bit)) {
        fail(`${groupAt}.flags`, `duplicate bit ${flag.bit}`);
      }
      seenBits.add(flag.bit);
    }
  });
  uniqueSymbols(flagGroups, 'stateFlags.groups.symbol');

  object(inputs.petals, 'petals');
  integer(inputs.petals.count, 'petals.count', 1);
  uniqueIds(array(inputs.petals.petals, 'petals.petals'), 'petals');
  if (inputs.petals.count !== inputs.petals.petals.length) {
    fail(
      'petals.count',
      `declares ${inputs.petals.count} rows but has ${inputs.petals.petals.length}`,
    );
  }

  object(inputs.entities, 'entities');
  integer(inputs.entities.count, 'entities.count', 1);
  uniqueIds(array(inputs.entities.entities, 'entities.entities'), 'entities');
  if (inputs.entities.count !== inputs.entities.entities.length) {
    fail(
      'entities.count',
      `declares ${inputs.entities.count} rows but has ${inputs.entities.entities.length}`,
    );
  }

  object(inputs.spawnRules, 'spawnRules');
  integer(inputs.spawnRules.count, 'spawnRules.count', 1);
  array(inputs.spawnRules.rules, 'spawnRules.rules').forEach((rule, index) => {
    const ruleAt = `spawnRules.rules[${index}]`;
    object(rule, ruleAt);
    integer(rule.index, `${ruleAt}.index`, 0, inputs.spawnRules.count - 1);
    finite(rule.weight, `${ruleAt}.weight`, 0);
    if (!(rule.weight > 0)) {
      fail(`${ruleAt}.weight`, 'must be positive');
    }
    array(rule.regionIds, `${ruleAt}.regionIds`).forEach((band, bandIndex) =>
      integer(band, `${ruleAt}.regionIds[${bandIndex}]`, 0, 7),
    );
    unique(rule.regionIds, `${ruleAt}.regionIds`);
    typeId(rule.entityTypeId, `${ruleAt}.entityTypeId`);
  });
  if (inputs.spawnRules.count !== inputs.spawnRules.rules.length) {
    fail(
      'spawnRules.count',
      `declares ${inputs.spawnRules.count} rows but has ${inputs.spawnRules.rules.length}`,
    );
  }

  object(inputs.strings, 'strings');
  integer(inputs.strings.count, 'strings.count', 1);
  array(inputs.strings.strings, 'strings.strings').forEach((entry, index) => {
    const entryAt = `strings.strings[${index}]`;
    object(entry, entryAt);
    nonempty(entry.key, `${entryAt}.key`);
    string(entry.value, `${entryAt}.value`);
    nonempty(entry.kind, `${entryAt}.kind`);
  });
  if (inputs.strings.count !== inputs.strings.strings.length) {
    fail(
      'strings.count',
      `declares ${inputs.strings.count} rows but has ${inputs.strings.strings.length}`,
    );
  }
  unique(
    inputs.strings.strings.map((entry) => entry.key),
    'strings.strings.key',
  );

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
    integer(entry.entityFlags, `${entryAt}.entityFlags`, 0, 0xff);
    integer(entry.worldFlags, `${entryAt}.worldFlags`, 0, 0xff);
    boolean(entry.dynamicRadius, `${entryAt}.dynamicRadius`);
  });
  if (typeof inputs.spawnDefaults.notes !== 'string' || inputs.spawnDefaults.notes.length === 0) {
    fail('spawnDefaults.notes', 'must be a nonempty product note');
  }

  object(inputs.petalCombat, 'petalCombat');
  integer(inputs.petalCombat.count, 'petalCombat.count', 1);
  const behaviors = array(inputs.petalCombat.behaviors, 'petalCombat.behaviors');
  if (behaviors.length === 0) {
    fail('petalCombat.behaviors', 'must declare at least one behavior');
  }
  behaviors.forEach((entry, index) => {
    const entryAt = `petalCombat.behaviors[${index}]`;
    object(entry, entryAt);
    symbol(entry.symbol, `${entryAt}.symbol`);
    nonempty(entry.description, `${entryAt}.description`);
  });
  uniqueSymbols(behaviors, 'petalCombat.behaviors.symbol');
  const behaviorSymbols = new Set(behaviors.map((entry) => entry.symbol));
  const combatById = new Map();
  for (const [index, entry] of array(inputs.petalCombat.petals, 'petalCombat.petals').entries()) {
    const entryAt = `petalCombat.petals[${index}]`;
    object(entry, entryAt);
    typeId(entry.typeId, `${entryAt}.typeId`);
    if (combatById.has(entry.typeId)) {
      fail(entryAt, `duplicate combat typeId ${entry.typeId}`);
    }
    if (!behaviorSymbols.has(entry.behavior)) {
      fail(`${entryAt}.behavior`, `unknown petal behavior ${entry.behavior}`);
    }
    combatById.set(entry.typeId, entry);
  }
  if (inputs.petalCombat.count !== inputs.petalCombat.petals.length) {
    fail(
      'petalCombat.count',
      `declares ${inputs.petalCombat.count} rows but has ${inputs.petalCombat.petals.length}`,
    );
  }

  const petalIds = new Set(inputs.petals.petals.map((petal) => petal.typeId));
  for (const combat of combatById.values()) {
    if (!petalIds.has(combat.typeId)) {
      fail(`petalCombat.petals`, `unknown petal ${combat.typeId}`);
    }
  }
  uniqueSymbols(inputs.petals.petals, 'petals.petals.symbol');
  for (const [index, petal] of inputs.petals.petals.entries()) {
    validatePetal(petal, index, combatById.get(petal.typeId), rarities.length);
  }
  if (combatById.size !== petalIds.size) {
    fail('petalCombat.petals', 'must cover every petal exactly once');
  }

  uniqueSymbols(inputs.entities.entities, 'entities.entities.symbol');
  for (const [index, entity] of inputs.entities.entities.entries()) {
    validateEntity(entity, index, rarities.length);
  }
  const entityIds = new Set(inputs.entities.entities.map((entity) => entity.typeId));
  const entityById = new Map(inputs.entities.entities.map((entity) => [entity.typeId, entity]));
  for (const [index, entity] of inputs.entities.entities.entries()) {
    for (const petalId of entity.petalTypeIds) {
      if (!petalIds.has(petalId)) {
        fail(`entities[${index}].petalTypeIds`, `unknown petal ${petalId}`);
      }
    }
    if (entity.dropAliasOf !== 0 && !entityIds.has(entity.dropAliasOf)) {
      fail(`entities[${index}].dropAliasOf`, `unknown entity ${entity.dropAliasOf}`);
    }
    if (entity.dropAliasOf !== 0 && entity.typeId === entity.dropAliasOf) {
      fail(`entities[${index}].dropAliasOf`, 'must not alias itself');
    }
    let root = entity;
    const visited = new Set();
    while (root.dropAliasOf !== 0) {
      if (visited.has(root.typeId)) {
        fail(`entities[${index}].dropAliasOf`, 'alias cycle');
      }
      visited.add(root.typeId);
      root = entityById.get(root.dropAliasOf);
    }
    if (entity.dropDrawCount !== root.petalTypeIds.length) {
      fail(
        `entities[${index}].dropDrawCount`,
        `must equal the resolved pool length ${root.petalTypeIds.length}`,
      );
    }
  }
  for (const [index, rule] of inputs.spawnRules.rules.entries()) {
    if (!entityIds.has(rule.entityTypeId)) {
      fail(`spawnRules.rules[${index}].entityTypeId`, `unknown entity ${rule.entityTypeId}`);
    }
  }
  for (const [index, entry] of inputs.spawnDefaults.defaults.entries()) {
    if (!entityIds.has(entry.typeId)) {
      fail(`spawnDefaults.defaults[${index}].typeId`, `unknown entity ${entry.typeId}`);
    }
  }

  object(inputs.dropRules, 'dropRules');
  validateDropInputs({
    entities: inputs.entities.entities,
    spawnRules: inputs.spawnRules.rules,
    petals: inputs.petals.petals,
    rules: inputs.dropRules,
  });

  object(inputs.galleryOverrides, 'galleryOverrides');
  array(inputs.galleryOverrides.overrides, 'galleryOverrides.overrides').forEach((entry, index) => {
    const entryAt = `galleryOverrides.overrides[${index}]`;
    object(entry, entryAt);
    typeId(entry.typeId, `${entryAt}.typeId`);
    if (!entityIds.has(entry.typeId)) {
      fail(`${entryAt}.typeId`, `unknown entity ${entry.typeId}`);
    }
    nonempty(entry.reason, `${entryAt}.reason`);
    if (entry.rarity !== undefined) {
      integer(entry.rarity, `${entryAt}.rarity`, 0, rarities.length - 1);
    }
    for (const field of ['addDrops', 'removeDrops', 'replaceDrops']) {
      if (entry[field] === undefined) {
        continue;
      }
      if (!Array.isArray(entry[field])) {
        fail(`${entryAt}.${field}`, 'expected array');
      }
      for (const [dropIndex, drop] of entry[field].entries()) {
        if (field === 'removeDrops') {
          typeId(drop, `${entryAt}.${field}[${dropIndex}]`);
          continue;
        }
        object(drop, `${entryAt}.${field}[${dropIndex}]`);
        typeId(drop.petalTypeId, `${entryAt}.${field}[${dropIndex}].petalTypeId`);
        finite(drop.chance, `${entryAt}.${field}[${dropIndex}].chance`, 0, 1);
        if (!petalIds.has(drop.petalTypeId)) {
          fail(
            `${entryAt}.${field}[${dropIndex}].petalTypeId`,
            `unknown petal ${drop.petalTypeId}`,
          );
        }
      }
    }
  });
  unique(
    inputs.galleryOverrides.overrides.map((entry) => entry.typeId),
    'galleryOverrides.overrides.typeId',
  );

  parseChangelog(inputs.changelog);
  return { contract, transportBytes };
}
