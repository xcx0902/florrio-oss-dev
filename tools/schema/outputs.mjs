/** Build every product-generated file in memory. Importing has no side effects. */
import { loadSchemaInputs, SCHEMA_INPUTS } from './load.mjs';
import { validateInputs } from './validate.mjs';
import { generateProtocolCpp, generateProtocolTs } from './protocol.mjs';
import { generatePacketKeyHeader, generatePacketKeyTs } from './transport.mjs';
import { deriveDropChances } from './drop-chances.mjs';
import {
  generateCatalogData,
  generateCatalogIdsHeader,
  generateCatalogIdsTs,
  generateStateFlagsHeader,
  generateStateFlagsTs,
  generateLoadoutRulesHeader,
  generateLoadoutRulesTs,
  generateCatalogMarkdown,
  generateCatalogTypes,
  generateClientPetalsTs,
  generateDropChancesHeader,
  generateMobGalleryTs,
  generatePetalCombatHeader,
  generateSpawnDefaultsHeader,
  petalViews,
} from './catalogs.mjs';
import { generateMenuContent } from './menu.mjs';
import { multiplayerOutputs } from './multiplayer.mjs';

export const OUTPUT_MANIFEST = 'schema/generated-outputs.json';
export const GENERATOR = 'tools/generate.mjs';

const json = (value) => JSON.stringify(value, null, 2) + '\n';

/** Return Map<relativePath, content> for every product generated output. */
export async function buildOutputs(root = '.') {
  const inputs = await loadSchemaInputs(root);
  const { contract, transportBytes } = validateInputs(inputs);
  const petals = petalViews(inputs.petals.petals, inputs.petalCombat.petals);
  const derived = deriveDropChances({
    entities: inputs.entities.entities,
    spawnRules: inputs.spawnRules.rules,
    petals: inputs.petals.petals,
    rules: inputs.dropRules,
  });
  const counts = {
    petals: petals.length,
    entities: inputs.entities.entities.length,
    spawnRules: inputs.spawnRules.rules.length,
    strings: inputs.strings.strings.length,
  };
  const outputs = new Map();
  for (const [file, content] of multiplayerOutputs(
    inputs.multiplayerSource,
    [
      inputs.petals,
      inputs.entities,
      inputs.spawnRules,
      inputs.strings,
      inputs.spawnDefaults,
      inputs.petalCombat,
      inputs.dropRules,
    ],
    contract,
  )) {
    outputs.set(file, content);
  }
  outputs.set(
    'schema/generated/protocol-contracts.json',
    json({
      schema: 2,
      generatedBy: GENERATOR,
      source: 'schema/protocol.yaml',
      protocol: contract,
    }),
  );
  outputs.set('engine/include/engine/net/generated_protocol.hpp', generateProtocolCpp(contract));
  outputs.set('client/src/schema/protocol.ts', generateProtocolTs(contract));
  outputs.set('engine/include/engine/net/packet_key.hpp', generatePacketKeyHeader(transportBytes));
  outputs.set('client/src/schema/packet-key.ts', generatePacketKeyTs(transportBytes));
  outputs.set(
    'engine/include/engine/catalog/ids.hpp',
    generateCatalogIdsHeader(
      inputs.rarities.rarities,
      inputs.petals.petals,
      inputs.entities.entities,
      inputs.petalCombat.behaviors,
    ),
  );
  outputs.set(
    'client/src/schema/catalog-ids.ts',
    generateCatalogIdsTs(
      inputs.rarities.rarities,
      inputs.petals.petals,
      inputs.entities.entities,
      inputs.petalCombat.behaviors,
    ),
  );
  outputs.set(
    'engine/include/engine/catalog/state_flag_bits.hpp',
    generateStateFlagsHeader(inputs.stateFlags.groups),
  );
  outputs.set('client/src/schema/state-flags.ts', generateStateFlagsTs(inputs.stateFlags.groups));
  outputs.set(
    'engine/include/engine/catalog/loadout_rules.hpp',
    generateLoadoutRulesHeader(inputs.loadout),
  );
  outputs.set('client/src/schema/loadout.ts', generateLoadoutRulesTs(inputs.loadout));
  outputs.set('engine/include/engine/catalog/catalog_types.hpp', generateCatalogTypes());
  outputs.set(
    'engine/include/engine/catalog/generated_catalog_data.hpp',
    generateCatalogData({
      petals,
      entities: inputs.entities.entities,
      spawnRules: inputs.spawnRules.rules,
      strings: inputs.strings.strings,
      counts,
    }),
  );
  outputs.set(
    'engine/include/engine/catalog/entity_spawn_defaults.hpp',
    generateSpawnDefaultsHeader(inputs.spawnDefaults.defaults),
  );
  outputs.set('engine/include/engine/catalog/petal_combat.hpp', generatePetalCombatHeader(petals));
  outputs.set('engine/include/engine/catalog/drop_chances.hpp', generateDropChancesHeader(derived));
  outputs.set(
    'client/src/schema/petals.ts',
    generateClientPetalsTs(petals, inputs.entities.entities, inputs.rarities.rarities),
  );
  outputs.set(
    'client/src/schema/mob-gallery.ts',
    generateMobGalleryTs(derived, inputs.galleryOverrides.overrides, inputs.entities.entities),
  );
  outputs.set('client/src/schema/menu-content.ts', generateMenuContent(inputs.changelog));
  outputs.set('schema/catalogs/drop-chances.json', json(derived));
  outputs.set(
    'docs/catalogs.md',
    generateCatalogMarkdown({
      petals,
      entities: inputs.entities.entities,
      counts,
    }),
  );
  // Generated text is written exactly as the templates produce it. No
  // formatter runs on it: bytes, SHA-256 and the manifest describe the template
  // output itself, and regeneration is the only way to change layout.
  return {
    outputs,
    summary: {
      generator: GENERATOR,
      protocolFields: contract.fields.length,
      denseGroups: contract.denseGroups.length,
      rarities: inputs.rarities.rarities.length,
      petals: counts.petals,
      entities: counts.entities,
      spawnRules: counts.spawnRules,
      dropRows: derived.entities.reduce((sum, entity) => sum + entity.drops.length, 0),
      outputs: outputs.size,
      inputs: Object.values(SCHEMA_INPUTS).length,
    },
  };
}
