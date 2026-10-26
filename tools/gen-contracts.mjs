#!/usr/bin/env node
/**
 * Generate C++ structs, TypeScript interfaces and Markdown field tables from
 * schema/layout/*.yaml. The generator also checks that declared sizes and
 * offsets are internally consistent and reports gaps as explicit padding.
 */
import path from 'node:path';
import YAML from 'yaml';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { parseProtocol, compileProtocol, generateProtocolCpp, generateProtocolTs } from './lib/protocol-contracts.mjs';

const root = path.resolve('.');
const options = new Set(process.argv.slice(2));
for (const option of options) if (!['--protocol-only', '--check'].includes(option)) throw new Error(`Unknown option ${option}`);
const protocolContract = compileProtocol(parseProtocol(await readFile(path.join(root, 'schema/protocol.yaml'), 'utf8')));
async function writeGenerated(relative, source) {
  const filename = path.join(root, relative);
  let current;
  try { current = await readFile(filename, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (current === source) return;
  if (options.has('--check')) throw new Error(`Generated contract is stale: ${relative}`);
  await writeFile(filename, source);
}
async function writeProtocolTables() {
  await writeGenerated('engine/include/engine/net/generated_protocol.hpp', generateProtocolCpp(protocolContract));
  await writeGenerated('client/src/schema/protocol.ts', generateProtocolTs(protocolContract));
}
// This mode does not read archived sources or write layouts, catalogs or docs.
// It also works after archive-legacy has moved the frozen oracle directories.
if (options.has('--protocol-only')) {
  const contracts = JSON.parse(await readFile(path.join(root, 'schema/generated/contracts.json'), 'utf8'));
  contracts.protocol = protocolContract;
  await writeProtocolTables();
  await writeGenerated('schema/generated/contracts.json', JSON.stringify(contracts, null, 2) + '\n');
  console.log(JSON.stringify({ protocolFields: protocolContract.fields.length, denseGroups: protocolContract.denseGroups.length, check: options.has('--check') }));
  process.exit(0);
}
if (options.has('--check')) throw new Error('--check currently requires --protocol-only');
const layoutDirectory = path.join(root, 'schema/layout');
const files = (await readdir(layoutDirectory)).filter(name => name.endsWith('.yaml')).sort();
const documents = [];
for (const file of files) documents.push({ file, document: YAML.parse(await readFile(path.join(layoutDirectory, file), 'utf8')) });

const primitive = { u8: 1, u16: 2, u32: 4, u64: 8, i8: 1, i16: 2, i32: 4, i64: 8, f32: 4, f64: 8, ptr: 4, bool: 1 };
const cpp = { u8: 'std::uint8_t', u16: 'std::uint16_t', u32: 'std::uint32_t', u64: 'std::uint64_t', i8: 'std::int8_t', i16: 'std::int16_t', i32: 'std::int32_t', i64: 'std::int64_t', f32: 'float', f64: 'double', ptr: 'std::uint32_t', bool: 'bool' };
const ts = { u8: 'number', u16: 'number', u32: 'number', u64: 'number', i8: 'number', i16: 'number', i32: 'number', i64: 'number', f32: 'number', f64: 'number', ptr: 'number', bool: 'boolean' };

const types = new Map();
for (const { file, document } of documents) {
  if (document.kind === 'types') {
    for (const [name, type] of Object.entries(document.types)) types.set(name, { ...type, name, file });
  } else if (document.kind === 'struct') {
    types.set(document.name, { ...document, file });
  }
}

function sizeOf(typeName) {
  if (primitive[typeName]) return primitive[typeName];
  const type = types.get(typeName);
  if (!type) throw new Error(`unknown type ${typeName}`);
  return type.size;
}

function resolve(type) {
  const fields = [...(type.fields ?? [])].sort((a, b) => a.offset - b.offset);
  let cursor = 0;
  const resolved = [];
  for (const field of fields) {
    if (field.offset < cursor) throw new Error(`${type.name}.${field.name} overlaps at ${field.offset}`);
    if (field.offset > cursor) resolved.push({ name: `_padding_0x${cursor.toString(16)}`, offset: cursor, type: 'u8', count: field.offset - cursor, padding: true });
    const unit = sizeOf(field.type);
    const count = field.count ?? 1;
    const size = unit * count;
    resolved.push({ ...field, unit, size, count });
    cursor = field.offset + size;
  }
  if (cursor > type.size) throw new Error(`${type.name} fields end at ${cursor}, declared size ${type.size}`);
  if (cursor < type.size) resolved.push({ name: `_padding_0x${cursor.toString(16)}`, offset: cursor, type: 'u8', count: type.size - cursor, padding: true });
  return { ...type, resolved, end: type.size };
}

for (const [name, type] of [...types.entries()]) if (type.kind === 'struct') types.set(name, resolve(type));

const structTypes = [...types.values()].filter(type => type.kind === 'struct');
const orderedTypes = [];
const visiting = new Set();
const visited = new Set();
function visit(type) {
  if (visited.has(type.name)) return;
  if (visiting.has(type.name)) throw new Error(`cyclic struct dependency at ${type.name}`);
  visiting.add(type.name);
  for (const field of type.fields ?? []) {
    const dependency = types.get(field.type);
    if (dependency?.kind === 'struct') visit(dependency);
  }
  visiting.delete(type.name);
  visited.add(type.name);
  orderedTypes.push(type);
}
for (const type of structTypes) visit(type);

function cppField(field) {
  const name = field.padding ? field.name : field.name;
  const type = cpp[field.type] ?? field.type;
  if (field.count && field.count > 1) return `  ${type} ${name}[${field.count}];`;
  return `  ${type} ${name};`;
}

function generateCpp() {
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs. Do not edit by hand.');
  lines.push('#pragma once');
  lines.push('#include <cstddef>');
  lines.push('#include <cstdint>');
  lines.push('');
  lines.push('namespace engine::schema {');
  lines.push('');
  lines.push('#pragma pack(push, 1)');
  for (const type of orderedTypes) {
    lines.push(`// ${type.name}: ${type.size} bytes, declared alignment ${type.alignment ?? 4}, confidence ${type.confidence ?? 'unknown'}`);
    if (type.file) lines.push(`// layout: schema/layout/${type.file}`);
    lines.push(`struct ${type.name} {`);
    for (const field of type.resolved) lines.push(cppField(field));
    lines.push('};');
    lines.push(`static_assert(sizeof(${type.name}) == ${type.size}, "${type.name} size");`);
    for (const field of type.resolved.filter(field => !field.padding)) {
      lines.push(`static_assert(offsetof(${type.name}, ${field.name}) == ${field.offset}, "${type.name}.${field.name} offset");`);
    }
    lines.push('');
  }
  lines.push('#pragma pack(pop)');
  lines.push('namespace globals {');
  for (const document of documents.filter(item => item.document.kind === 'globals')) {
    lines.push(`// ${document.document.name} (schema/layout/${document.file})`);
    for (const field of document.document.fields) {
      const suffix = field.count ? `[${field.count}]` : '';
      lines.push(`inline constexpr std::uintptr_t k${field.name[0].toUpperCase()}${field.name.slice(1)} = ${field.address}; // ${field.type}${suffix}`);
    }
    lines.push('');
  }
  lines.push('} // namespace globals');
  lines.push('} // namespace engine::schema');
  return lines.join('\n') + '\n';
}

function generateTs() {
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs. Do not edit by hand.');
  for (const type of [...types.values()].filter(type => type.kind === 'struct').sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`/** ${type.name}: ${type.size} bytes, confidence ${type.confidence ?? 'unknown'} */`);
    lines.push(`export interface ${type.name} {`);
    for (const field of type.resolved.filter(field => !field.padding)) {
      const typeName = ts[field.type] ?? field.type;
      lines.push(`  /** offset ${field.offset}${field.count > 1 ? `, ${field.count} elements` : ''} */`);
      lines.push(`  readonly ${field.name}: ${typeName}${field.count > 1 ? '[]' : ''};`);
    }
    lines.push('}');
    lines.push('');
  }
  lines.push('export const structSizes = {');
  for (const type of [...types.values()].filter(type => type.kind === 'struct').sort((a, b) => a.name.localeCompare(b.name))) lines.push(`  ${type.name}: ${type.size},`);
  lines.push('} as const;');
  lines.push('');
  lines.push('export const fieldOffsets = {');
  for (const type of [...types.values()].filter(type => type.kind === 'struct').sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`  ${type.name}: {`);
    for (const field of type.resolved.filter(field => !field.padding)) lines.push(`    ${field.name}: ${field.offset},`);
    lines.push('  },');
  }
  lines.push('} as const;');
  lines.push('');
  lines.push('export const globals = {');
  for (const document of documents.filter(item => item.document.kind === 'globals')) {
    for (const field of document.document.fields) lines.push(`  ${field.name}: ${field.address},`);
  }
  lines.push('} as const;');
  return lines.join('\n') + '\n';
}

