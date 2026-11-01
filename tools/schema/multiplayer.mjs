import { parse } from 'yaml';
import { createHash } from 'node:crypto';

const primitive = { u8: 'std::uint8_t', u16: 'std::uint16_t', u32: 'std::uint32_t', f32: 'float', f64: 'double', bool: 'bool', string: 'std::string' };
const cap = s => s[0].toUpperCase() + s.slice(1);
export function multiplayerOutputs(source, catalogInputs, protocol) {
  const s = parse(source);
  const fail = message => { throw new Error(`multiplayer schema: ${message}`); };
  if (s.version !== 2 || s.magic !== 'FLR2' || s.headerBytes !== 16) fail('unsupported framing');
  for (const [name, value] of Object.entries(s.limits))
    if (!/^[a-zA-Z]\w*$/.test(name) || !Number.isInteger(value) || value < 1 || value > 0xffffffff) fail(`invalid limit ${name}`);
  const limit = x => typeof x === 'string' ? s.limits[x] ?? fail(`unknown limit ${x}`) : x;
  const types = new Set(Object.keys(primitive));
  const ids = new Set();
  for (const [name, values] of Object.entries(s.enums)) {
    if (types.has(name) || !Object.keys(values).length) fail(`enum ${name}`);
    const numbers = Object.values(values);
    if (new Set(numbers).size !== numbers.length || numbers.some(x => !Number.isInteger(x) || x < 0 || x > 255)) fail(`enum values ${name}`);
    types.add(name);
  }
  for (const [name, fields] of Object.entries(s.records)) {
    for (const [field, f] of Object.entries(fields)) {
      if (!/^[a-zA-Z]\w*$/.test(field)) fail(`field ${field}`);
      if (f.type === 'array' ? !types.has(f.items) : f.type !== 'bytes' && !types.has(f.type)) fail(`type ${name}.${field}`);
      if (['array', 'bytes', 'string'].includes(f.type) && !(limit(f.count ?? f.max) > 0)) fail(`unbounded ${name}.${field}`);
      if (f.type === 'string' && (!Number.isInteger(f.codePoints) || !['plain', 'room', 'nickname', 'hash'].includes(f.text))) fail(`text ${name}.${field}`);
      if (f.min !== undefined && f.max !== undefined && f.min > limit(f.max)) fail(`range ${name}.${field}`);
    }
    if (types.has(name)) fail(`duplicate type ${name}`);
    types.add(name);
  }
  for (const [name, m] of Object.entries(s.messages)) {
    if (!s.records[name] || !Number.isInteger(m.id) || m.id < 1 || m.id > 255 || ids.has(m.id)
      || !['client', 'server', 'both'].includes(m.direction) || !['zero', 'nonzero', 'any'].includes(m.epoch)) fail(`message ${name}`);
    ids.add(m.id);
    if (m.matchesField && s.records[name][m.matchesField]?.type !== 'u32') fail(`epoch field ${name}`);
  }
  const groups = s.visibility.publicDenseGroups.map(offset => protocol.denseGroups.find(g => g.offset === offset) ?? fail(`dense group ${offset}`));
  const publicMask = groups.reduce((mask,g) => (mask | (1 << (g.component-1))) >>> 0,0);
  for (const field of s.visibility.publicFields) {
    const f = protocol.fields.find(f => f.id === field);
    if (!f || !['byte','float','interpolatedFloat','specialFloat','angleRaw16','string'].includes(f.type)) fail(`public field ${field}`);
  }
  if (JSON.stringify(s.visibility.publicDenseGroups) !== '[116,120,140,152]') fail('public dense codec recipe changed');
  for (const group of groups) if (group.fields.some(f => !s.visibility.publicFields.includes(f))) fail(`private dense group ${group.offset}`);
  const catalogHash = createHash('sha256').update(JSON.stringify(catalogInputs)).digest('hex');
  const cppBase = f => f.type === 'array' ? (f.count ? `std::array<${primitive[f.items] ?? f.items}, ${f.count}>` : `std::vector<${primitive[f.items] ?? f.items}>`)
    : f.type === 'bytes' ? (f.count ? `std::array<std::uint8_t, ${f.count}>` : 'std::vector<std::uint8_t>') : primitive[f.type] ?? f.type;
  const cppType = f => f.optional ? `std::optional<${cppBase(f)}>` : cppBase(f);
  const tsType = f => f.type === 'array' ? `Array<${primitive[f.items] ? 'number' : f.items}>` : f.type === 'bytes' ? 'Uint8Array'
    : f.type === 'string' ? 'string' : f.type === 'bool' ? 'boolean' : primitive[f.type] ? 'number' : f.type;
  const bounds = f => `${f.min ?? (f.type.startsWith('f') ? '-Infinity' : 0)}, ${limit(f.max) ?? (f.type === 'u8' ? 255 : f.type === 'u16' ? 65535 : f.type === 'u32' ? 4294967295 : 'Infinity')}`;
  const cppBounds = f => bounds(f).replaceAll('-Infinity', '-INFINITY').replaceAll('Infinity', 'INFINITY');
  function rw(f, value, mode, lang) {
    const w = mode === 'write', cpp = lang === 'cpp';
    const c = cpp ? ';' : ';';
    const field = (x, v) => rw(x, v, mode, lang);
    if (f.optional) {
      const plain = { ...f, optional: false };
      return w ? (cpp ? `w.boolean(${value}.has_value()); if (${value}) { ${field(plain, `*${value}`)} }` : `w.boolean(${value} !== undefined); if (${value} !== undefined) { ${field(plain, value)} }`)
        : (cpp ? `if (r.boolean()) { ${cppBase(f)} item{}; ${field(plain, 'item')} ${value} = std::move(item); }` : `if (r.boolean()) { ${field(plain, value)} }`);
    }
    if (f.type === 'array') {
      const sub = { type: f.items };
      if (w) return `w.length(${value}.${cpp ? 'size()' : 'length'}, ${f.count ?? 0}, ${limit(f.max) ?? f.count}, ${f.count ? 'false' : 'true'}); ${cpp ? `for (const auto& item : ${value})` : `for (const item of ${value})`} { ${field(sub, 'item')} }`;
      return `{ ${cpp ? 'const auto' : 'const'} count = r.length(${f.count ?? 0}, ${limit(f.max) ?? f.count}, ${f.count ? 'false' : 'true'}); ${cpp ? (!f.count ? `${value}.resize(count);` : '') : `${value} = [];`} for (${cpp ? 'std::size_t' : 'let'} i = 0; i < count; ++i) { ${field(sub, `${value}[i]`)} } }`;
    }
    if (f.type === 'bytes') {
      const basic = w ? `w.bytes(${value}, ${f.count ?? 0}, ${limit(f.max) ?? f.count});` : `${cpp ? `r.bytes(${value}` : `${value} = r.bytes(`}${cpp ? ', ' : ''}${f.count ?? 0}, ${limit(f.max) ?? f.count});`;
      return basic + (f.nonzero ? (cpp ? ` if (std::all_of(${value}.begin(),${value}.end(),[](auto b){return b==0;})) ${w ? 'w' : 'r'}.fail();` : ` if (!${value}.some(b=>b!==0)) throw new Error('zero identity');`) : '');
    }
    if (f.type === 'string') return w ? `w.text(${value}, ${limit(f.max)}, ${f.codePoints}, "${f.text}");` : `${value} = r.text(${limit(f.max)}, ${f.codePoints}, "${f.text}");`;
    if (f.type === 'bool') return w ? `w.boolean(${value});` : `${value} = r.boolean();`;
    if (primitive[f.type]) return w ? `w.${f.type}(${value}, ${cpp ? cppBounds(f) : bounds(f)});` : `${value} = r.${f.type}(${cpp ? cppBounds(f) : bounds(f)});`;
    if (s.enums[f.type]) return w ? `${cpp ? `if (!valid(${value})) w.fail(); w.u8(static_cast<std::uint8_t>(${value}))` : `if (!Object.values(${f.type}).includes(${value})) throw new Error('enum'); w.u8(${value})`}${c}`
      : `${value} = ${cpp ? `static_cast<${f.type}>(r.u8())` : `r.u8() as ${f.type}`}; ${cpp ? `if (!valid(${value})) r.fail();` : `if (!Object.values(${f.type}).includes(${value})) throw new Error('enum');`}`;
    return w ? `write${f.type}(w, ${value});` : `${value} = read${f.type}(r);`;
  }
  let cpp = `// Generated by tools/generate.mjs from schema/multiplayer.yaml. Do not edit.\n#pragma once\n#include "engine/net/multiplayer_wire.hpp"\n#include <variant>\nnamespace engine::net {\ninline constexpr std::uint16_t kProtocolVersion = 2;\ninline constexpr std::string_view kCatalogHash = "${catalogHash}";\n`;
  let ts = `// Generated by tools/generate.mjs from schema/multiplayer.yaml. Do not edit.\nimport { WireReader, WireWriter, frame, unframe, validatePublicEntity } from '../net/multiplayer-wire.js';\nexport const PROTOCOL_VERSION = 2;\nexport const CATALOG_HASH = '${catalogHash}';\nexport const LIMITS = ${JSON.stringify(s.limits, null, 2)} as const;\n`;
  for (const [key, val] of Object.entries(s.limits)) cpp += `inline constexpr std::uint32_t k${cap(key)} = ${val}U;\n`;
  for (const [name, values] of Object.entries(s.enums)) {
    cpp += `enum class ${name} : std::uint8_t { ${Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(', ')} };\ninline bool valid(${name} v) { return ${Object.keys(values).map(k => `v == ${name}::${k}`).join(' || ')}; }\n`;
    ts += `export enum ${name} { ${Object.entries(values).map(([k, v]) => `${k} = ${v}`).join(', ')} }\n`;
  }
  cpp += `inline constexpr std::array<std::uint32_t, ${s.visibility.publicFields.length}> kPublicFields = {${s.visibility.publicFields.join(',')}};\n`;
  cpp += `inline constexpr std::uint32_t kPublicComponentMask = ${publicMask}U;\n`;
  ts += `export const PUBLIC_COMPONENT_MASK = ${publicMask};\n`;
  for (const [name, fields] of Object.entries(s.records)) {
    cpp += `struct ${name} {\n${Object.entries(fields).map(([key, f]) => `  ${cppType(f)} ${key}${s.enums[f.type] && !f.optional ? ` = ${f.type}::${Object.keys(s.enums[f.type])[0]}` : '{}'};`).join('\n')}\n};\n`;
    ts += `export interface ${name} {\n${Object.entries(fields).map(([key, f]) => `  ${key}${f.optional ? '?' : ''}: ${tsType(f)};`).join('\n')}\n}\n`;
    cpp += `inline void write${name}(WireWriter& w, const ${name}& v) {\n${Object.entries(fields).map(([key, f]) => '  ' + rw(f, `v.${key}`, 'write', 'cpp')).join('\n')}\n${name === 'EntityUpdate' ? '  if (!validate_public_entity(v.fields,v.handle)) w.fail();' : ''}\n}\n`;
    cpp += `inline ${name} read${name}(WireReader& r) {\n  ${name} v;\n${Object.entries(fields).map(([key, f]) => '  ' + rw(f, `v.${key}`, 'read', 'cpp')).join('\n')}\n${name === 'EntityUpdate' ? '  if (!validate_public_entity(v.fields,v.handle)) r.fail();' : ''}\n  return v;\n}\n`;
    ts += `export function write${name}(w: WireWriter, v: ${name}): void {\n${Object.entries(fields).map(([key, f]) => '  ' + rw(f, `v.${key}`, 'write', 'ts')).join('\n')}\n${name === 'EntityUpdate' ? '  validatePublicEntity(v.fields,v.handle);' : ''}\n}\n`;
    ts += `export function read${name}(r: WireReader): ${name} {\n  const v = {} as ${name};\n${Object.entries(fields).map(([key, f]) => '  ' + rw(f, `v.${key}`, 'read', 'ts')).join('\n')}\n${name === 'EntityUpdate' ? '  validatePublicEntity(v.fields,v.handle);' : ''}\n  return v;\n}\n`;
  }
  cpp += `using MessageValue = std::variant<${Object.keys(s.messages).join(', ')}>;\nstruct Message { std::uint32_t sessionEpoch; MessageValue value; };\n`;
  ts += `export type Message = ${Object.entries(s.messages).map(([n, m]) => `{ type: ${m.id}; sessionEpoch: number; value: ${n} }`).join(' | ')};\n`;
  const epochCheck = (m, v) => m.epoch === 'zero' ? `${v} == 0` : m.epoch === 'nonzero' ? `${v} != 0` : 'true';
  for (const [n, m] of Object.entries(s.messages)) {
    cpp += `inline std::optional<std::vector<std::uint8_t>> encode_message(const ${n}& value, std::uint32_t sessionEpoch) {\n  if (!(${epochCheck(m, 'sessionEpoch')})${m.matchesField ? ` || value.${m.matchesField} != sessionEpoch` : ''}) return {};\n  WireWriter w; write${n}(w, value);\n  return w.frame(${m.id}, sessionEpoch, ${m.direction === 'client' ? 'kMaxClientFrameBytes' : 'kMaxServerFrameBytes'});\n}\n`;
  }
  cpp += `inline std::optional<Message> decode_message(std::span<const std::uint8_t> bytes, bool fromClient) {\n  auto h = unframe(bytes, fromClient ? kMaxClientFrameBytes : kMaxServerFrameBytes); if (!h) return {};\n  WireReader r(bytes.subspan(16));\n  switch(h->type) {\n${Object.entries(s.messages).map(([n, m]) => `    case ${m.id}: { if (!(${epochCheck(m, 'h->sessionEpoch')})${m.direction === 'both' ? '' : ` || ${m.direction === 'client' ? '!fromClient' : 'fromClient'}`}) return {}; auto v = read${n}(r); if (!r.done()${m.matchesField ? ` || v.${m.matchesField} != h->sessionEpoch` : ''}) return {}; return Message{h->sessionEpoch, std::move(v)}; }`).join('\n')}\n    default: return {};\n  }\n}\n} // namespace engine::net\n`;
  ts += `export function encodeMessage(m: Message): Uint8Array {\n  const w = new WireWriter();\n  switch (m.type) {\n${Object.entries(s.messages).map(([n, m]) => `    case ${m.id}: if (!(${epochCheck(m, 'm.sessionEpoch')})${m.matchesField ? ` || m.value.${m.matchesField} !== m.sessionEpoch` : ''}) throw new Error('epoch'); write${n}(w, m.value); return frame(m.type, m.sessionEpoch, w.finish(), LIMITS.${m.direction === 'client' ? 'maxClientFrameBytes' : 'maxServerFrameBytes'});`).join('\n')}\n  }\n}\n`;
  ts += `export function decodeMessage(bytes: Uint8Array, fromClient = false): Message | null {\n  try {\n    const h = unframe(bytes, fromClient ? LIMITS.maxClientFrameBytes : LIMITS.maxServerFrameBytes);\n    const r = new WireReader(bytes.subarray(16));\n    let result: Message;\n    switch (h.type) {\n${Object.entries(s.messages).map(([n, m]) => `      case ${m.id}: if (!(${epochCheck(m, 'h.sessionEpoch')})${m.direction === 'both' ? '' : ` || ${m.direction === 'client' ? '!fromClient' : 'fromClient'}`}) return null; result = { type: ${m.id}, sessionEpoch: h.sessionEpoch, value: read${n}(r) }; break;`).join('\n')}\n      default: return null;\n    }\n    r.done(); ${Object.entries(s.messages).filter(([,m]) => m.matchesField).map(([,m]) => `if (result.type === ${m.id} && result.value.${m.matchesField} !== result.sessionEpoch) return null;`).join(' ')} return result;\n  } catch { return null; }\n}\n`;
  ts += `export const PUBLIC_FIELDS = ${JSON.stringify(s.visibility.publicFields)} as const;\nexport const PUBLIC_DENSE_GROUPS = ${JSON.stringify(s.visibility.publicDenseGroups)} as const;\n`;
  cpp += '';
  const docs = `<!-- Generated by tools/generate.mjs from schema/multiplayer.yaml. Do not edit. -->\n# Multiplayer protocol v2\n\nCatalog SHA-256: \`${catalogHash}\`. Catalog identity hashes the canonical schema catalog inputs, excluding display-only changelog.\n\nOne binary WebSocket message = one frame. No XOR, Worker RPC or native struct layout. Integers/floats are little-endian; floats must be finite. Envelope: ASCII FLR2 (4), version u16=2, type u8, flags u8=0, sessionEpoch u32, payloadBytes u32; exactly 16 bytes. Unknown type/version/flags, wrong direction, invalid lengths and trailing bytes reject the whole message.\n\nStrings/variable arrays/bytes use canonical unsigned LEB128 u32 lengths (maximum five bytes, no overlong form). Fixed arrays/bytes omit length. Optional fields use a strict 0/1 byte then value. Strings use strict UTF-8 scalar values, bounded bytes/code points, no C0/C1 controls. Nicknames trim Unicode whitespace then require nonempty; room IDs match [A-Za-z0-9_-]{1,64}; hashes are 64 lowercase hex digits.\n\n${Object.entries(s.messages).map(([n, m]) => `## ${m.id}: ${n}\n\nDirection: ${m.direction}; envelope epoch: ${m.epoch}.\n\n| Field | Wire rule |\n| --- | --- |\n${Object.entries(s.records[n]).map(([k, f]) => `| ${k} | ${JSON.stringify(f)} |`).join('\n')}\n`).join('\n')}\n## Nested records\n\n${Object.entries(s.records).filter(([n]) => !s.messages[n]).map(([n, fields]) => `### ${n}\n\n| Field | Wire rule |\n| --- | --- |\n${Object.entries(fields).map(([k, f]) => `| ${k} | ${JSON.stringify(f)} |`).join('\n')}`).join('\n\n')}\n\n## Limits\n\n${Object.entries(s.limits).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\n## Visibility and replication\n\n${s.visibility.entityCodec}. Public field IDs: ${s.visibility.publicFields.join(', ')}. Public dense groups: ${s.visibility.publicDenseGroups.join(', ')}. Private fields appear only in the receiver's selfState: ${s.visibility.private.join(', ')}. Entity ownership is public; slot/instance are owner-local. Controlled handle 0 means no body.\n\nFull snapshots replace the entire entity/component state with a new baselineId; deltas require the same room/session/baseline and contiguous snapshotSeq. Event identity is roomEpoch + tick + ordinal, retained across resync and reset on new session binding. Resync never re-executes commands or rewards. Overflow closes the connection; encoded deltas cannot be dropped. Counters must drain before counterDrainAt, with a new room/session epoch before reuse. RoomEpoch and resume tokens require host cryptographic entropy, separate from World RNG. Welcome establishes identity; input/commands carry no player selector. Input receipt and actual simulation adoption are distinct. See [implementation contract](multiplayer/replication.md).\n`;
  return new Map([['engine/include/engine/net/generated_multiplayer.hpp', cpp], ['client/src/schema/multiplayer.ts', ts], ['docs/multiplayer-protocol.md', docs]]);
}
