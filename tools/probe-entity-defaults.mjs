#!/usr/bin/env node
// Probe original function 144 for per-species spawn defaults.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServerWorld } from '../test/helpers/server-world.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'schema/catalogs/entity-spawn-defaults.json');
const species = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17, 19, 20, 21, 22];
const dynamic = new Set([1, 2, 3]);

const world = await createServerWorld(false, { functionIds: [144] });
const view = new DataView(world.runtime.memory.buffer);
const u32 = (offset) => view.getUint32(offset, true);
const u8 = (offset) => view.getUint8(offset);
const f32 = (offset) => view.getFloat32(offset, true);

const defaults = [];
for (const typeId of species) {
  const entity = world.runtime.call(144, 24864, typeId, 0, 0, 0);
  if (!entity) throw new Error(`function 144 returned ${entity} for species ${typeId}`);
  const physics = u32(entity + 188);
  if (!physics) throw new Error(`missing physics for species ${typeId}`);
  const health = u32(entity + 164);
  if (!health) throw new Error(`missing health for species ${typeId}`);
  defaults.push({
    typeId,
    name: null,
    radius: f32(physics + 8),
    contactDamage: f32(physics + 44),
    health: f32(health + 8),
    maxHealth: f32(health + 12),
    flags92: u8(entity + 92),
    flags93: u8(entity + 93),
    flags95: u8(entity + 95),
    physicsFlag48: u32(physics + 48),
    dynamicRadius: dynamic.has(typeId),
    dynamicHealth: dynamic.has(typeId),
  });
}

const catalog = JSON.parse(await readFile(path.join(root, 'schema/catalogs/entities.json'), 'utf8'));
const names = new Map(catalog.entities.map((entry) => [entry.typeId, entry.name]));
for (const entry of defaults) entry.name = names.get(entry.typeId) ?? `entity-${entry.typeId}`;

const output = {
  schema: 1,
  source: 'web/sp_server.wasm function 144 probe',
  artifactSha256: '75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d',
  notes: 'Direct spawn defaults read from the original entity record after function 144. Rock/Boulder radius is randomized by configureRock and is marked dynamic.',
  defaults,
};
await writeFile(outPath, JSON.stringify(output, null, 2) + '\n');
console.log(`wrote ${defaults.length} defaults to ${path.relative(root, outPath)}`);
