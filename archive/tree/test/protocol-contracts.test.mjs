import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';
import ts from 'typescript';
import { parseProtocol, compileProtocol, generateProtocolCpp, generateProtocolTs } from '../tools/lib/protocol-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'schema/protocol.yaml'), 'utf8');
const document = parseProtocol(source);
const contract = compileProtocol(document);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'florr-protocol-contracts-'));
after(() => rm(temporary, { recursive: true, force: true }));
const read = relative => readFile(path.join(root, relative), 'utf8');

test('generated C++/TS and saved protocol exactly match YAML, covering 63 fields and 19 groups', async () => {
  assert.equal(await read('engine/include/engine/net/generated_protocol.hpp'), generateProtocolCpp(contract));
  assert.equal(await read('client/src/schema/protocol.ts'), generateProtocolTs(contract));
  assert.deepEqual(JSON.parse(await read('schema/generated/contracts.json')).protocol, contract);
  assert.equal(contract.fields.length, 63);
  assert.equal(contract.denseGroups.length, 19);
  assert.deepEqual(contract.denseGroups.find(group => group.offset === -16).fields,
    [3, 10, 11, 12, 19, 30, 39, 42, 45, 46, 52]);
  assert.deepEqual(contract.denseGroups.find(group => group.offset === -27).fields,
    [4, 15, 18, 25, 27, 33, 35, 41, 44, 51]);
  assert.deepEqual(contract.denseGroups.at(-1).extendedFields, [58, 59, 60, 61, 62, 63]);
  assert.equal(contract.constants.domainKindField, 26);
  assert.equal(contract.output.snapshot.domainExtensions.find(entry => entry.field === 26).permanent, true);
});

test('sparse contracts retain native XOR/indexed fields and the established domain scalar variant', () => {
  const { nativeSparse: native, domainSparse: domain } = contract.sparseModes;
  assert.equal(native.packetFormat, 'archived-client');
  assert.equal(domain.packetFormat, 'domain-counted');
  assert.equal(native.fieldDeltaXor, 1);
  assert.equal(native.indexDeltaXor, 1);
  assert.equal(domain.fieldDeltaXor, 0);
  assert.equal(domain.indexDeltaXor, 0);
  assert.equal(native.fieldTerminator, 1);
  assert.equal(domain.indexTerminator, 0);
  assert.equal(native.field26Role, 'player-model');
  assert.equal(domain.field26Role, 'entity-kind');
  for (const id of [4, 33, 35]) {
    assert.equal(native.fields[id - 1].encoding, 'indexed-update');
    assert.equal(domain.fields[id - 1].encoding, 'scalar');
    assert.equal(native.fields[id - 1].valueType, domain.fields[id - 1].valueType);
  }
  assert.match(contract.output.snapshot.sparseModes.domainSparse.note, /fields11\/12/);
  assert.equal(contract.output.snapshot.framing.fieldDeltaXor, undefined);
});

for (const [name, change, expected] of [
  ['missing wire type', s => { s.fieldTypes.byte = s.fieldTypes.byte.filter(id => id !== 1); }, /missing wire type/],
  ['duplicate wire type', s => { s.fieldTypes.varint.push(1); }, /duplicate wire type/],
  ['unknown wire type', s => { s.fieldTypes.uint24 = [1]; }, /unknown wire type/],
  ['missing component', s => { delete s.fieldComponents[63]; }, /missing component/],
  ['invalid constructor', s => { s.fieldComponents[2].constructor = '491'; }, /constructor/],
  ['invalid offset', s => { s.fieldComponents[2].offset = -1; }, /offset/],
  ['unknown component field', s => { s.fieldComponents[64] = { constructor: 0, offset: 0 }; }, /unknown field metadata/],
  ['missing indexed metadata', s => { delete s.indexedFields[60]; }, /missing indexed/],
  ['wrong indexed type', s => { s.indexedFields[61].element = 'byte'; }, /disagrees/],
  ['unsupported indexed count', s => { s.indexedFields[60].count = 15; }, /unsupported dense type/],
  ['duplicate dense field', s => { s.denseGroups[0].fields.push(54); }, /duplicate dense field/],
  ['implicit zero in dense -16', s => { s.denseGroups.find(g => g.offset === -16).fields.push(0); }, /expected integer/],
  ['duplicate dense group', s => { s.denseGroups[1].offset = 52; }, /duplicate offset/],
  ['missing dense field', s => { s.denseGroups.find(g => g.offset === -27).fields.pop(); }, /missing dense group/],
  ['wrong dense ordering', s => { s.denseGroups[0].fields.reverse(); }, /strictly ordered/],
  ['missing sparse mode', s => { delete s.sparseModes.nativeSparse; }, /expected mapping/],
  ['unknown sparse mode', s => { s.sparseModes.other = {}; }, /unknown sparse mode/],
  ['wrong domain XOR', s => { s.sparseModes.domainSparse.indexDeltaXor = 1; }, /established sparse framing/],
  ['missing native indexed field', s => { s.sparseModes.nativeSparse.indexedFields = s.sparseModes.nativeSparse.indexedFields.filter(id => id !== 4); }, /indexed\/scalar/],
  ['duplicate indexed field', s => { s.sparseModes.nativeSparse.indexedFields.push(4); }, /duplicate indexed/],
  ['invented domain indexed scalar', s => { s.sparseModes.domainSparse.indexedFields.push(33); }, /indexed\/scalar/],
  ['wrong domain field26 role', s => { s.sparseModes.domainSparse.field26Role = 'player-model'; }, /field26 role/],
  ['removed permanent kind', s => { s.domainExtensions[0].permanent = false; }, /permanent byte kind/],
]) test(`protocol compilation rejects ${name}`, () => {
  const value = structuredClone(document);
  change(value.output.snapshot);
  assert.throws(() => compileProtocol(value), expected);
});