function generateMarkdown() {
  const lines = [];
  lines.push('# Generated schema');
  lines.push('');
  lines.push('Generated by `node tools/gen-contracts.mjs` from `schema/layout/*.yaml` and `schema/protocol.yaml`.');
  lines.push('');
  for (const type of [...types.values()].filter(type => type.kind === 'struct').sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`## ${type.name}`);
    lines.push('');
    lines.push(`- Size: ${type.size} bytes`);
    lines.push(`- Alignment: ${type.alignment ?? 4}`);
    lines.push(`- Confidence: ${type.confidence ?? 'unknown'}`);
    if (type.file) lines.push(`- Layout: \`schema/layout/${type.file}\``);
    lines.push('');
    lines.push('| Offset | Field | Type | Count | Confidence |');
    lines.push('| ---: | --- | --- | ---: | --- |');
    for (const field of type.resolved) {
      if (field.padding) continue;
      lines.push(`| ${field.offset} | \`${field.name}\` | ${field.type} | ${field.count} | ${field.confidence ?? 'unknown'} |`);
    }
    lines.push('');
  }
  for (const document of documents.filter(item => item.document.kind === 'globals')) {
    lines.push(`## ${document.document.name} (globals)`);
    lines.push('');
    lines.push('| Address | Field | Type | Count | Confidence |');
    lines.push('| ---: | --- | --- | ---: | --- |');
    for (const field of document.document.fields) lines.push(`| ${field.address} | \`${field.name}\` | ${field.type} | ${field.count ?? 1} | ${field.confidence ?? 'unknown'} |`);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}


