#!/usr/bin/env node
/** Read-only schema gate. Only --emit-probe writes, to a CMake build directory.
 * The probe contains member selectors, not expected offsets or sizes. It checks
 * YAML against the actual compiler, independently of generated assertion text.
 * Successful compilation never upgrades a schema's evidence/confidence.
 */
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const primitive = { u8: [1, 'std::uint8_t'], u16: [2, 'std::uint16_t'], u32: [4, 'std::uint32_t'],
  u64: [8, 'std::uint64_t'], i8: [1, 'std::int8_t'], i16: [2, 'std::int16_t'],
  i32: [4, 'std::int32_t'], i64: [8, 'std::int64_t'], f32: [4, 'float'],
  f64: [8, 'double'], ptr: [4, 'std::uint32_t'], bool: [1, 'bool'] };
const identifier = value => {
  assert.match(value, /^[A-Za-z_][A-Za-z_0-9]*$/, 'schema member/type must be a C++ identifier');
  return value;
};

export async function loadLayouts(base = root) {
  const directory = path.join(base, 'schema/layout');
  const types = new Map(), globals = new Map();
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.yaml')).sort()) {
    const document = YAML.parse(await readFile(path.join(directory, file), 'utf8'));
    const addType = (name, type) => {
      assert(!types.has(name), `duplicate schema type ${name}`);
      types.set(identifier(name), { ...type, name, file, source: document.source,
        confidence: type.confidence ?? document.confidence ?? 'unknown' });
    };
    if (document.kind === 'types') for (const [name, type] of Object.entries(document.types)) addType(name, type);
    else if (document.kind === 'struct') addType(document.name, document);
    else if (document.kind === 'globals') for (const field of document.fields) {
      assert(!globals.has(field.name), `duplicate schema global ${field.name}`);
      globals.set(identifier(field.name), { ...field, file });
    }
    else throw new Error(`Unsupported layout document kind: ${file}`);
  }
  return { types, globals };
}

export function checkCompiledLayouts(layouts, entries) {
  const actual = new Map();
  for (const entry of entries) {
    assert(['struct', 'field', 'global'].includes(entry.kind), 'unknown compiler report entry');
    const key = `${entry.kind}:${entry.owner ? entry.owner + '.' : ''}${entry.name}`;
    assert(!actual.has(key), `duplicate compiler entry ${key}`);
    actual.set(key, entry);
  }
  const get = key => { const entry = actual.get(key); assert(entry, `missing compiler entry ${key}`); actual.delete(key); return entry; };
  const compiledTypes = new Map(), alignments = [];
  let fields = 0;
  for (const [name, type] of layouts.types) {
    const compiled = get(`struct:${name}`);
    assert.equal(compiled.size, type.size, `${name} size differs from current YAML`);
    assert.equal(compiled.standardLayout, true, `${name} must support offsetof`);
    assert.equal(compiled.triviallyCopyable, true, `${name} must remain a byte-layout record`);
    const members = new Map();
    for (const field of type.fields) {
      const member = get(`field:${name}.${field.name}`);
      const unit = primitive[field.type]?.[0] ?? layouts.types.get(field.type)?.size;
      assert(unit, `unknown schema type ${field.type}`);
      assert.equal(member.offset, field.offset, `${name}.${field.name} offset differs from current YAML`);
      assert.equal(member.size, unit * (field.count ?? 1), `${name}.${field.name} width/count differs from current YAML`);
      assert.equal(member.typeMatches, true, `${name}.${field.name} C++ scalar/record type differs from YAML`);
      members.set(field.name, member);
      fields++;
    }
    // YAML describes original allocation alignment; the generated structs are
    // packed byte views. Record both values without claiming oracle alignment.
    alignments.push({ name, declared: type.alignment, compiled: compiled.alignment });
    compiledTypes.set(name, { ...compiled, fields: members });
  }
  for (const [name, field] of layouts.globals)
    assert.equal(get(`global:${name}`).address, field.address, `${name} address differs from current YAML`);
  assert.equal(actual.size, 0, 'compiler report has entries absent from current YAML');
  return { types: compiledTypes, fields, alignments };
}

async function main(args) {
  const layouts = await loadLayouts();
  if (args[0] === '--emit-probe' && args.length === 2) {
    const lines = ['// Test selectors only: expected layout values are read from YAML at test time.'];
    for (const [name, type] of layouts.types) {
      lines.push(`SCHEMA_TYPE(${name})`);
      for (const field of type.fields) lines.push(`SCHEMA_FIELD(${name}, ${identifier(field.name)}, ${primitive[field.type]?.[1] ?? 'engine::schema::' + identifier(field.type)})`);
    }
    for (const name of layouts.globals.keys()) lines.push(`SCHEMA_GLOBAL(${name}, k${name[0].toUpperCase() + name.slice(1)})`);
    await mkdir(path.dirname(args[1]), { recursive: true });
    await writeFile(args[1], lines.join('\n') + '\n');
    return;
  }
  assert(args[0] === '--check' && args.length === 2, 'usage: check-schema-layouts.mjs --emit-probe <build-file> | --check <native-probe>');
  const result = spawnSync(path.resolve(args[1]), [], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr ?? 'native schema probe failed');
  const entries = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  const compiled = checkCompiledLayouts(layouts, entries);
  console.log('TAP version 13');
  console.log(`ok 1 - compiler matches ${layouts.types.size} YAML sizes, ${compiled.fields} offsets/widths/types and ${layouts.globals.size} globals`);
  console.log('# Layout consistency does not establish runtime truth for unprobed fields.');
  console.log('# Declared and compiled byte-view alignment: ' + JSON.stringify(compiled.alignments));
  console.log('1..1');
}

const invoked = process.argv[1] ? realpathSync(path.resolve(process.argv[1])) : null;
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url)))
  await main(process.argv.slice(2));