test('duplicate YAML keys are rejected rather than silently replacing protocol fields', () => {
  assert.throws(() => parseProtocol('output:\n  snapshot: {}\n  snapshot: {}\n'), /unique|duplicate/i);
});

// Evaluate literal table expressions only, never execute recovered source.
function literal(node, flags = 0) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(entry => literal(entry, flags));
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(entry =>
    [entry.key.name ?? entry.key.value, literal(entry.value, flags)]));
  if (node.type === 'UnaryExpression' && node.operator === '-') return -literal(node.argument, flags);
  if (node.type === 'Identifier' && node.name === 'flags') return flags;
  if (node.type === 'BinaryExpression' && node.operator === '&') return literal(node.left, flags) & literal(node.right, flags);
  if (node.type === 'ConditionalExpression') return literal(node.test, flags) ? literal(node.consequent, flags) : literal(node.alternate, flags);
  throw new Error(`Nonliteral frozen table expression ${node.type}`);
}
function initializer(ast, name) {
  let found;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id.name === name) {
      assert.equal(found, undefined, `ambiguous frozen table ${name}`);
      found = node.init;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const entry of value) walk(entry);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  assert.ok(found, `missing frozen table ${name}`);
  return found;
}
async function frozen(relative) {
  for (const prefix of ['source', 'legacy/source']) {
    try { return await read(`${prefix}/${relative}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new Error(`Missing frozen oracle source ${relative}`);
}

test('all generated field widths/component mappings and 19 groups match the frozen decoder', async () => {
  const ast = parse(await frozen('game/client/entity-snapshot.mjs'), { ecmaVersion: 'latest', sourceType: 'module' });
  const expected = new Map();
  for (const [name, type, dense] of [['byteFields', 'byte', 'byte'], ['floatFields', 'float', 'f32'], ['interpolatedFields', 'interpolatedFloat', 'f32']]) {
    for (const [id, [constructor, offset]] of Object.entries(literal(initializer(ast, name))))
      expected.set(Number(id), { component: { constructor, offset }, type, denseType: dense });
  }
  const arrays = literal(initializer(ast, 'arrayFields'));
  const elementTypes = { handle: 'reference', string: 'string', byte: 'byte', bit: 'bit', double: 'f64', varint: 'varint', short: 'short' };
  const arrayTypes = { handle: 'handleArray', string: 'stringArray', byte: 'byteArray', varint: 'varintArray', short: 'shortArray' };
  for (const [id, [constructor, offset, kind, count]] of Object.entries(arrays)) {
    const element = elementTypes[kind];
    expected.set(Number(id), { component: { constructor, offset },
      type: id === '4' ? 'string' : id === '33' ? 'bit' : id === '35' ? 'double' : arrayTypes[kind],
      denseType: count === 1 ? element : `${kind === 'handle' ? 'handle' : element}Array${count}`,
      indexed: { element, count } });
  }
  // Special readField branches outside the literal tables, independently read
  // from the frozen decoder. These are expectations, never production tables.
  const special = [
    [6, 478, 40, 'string', 'string'], [8, 609, 8, 'angleRaw16', 'angle'],
    [15, 0, 24, 'varint', 'varint'], [18, 0, 32, 'double', 'f64'],
    [23, 0, 8, 'reference', 'reference'], [27, 0, 56, 'specialFloat', 'f32'],
    [29, 533, 8, 'bit', 'bit'], [30, 477, 256, 'varint', 'varint'],
    [37, 0, 32, 'bit', 'bit'], [40, 533, 9, 'bit', 'bit'],
    [41, 0, 88, 'varint', 'varint'], [44, 0, 92, 'varint', 'varint'],
    [45, 477, 344, 'specialFloat', 'f32'], [48, 677, 8, 'string', 'string'],
    [51, 0, 96, 'varint', 'varint'], [52, 477, 356, 'varint', 'varint'],
    [56, 478, 144, 'reference', 'reference'], [57, 0, 20, 'reference', 'reference'],
    [58, 491, 12, 'varint', 'varint'],
  ];
  for (const [id, constructor, offset, type, denseType] of special)
    expected.set(id, { component: { constructor, offset }, type, denseType });
  assert.equal(expected.size, 63);
  for (const field of contract.fields) {
    const { id, ...value } = field;
    assert.deepEqual(value, expected.get(id), `frozen field ${id}`);
  }
  for (const flags of [0, 64]) {
    const original = literal(initializer(ast, 'groups'), flags);
    const generated = contract.denseGroups.map(group => [group.offset,
      [...group.fields, ...(flags & 64 ? group.extendedFields : [])]]);
    assert.deepEqual(generated, original);
  }
  const wat = (await frozen('wasm/client.wat')).split('\n');
  for (const [line, offset] of [[258947, 1600], [259155, 1604], [259334, 1608]])
    assert.match(wat[line - 1], new RegExp(`i32\\.store offset=${offset}$`));
});

test('protocol-only check is read-only and detects stale generated output without changing other contracts', async () => {
  const fixture = path.join(temporary, 'check');
  for (const directory of ['schema/generated', 'engine/include/engine/net', 'client/src/schema'])
    await mkdir(path.join(fixture, directory), { recursive: true });
  const files = ['schema/protocol.yaml', 'schema/generated/contracts.json', 'engine/include/engine/net/generated_protocol.hpp', 'client/src/schema/protocol.ts'];
  for (const file of files) await writeFile(path.join(fixture, file), await read(file));
  const command = ['tools/gen-contracts.mjs', '--protocol-only', '--check'];
  const run = args => spawnSync(process.execPath, [path.join(root, args[0]), ...args.slice(1)], { cwd: fixture, encoding: 'utf8' });
  assert.equal(run(command).status, 0);
  const generated = path.join(fixture, files[2]);
  await writeFile(generated, '// stale\n');
  const before = await Promise.all(files.map(file => readFile(path.join(fixture, file), 'utf8')));
  const result = run(command);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale/);
  assert.deepEqual(await Promise.all(files.map(file => readFile(path.join(fixture, file), 'utf8'))), before);
  const saved = JSON.parse(before[1]);
  assert.equal(run(command.slice(0, -1)).status, 0);
  assert.deepEqual(await readFile(generated, 'utf8'), generateProtocolCpp(contract));
  const after = JSON.parse(await readFile(path.join(fixture, files[1]), 'utf8'));
  delete saved.protocol; delete after.protocol;
  assert.deepEqual(after, saved);
});

let fixturePromise;
function wireFixture() {
  return fixturePromise ??= (async () => {
    const native = path.join(temporary, 'wire.cpp');
    await writeFile(native, `#include "engine/net/snapshot_header.hpp"
#include "engine/net/dense_fields.hpp"
#include <cstdio>
#include <stdexcept>
void check(bool ok) { if (!ok) throw std::runtime_error("native wire assertion"); }
void print(const std::vector<std::uint8_t>& packet) { for (auto byte : packet) std::printf("%02x", byte); std::puts(""); }
int main() {
  static_assert(engine::protocol::validate_tables());
  static_assert(engine::kDenseFieldsMinus16.size() == 11);
  static_assert(engine::kDenseFieldsMinus27.size() == 10);
  static_assert(engine::protocol::kNativeSparse.field_delta_xor == 1);
  static_assert(engine::protocol::kDomainSparse.index_delta_xor == 0);
  for (unsigned field = 1; field <= 63; ++field) check(engine::dense_group_for_field(field) != nullptr);
  check(engine::dense_group_for_field(0) == nullptr);
  const auto handle = engine::EntityHandle::from_wire(0x12345678U);
  engine::OriginalSnapshotWriter writer;
  writer.begin(128, 4);
  writer.write_dense_group_minus27(handle, "a", 300, 1.5, "b", 2.5F, true, 3.5, 400, 16385, 268435457);
  const auto bytes = writer.finish();
  engine::ByteReader reader(bytes);
  check(reader.read_u8() == 1);
  check(reader.read_varint32() == 128); check(reader.read_varint32() == 4);
  check(reader.read_varint32() == 0); check(reader.read_varint32() == 1); check(reader.read_varint32() == 0);
  check(reader.read_u32_le() == 0x12345678U); check(reader.read_u8() == 62);
  check(reader.read_cstring() == "a"); check(reader.read_varint32() == 300);
  check(reader.read_f64_le() == 1.5); check(reader.read_cstring() == "b");
  check(reader.read_f32_le() == 2.5F); check(reader.read_u8() == 1);
  check(reader.read_f64_le() == 3.5); check(reader.read_varint32() == 400);
  check(reader.read_varint32() == 16385); check(reader.read_varint32() == 268435457);
  check(reader.eof()); print(bytes);
  writer.begin(129, 4); writer.write_mask_entity(handle, 1U << 26);
  writer.write_dense_group_minus27(handle, "a", 300, 1.5, "b", 2.5F, true, 3.5, 400, 16385, 268435457);
  print(writer.finish());
  writer.begin(130); writer.write_mask_string_field4(handle, 0, "domain");
  writer.write_mask_bit_field(handle, 0, 33, true);
  writer.write_mask_double_field35(handle, 0, 3.5);
  print(writer.finish());
}
`);
    const executable = path.join(temporary, 'wire');
    const compile = spawnSync(process.env.CXX || 'c++', ['-std=c++20', '-O0', '-ffp-contract=off', '-I', path.join(root, 'engine/include'), native, path.join(root, 'engine/src/net/snapshot_header.cpp'), '-o', executable], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr);
    const output = spawnSync(executable, [], { encoding: 'utf8' });
    assert.equal(output.status, 0, output.stderr);
    for (const relative of ['state/snapshot.ts', 'state/field-types.ts', 'schema/protocol.ts']) {
      const target = path.join(temporary, relative.replace(/\.ts$/, '.mjs'));
      await mkdir(path.dirname(target), { recursive: true });
      const js = ts.transpileModule(await read(`client/src/${relative}`), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
      await writeFile(target, js.replaceAll(".js'", ".mjs'"));
    }
    const decoded = await import(pathToFileURL(path.join(temporary, 'state/snapshot.mjs')).href);
    const fields = await import(pathToFileURL(path.join(temporary, 'state/field-types.mjs')).href);
    return { packets: output.stdout.trim().split('\n').map(hex => Uint8Array.from(Buffer.from(hex, 'hex'))), decoded, fields };
  })();
}

test('native writer/byte-reader covers all ten -27 fields; actual bytes roundtrip through generated TS specs', async () => {
  const { packets, decoded, fields } = await wireFixture();
  // Independent literal bytes include multibyte44/51; a matching writer/reader
  // bug cannot pass by agreeing only with each other or generated field specs.
  const expected = Buffer.from('01800104000100785634123e6100ac02000000000000f83f620000002040010000000000000c4090038180018180808001', 'hex');
  assert.deepEqual(Buffer.from(packets[0]), expected);
  const plan = [{ offset: -27, specs: fields.DENSE_GROUP_SPECS[-27] }];
  const decoder = new decoded.OriginalBareSnapshotDecoder(plan);
  const snapshot = decoder.decode(packets[1]);
  assert.ok(snapshot);
  assert.equal(snapshot.sequence, 129);
  assert.equal(snapshot.entities.length, 2);
  assert.deepEqual(snapshot.entities[1].denseFields,
    { 4: 'a', 15: 300, 18: 1.5, 25: 'b', 27: 2.5, 33: 1, 35: 3.5, 41: 400, 44: 16385, 51: 268435457 });
  assert.equal(decoder.decode(packets[1].slice(0, -1)), null);
  assert.equal(decoder.decode(Uint8Array.from([...packets[1], 0])), null);
});

test('actual domain writers and TS decoder retain scalar4/33/35 and raw field terminators', async () => {
  const { packets, decoded, fields } = await wireFixture();
  const snapshot = new decoded.OriginalBareSnapshotDecoder().decode(packets[2]);
  assert.ok(snapshot);
  assert.equal(snapshot.entities[0].stringField4, 'domain');
  assert.equal(snapshot.entities[1].bitFields[33], 1);
  assert.equal(snapshot.entities[2].doubleField35, 3.5);
  assert.equal(fields.SPARSE_MODES.domainSparse.fieldDeltaXor, 0);
});