const petals = JSON.parse(await readFile(path.join(root, 'schema/catalogs/petals.json'), 'utf8'));
const entities = JSON.parse(await readFile(path.join(root, 'schema/catalogs/entities.json'), 'utf8'));
const spawnRules = JSON.parse(await readFile(path.join(root, 'schema/catalogs/spawn-rules.json'), 'utf8'));
const strings = JSON.parse(await readFile(path.join(root, 'schema/catalogs/strings.json'), 'utf8'));
const serverCatalogs = JSON.parse(await readFile(path.join(root, 'source/semantic/server-catalogs.json'), 'utf8'));
const spawnDefaults = JSON.parse(await readFile(path.join(root, 'schema/catalogs/entity-spawn-defaults.json'), 'utf8'));
const petalCombat = JSON.parse(await readFile(path.join(root, 'schema/catalogs/petal-combat.json'), 'utf8'));
const dropChances = JSON.parse(await readFile(path.join(root, 'schema/catalogs/drop-chances.json'), 'utf8'));

function generateCatalogCpp() {
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs. Do not edit by hand.');
  lines.push('#pragma once');
  lines.push('#include <cstddef>');
  lines.push('#include <cstdint>');
  lines.push('');
  lines.push('namespace engine::catalog {');
  lines.push(`inline constexpr std::size_t kPetalCount = ${petals.count};`);
  lines.push(`inline constexpr std::size_t kEntityCount = ${entities.count};`);
  lines.push(`inline constexpr std::size_t kSpawnRuleCount = ${spawnRules.count};`);
  lines.push(`inline constexpr std::size_t kStringCount = ${strings.count};`);
  lines.push('');
  lines.push('struct PetalCatalogEntry {');
  lines.push('  std::uint16_t typeId;');
  lines.push('  const char* name;');
  lines.push('  const char* const* descriptions;');
  lines.push('  std::uint8_t descriptionCount;');
  lines.push('  std::uint32_t rarityIndex;');
  lines.push('  float rechargeMilliseconds;');
  lines.push('  std::uint32_t instancesPerSlot;');
  lines.push('  float radius;');
  lines.push('  std::uint8_t flag40;');
  lines.push('  std::uint8_t flag41;');
  lines.push('  float field44;');
  lines.push('  std::uint32_t factoryTableIndex;');
  lines.push('};');
  lines.push('');
  lines.push('struct EntityCatalogEntry {');
  lines.push('  std::uint16_t typeId;');
  lines.push('  const char* name;');
  lines.push('  const char* const* descriptions;');
  lines.push('  std::uint8_t descriptionCount;');
  lines.push('  std::uint32_t rarity;');
  lines.push('  float scale;');
  lines.push('  const std::uint32_t* petalTypeIds;');
  lines.push('  std::uint8_t petalTypeIdCount;');
  lines.push('  std::uint8_t componentDrawCount;');
  lines.push('  std::uint32_t field100;');
  lines.push('  std::uint32_t field104;');
  lines.push('  std::uint8_t field108;');
  lines.push('  std::uint8_t field109;');
  lines.push('  std::uint8_t field110;');
  lines.push('  float secondaryScale;');
  lines.push('};');
  lines.push('');
  lines.push('struct SpawnRuleCatalogEntry {');
  lines.push('  float weight;');
  lines.push('  const std::uint8_t* regionIds;');
  lines.push('  std::uint8_t regionCount;');
  lines.push('  std::uint8_t entityTypeId;');
  lines.push('};');
  lines.push('} // namespace engine::catalog');
  return lines.join('\n') + '\n';
}

