/** Read-only product schema inputs. Importing this module never writes files. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseProtocol } from './protocol.mjs';

/** Every human-editable input the unified generator reads. */
export const SCHEMA_INPUTS = Object.freeze({
  protocol: 'schema/protocol.yaml',
  multiplayer: 'schema/multiplayer.yaml',
  transport: 'schema/transport.json',
  rarities: 'schema/catalogs/rarities.json',
  stateFlags: 'schema/catalogs/state-flags.json',
  loadout: 'schema/catalogs/loadout.json',
  petals: 'schema/catalogs/petals.json',
  entities: 'schema/catalogs/entities.json',
  spawnRules: 'schema/catalogs/spawn-rules.json',
  strings: 'schema/catalogs/strings.json',
  spawnDefaults: 'schema/catalogs/entity-spawn-defaults.json',
  petalCombat: 'schema/catalogs/petal-combat.json',
  dropRules: 'schema/catalogs/drop-rules.json',
  galleryOverrides: 'schema/catalogs/gallery-overrides.json',
  changelog: 'CHANGELOG.md',
});

async function json(root, relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}

/** Load and parse every input. Validation is a separate, side-effect-free step. */
export async function loadSchemaInputs(root = '.') {
  const [
    protocolSource,
    multiplayerSource,
    transport,
    rarities,
    stateFlags,
    loadout,
    petals,
    entities,
    spawnRules,
    strings,
    spawnDefaults,
    petalCombat,
    dropRules,
    galleryOverrides,
    changelog,
  ] = await Promise.all([
    readFile(path.join(root, SCHEMA_INPUTS.protocol), 'utf8'),
    readFile(path.join(root, SCHEMA_INPUTS.multiplayer), 'utf8'),
    json(root, SCHEMA_INPUTS.transport),
    json(root, SCHEMA_INPUTS.rarities),
    json(root, SCHEMA_INPUTS.stateFlags),
    json(root, SCHEMA_INPUTS.loadout),
    json(root, SCHEMA_INPUTS.petals),
    json(root, SCHEMA_INPUTS.entities),
    json(root, SCHEMA_INPUTS.spawnRules),
    json(root, SCHEMA_INPUTS.strings),
    json(root, SCHEMA_INPUTS.spawnDefaults),
    json(root, SCHEMA_INPUTS.petalCombat),
    json(root, SCHEMA_INPUTS.dropRules),
    json(root, SCHEMA_INPUTS.galleryOverrides),
    readFile(path.join(root, SCHEMA_INPUTS.changelog), 'utf8'),
  ]);
  return {
    protocolSource,
    multiplayerSource,
    protocolDocument: parseProtocol(protocolSource),
    transport,
    rarities,
    stateFlags,
    loadout,
    petals,
    entities,
    spawnRules,
    strings,
    spawnDefaults,
    petalCombat,
    dropRules,
    galleryOverrides,
    changelog,
  };
}