function generateCatalogTs() {
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs. Do not edit by hand.');
  lines.push('export interface PetalCatalogEntry {');
  lines.push('  readonly typeId: number;');
  lines.push('  readonly name: string;');
  lines.push('  readonly descriptions: readonly string[];');
  lines.push('  readonly rarityIndex: number;');
  lines.push('  readonly rechargeMilliseconds: number;');
  lines.push('  readonly instancesPerSlot: number;');
  lines.push('  readonly radius: number;');
  lines.push('  readonly flags: { readonly offset40: number; readonly offset41: number; readonly offset44: number };');
  lines.push('  readonly factory: { readonly tableIndex: number; readonly functionIndex: number };');
  lines.push('}');
  lines.push('export interface EntityCatalogEntry {');
  lines.push('  readonly typeId: number;');
  lines.push('  readonly name: string;');
  lines.push('  readonly descriptions: readonly string[];');
  lines.push('  readonly rarity: number;');
  lines.push('  readonly scale: number;');
  lines.push('  readonly petalTypeIds: readonly number[];');
  lines.push('  readonly componentDrawCount: number;');
  lines.push('  readonly field100: number;');
  lines.push('  readonly field104: number;');
  lines.push('  readonly field108: number;');
  lines.push('  readonly field109: number;');
  lines.push('  readonly field110: number;');
  lines.push('  readonly secondaryScale: number;');
  lines.push('}');
  lines.push('export interface SpawnRuleCatalogEntry {');
  lines.push('  readonly index: number;');
  lines.push('  readonly weight: number;');
  lines.push('  readonly regionIds: readonly number[];');
  lines.push('  readonly entityTypeId: number;');
  lines.push('}');
  lines.push(`export const catalogCounts = { petals: ${petals.count}, entities: ${entities.count}, spawnRules: ${spawnRules.count}, strings: ${strings.count} } as const;`);
  return lines.join('\n') + '\n';
}

function generatePacketKeyHeader() {
  const bytes = serverCatalogs.packetXorKeyHex.match(/../g).map(value => parseInt(value, 16));
  if (bytes.length !== 256) throw new Error(`packet XOR key must be 256 bytes, found ${bytes.length}`);
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs from source/semantic/server-catalogs.json.');
  lines.push('#pragma once');
  lines.push('#include <array>');
  lines.push('#include <cstdint>');
  lines.push('');
  lines.push('namespace engine::net {');
  lines.push('inline constexpr std::array<std::uint8_t, 256> kPacketXorKey = {');
  for (let index = 0; index < bytes.length; index += 16) {
    lines.push('  ' + bytes.slice(index, index + 16).map(value => '0x' + value.toString(16).padStart(2, '0')).join(', ') + ',');
  }
  lines.push('};');
  lines.push('} // namespace engine::net');
  return lines.join('\n') + '\n';
}


function generatePacketKeyTs() {
  const bytes = serverCatalogs.packetXorKeyHex.match(/../g).map(value => parseInt(value, 16));
  if (bytes.length !== 256) throw new Error(`packet XOR key must be 256 bytes, found ${bytes.length}`);
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs from source/semantic/server-catalogs.json.');
  lines.push('export const PACKET_XOR_KEY: Uint8Array = Uint8Array.from([');
  for (let index = 0; index < bytes.length; index += 16) {
    lines.push('  ' + bytes.slice(index, index + 16).map(value => '0x' + value.toString(16).padStart(2, '0')).join(', ') + ',');
  }
  lines.push(']);');
  return lines.join('\n') + '\n';
}

function cppFloat(value) {
  return Number.isInteger(value) ? `${value}.0F` : `${value}F`;
}

function cppString(value) {
  return JSON.stringify(String(value));
}

function generateCatalogDataHeader() {
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs from schema/catalogs/*.json.');
  lines.push('// This is build-time data generation; the JSON files remain the source.');
  lines.push('#pragma once');
  lines.push('#include "engine/catalog/catalog_types.hpp"');
  lines.push('#include <cstddef>');
  lines.push('#include <iterator>');
  lines.push('');
  lines.push('namespace engine::catalog {');
  for (const petal of petals.petals) {
    if (petal.descriptions.length === 0) continue;
    lines.push(`inline constexpr const char* kPetalDescriptions_${petal.typeId}[] = {`);
    for (const description of petal.descriptions) lines.push(`  ${cppString(description)},`);
    lines.push('};');
  }
  lines.push('');
  lines.push('inline constexpr PetalCatalogEntry kPetals[] = {');
  for (const petal of petals.petals) {
    const descriptions = petal.descriptions.length ? `kPetalDescriptions_${petal.typeId}` : 'nullptr';
    lines.push(`  {${petal.typeId}, ${cppString(petal.name)}, ${descriptions}, ${petal.descriptions.length}, ${petal.rarityIndex}, ${cppFloat(petal.rechargeMilliseconds)}, ${petal.instancesPerSlot}, ${cppFloat(petal.radius)}, ${petal.flags.offset40}, ${petal.flags.offset41}, ${cppFloat(petal.flags.offset44)}, ${petal.factory.tableIndex}},`);
  }
  lines.push('};');
  lines.push('static_assert(std::size(kPetals) == kPetalCount);');
  lines.push('');
  for (const entity of entities.entities) {
    if (entity.descriptions.length === 0) continue;
    lines.push(`inline constexpr const char* kEntityDescriptions_${entity.typeId}[] = {`);
    for (const description of entity.descriptions) lines.push(`  ${cppString(description)},`);
    lines.push('};');
  }
  lines.push('');
  for (const entity of entities.entities) {
    if (entity.petalTypeIds.length === 0) continue;
    lines.push(`inline constexpr std::uint32_t kEntityPetals_${entity.typeId}[] = { ${entity.petalTypeIds.join(', ')} };`);
  }
  lines.push('');
  lines.push('inline constexpr EntityCatalogEntry kEntities[] = {');
  for (const entity of entities.entities) {
    const descriptions = entity.descriptions.length ? `kEntityDescriptions_${entity.typeId}` : 'nullptr';
    const petalIds = entity.petalTypeIds.length ? `kEntityPetals_${entity.typeId}` : 'nullptr';
    lines.push(`  {${entity.typeId}, ${cppString(entity.name)}, ${descriptions}, ${entity.descriptions.length}, ${entity.rarity}, ${cppFloat(entity.scale)}, ${petalIds}, ${entity.petalTypeIds.length}, ${entity.componentDrawCount}, ${entity.field100}, ${entity.field104}, ${entity.field108}, ${entity.field109}, ${entity.field110}, ${cppFloat(entity.field112)}},`);
  }
  lines.push('};');
  lines.push('static_assert(std::size(kEntities) == kEntityCount);');
  lines.push('');
  for (const rule of spawnRules.rules) {
    lines.push(`inline constexpr std::uint8_t kSpawnRegions_${rule.index}[] = { ${rule.regionIds.length ? rule.regionIds.join(', ') : '0'} };`);
  }
  lines.push('');
  lines.push('inline constexpr SpawnRuleCatalogEntry kSpawnRules[] = {');
  for (const rule of spawnRules.rules) {
    lines.push(`  {${cppFloat(rule.weight)}, kSpawnRegions_${rule.index}, ${rule.regionIds.length}, ${rule.entityTypeId}},`);
  }
  lines.push('};');
  lines.push('static_assert(std::size(kSpawnRules) == kSpawnRuleCount);');
  lines.push('} // namespace engine::catalog');
  return lines.join('\n') + '\n';
}


function generateSpawnDefaultsHeader() {
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs from schema/catalogs/entity-spawn-defaults.json.');
  lines.push('#pragma once');
  lines.push('#include <cstddef>');
  lines.push('#include <cstdint>');
  lines.push('');
  lines.push('namespace engine::catalog {');
  lines.push('struct EntitySpawnDefaults {');
  lines.push('  std::uint16_t typeId;');
  lines.push('  const char* name;');
  lines.push('  float radius;');
  lines.push('  float contactDamage;');
  lines.push('  float health;');
  lines.push('  float maxHealth;');
  lines.push('  std::uint8_t flags92;');
  lines.push('  std::uint8_t flags93;');
  lines.push('  std::uint8_t flags95;');
  lines.push('  std::uint32_t physicsFlag48;');
  lines.push('  bool dynamicRadius;');
  lines.push('};');
  lines.push('');
  lines.push('inline constexpr EntitySpawnDefaults kEntitySpawnDefaults[] = {');
  for (const entry of spawnDefaults.defaults) {
    lines.push(`  {${entry.typeId}, ${cppString(entry.name)}, ${cppFloat(entry.radius)}, ${cppFloat(entry.contactDamage)}, ${cppFloat(entry.health)}, ${cppFloat(entry.maxHealth)}, ${entry.flags92}, ${entry.flags93}, ${entry.flags95}, ${entry.physicsFlag48}, ${entry.dynamicRadius ? 'true' : 'false'}},`);
  }
  lines.push('};');
  lines.push('static_assert(std::size(kEntitySpawnDefaults) == ' + spawnDefaults.defaults.length + ');');
  lines.push('} // namespace engine::catalog');
  return lines.join('\n') + '\n';
}

function generateCatalogMarkdown() {
  const lines = [];
  lines.push('# Generated catalogs');
  lines.push('');
  lines.push('Source: `source/semantic/server-catalogs.json`, split by `tools/split-catalogs.mjs`.');
  lines.push('C++/TS consumers use the generated views; the JSON files remain the source.');
  lines.push('');
  lines.push(`## Petals (${petals.count})`);
  lines.push('');
  lines.push('| Id | Name | Rarity | Recharge ms | Instances | Radius | Factory |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const petal of petals.petals) lines.push(`| ${petal.typeId} | ${petal.name} | ${petal.rarityIndex} | ${petal.rechargeMilliseconds} | ${petal.instancesPerSlot} | ${petal.radius} | ${petal.factory.tableIndex} |`);
  lines.push('');
  lines.push(`## Entities (${entities.count})`);
  lines.push('');
  lines.push('| Id | Name | Rarity | Scale | Drops |');
  lines.push('| ---: | --- | ---: | ---: | --- |');
  for (const entity of entities.entities) lines.push(`| ${entity.typeId} | ${entity.name} | ${entity.rarity} | ${entity.scale} | ${entity.petalTypeIds.join(', ')} |`);
  lines.push('');
  lines.push(`## Spawn rules (${spawnRules.count})`);
  lines.push('');
  lines.push('| # | Weight | Regions | Entity |');
  lines.push('| ---: | ---: | --- | ---: |');
  for (const rule of spawnRules.rules) lines.push(`| ${rule.index} | ${rule.weight} | ${rule.regionIds.join(', ')} | ${rule.entityTypeId} |`);
  lines.push('');
  lines.push(`## Petal combat (${petalCombat.count})`);
  lines.push('');
  lines.push('| Id | Name | Rarity | Collision radius | Damage | Health | Orbit | Attack | Defend |');
  lines.push('| ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |');
  for (const petal of petalCombat.petals) lines.push(`| ${petal.typeId} | ${petal.name} | ${petal.rarityIndex} | ${petal.collisionRadius} | ${petal.damage} | ${petal.health} | ${petal.orbitProfile} | ${petal.orbitAttack} | ${petal.orbitDefend} |`);
  lines.push('');
  lines.push(`## Drop chances (${dropChances.entities.length})`);
  lines.push('');
  lines.push('| Entity | Name | Drops (petal:chance) |');
  lines.push('| ---: | --- | --- |');
  for (const entity of dropChances.entities) lines.push(`| ${entity.typeId} | ${entity.name} | ${entity.drops.map(drop => `${drop.petalTypeId}:${drop.chance}`).join(', ')} |`);
  return lines.join('\n') + '\n';
}

function generatePetalCombatHeader() {
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs from schema/catalogs/petal-combat.json.');
  lines.push('// Source: catalog petal records + recovered slot-2 initializer bodies.');
  lines.push('#pragma once');
  lines.push('#include <cstddef>');
  lines.push('#include <cstdint>');
  lines.push('');
  lines.push('namespace engine::catalog {');
  lines.push('struct PetalCombat {');
  lines.push('  std::uint16_t typeId;');
  lines.push('  std::uint32_t rarityIndex;');
  lines.push('  float rechargeMilliseconds;');
  lines.push('  std::uint32_t instancesPerSlot;');
  lines.push('  float drawRadius;');
  lines.push('  std::uint16_t initializerFunctionIndex;');
  lines.push('  float collisionRadius;');
  lines.push('  float damage;');
  lines.push('  float health;');
  lines.push('  std::uint16_t orbitFunctionIndex;');
  lines.push('  const char* orbitProfile;');
  lines.push('  float orbitAttack;');
  lines.push('  float orbitDefend;');
  lines.push('};');
  lines.push('');
  lines.push('inline constexpr PetalCombat kPetalCombat[] = {');
  for (const petal of petalCombat.petals) {
    lines.push(`  {${petal.typeId}, ${petal.rarityIndex}, ${cppFloat(petal.rechargeMilliseconds)}, ${petal.instancesPerSlot}, ${cppFloat(petal.drawRadius)}, ${petal.initializerFunctionIndex ?? 0}, ${cppFloat(petal.collisionRadius)}, ${cppFloat(petal.damage)}, ${cppFloat(petal.health)}, ${petal.orbitFunctionIndex ?? 0}, ${cppString(petal.orbitProfile ?? 'default')}, ${cppFloat(petal.orbitAttack ?? 130)}, ${cppFloat(petal.orbitDefend ?? 40)}},`);
  }
  lines.push('};');
  lines.push(`static_assert(std::size(kPetalCombat) == ${petalCombat.count});`);
  lines.push('} // namespace engine::catalog');
  return lines.join('\n') + '\n';
}

function generateDropChancesHeader() {
  const lines = [];
  lines.push('// Generated by tools/gen-contracts.mjs from schema/catalogs/drop-chances.json.');
  lines.push('// Derived by tools/derive-drop-chances.mjs; verified against the original wasm.');
  lines.push('#pragma once');
  lines.push('#include <cstddef>');
  lines.push('#include <cstdint>');
  lines.push('');
  lines.push('namespace engine::catalog {');
  lines.push('struct DropChance {');
  lines.push('  std::uint16_t petalTypeId;');
  lines.push('  float chance;');
  lines.push('};');
  lines.push('');
  lines.push('struct EntityDropTable {');
  lines.push('  std::uint16_t typeId;');
  lines.push('  const DropChance* drops;');
  lines.push('  std::uint8_t dropCount;');
  lines.push('  std::uint16_t aliasOf;');
  lines.push('};');
  lines.push('');
  for (const entity of dropChances.entities) {
    if (entity.drops.length === 0) continue;
    lines.push(`inline constexpr DropChance kEntityDrops_${entity.typeId}[] = {`);
    for (const drop of entity.drops) lines.push(`  {${drop.petalTypeId}, ${cppFloat(drop.chance)}},`);
    lines.push('};');
  }
  lines.push('');
  lines.push('inline constexpr EntityDropTable kEntityDropTables[] = {');
  for (const entity of dropChances.entities) {
    const drops = entity.drops.length ? `kEntityDrops_${entity.typeId}` : 'nullptr';
    lines.push(`  {${entity.typeId}, ${drops}, ${entity.drops.length}, ${entity.aliasOf ?? 0}},`);
  }
  lines.push('};');
  lines.push(`static_assert(std::size(kEntityDropTables) == ${dropChances.entities.length});`);
  lines.push('');
  lines.push('inline constexpr double kDropAreaMix[8] = {');
  lines.push('  ' + dropChances.constants.areaMix.map(value => `${value}`).join(', ') + ',');
  lines.push('};');
  lines.push('inline constexpr double kPetalDropMass[6] = {');
  lines.push('  ' + dropChances.constants.petalDropMass.map(value => `${value}`).join(', ') + ',');
  lines.push('};');
  lines.push(`inline constexpr std::uint16_t kDropReferenceSpecies = ${dropChances.constants.referenceSpecies};`);
  lines.push(`inline constexpr double kDropReferenceMass = ${dropChances.constants.referenceMass};`);
  lines.push('} // namespace engine::catalog');
  return lines.join('\n') + '\n';
}

function generateContractsJson() {
  return {
    schema: 1,
    generatedBy: 'tools/gen-contracts.mjs',
    structs: Object.fromEntries([...types.values()].filter(type => type.kind === 'struct').map(type => [type.name, {
      size: type.size, alignment: type.alignment ?? 4, confidence: type.confidence ?? 'unknown', file: type.file,
      fields: type.resolved.map(field => ({ name: field.name, offset: field.offset, type: field.type, count: field.count, size: field.size, confidence: field.confidence ?? 'unknown', padding: Boolean(field.padding) })),
    }])),
    globals: Object.fromEntries(documents.filter(item => item.document.kind === 'globals').flatMap(item => item.document.fields.map(field => [field.name, { address: field.address, type: field.type, count: field.count ?? 1 }]))),
    protocol: protocolContract,
  };
}

await mkdir(path.join(root, 'engine/include/engine/schema'), { recursive: true });
await mkdir(path.join(root, 'engine/include/engine/catalog'), { recursive: true });
await mkdir(path.join(root, 'engine/include/engine/net'), { recursive: true });
await mkdir(path.join(root, 'client/src/schema'), { recursive: true });
await mkdir(path.join(root, 'schema/generated'), { recursive: true });
await writeProtocolTables();
await writeFile(path.join(root, 'engine/include/engine/schema/generated.hpp'), generateCpp());
await writeFile(path.join(root, 'client/src/schema/generated.ts'), generateTs());
await writeFile(path.join(root, 'docs/schema.md'), generateMarkdown());
await writeFile(path.join(root, 'schema/generated/contracts.json'), JSON.stringify(generateContractsJson(), null, 2) + '\n');
await writeFile(path.join(root, 'engine/include/engine/catalog/catalog_types.hpp'), generateCatalogCpp());
await writeFile(path.join(root, 'engine/include/engine/catalog/generated_catalog_data.hpp'), generateCatalogDataHeader());
await writeFile(path.join(root, 'engine/include/engine/catalog/entity_spawn_defaults.hpp'), generateSpawnDefaultsHeader());
await writeFile(path.join(root, 'engine/include/engine/catalog/petal_combat.hpp'), generatePetalCombatHeader());
await writeFile(path.join(root, 'engine/include/engine/catalog/drop_chances.hpp'), generateDropChancesHeader());
await writeFile(path.join(root, 'engine/include/engine/net/packet_key.hpp'), generatePacketKeyHeader());
await writeFile(path.join(root, 'client/src/schema/packet-key.ts'), generatePacketKeyTs());
await writeFile(path.join(root, 'client/src/schema/catalogs.ts'), generateCatalogTs());
await writeFile(path.join(root, 'docs/catalogs.md'), generateCatalogMarkdown());
console.log(JSON.stringify({ structs: [...types.values()].filter(type => type.kind === 'struct').map(type => ({ name: type.name, size: type.size, fields: type.resolved.filter(field => !field.padding).length })), globals: documents.filter(item => item.document.kind === 'globals').reduce((sum, item) => sum + item.document.fields.length, 0) }, null, 2));
