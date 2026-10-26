/** Pure protocol validation/rendering. No writes and no oracle/runtime dependency. */
import YAML from 'yaml';

const scalarTypes = {
  byte: 'byte', float: 'f32', interpolatedFloat: 'f32', string: 'string',
  varint: 'varint', reference: 'reference', bit: 'bit', angleRaw16: 'angle',
  double: 'f64', specialFloat: 'f32',
};
const arrayTypes = { stringArray: 'string', byteArray: 'byte', handleArray: 'reference', varintArray: 'varint', shortArray: 'short' };
const denseTypes = ['byte', 'f32', 'f64', 'varint', 'angle', 'string', 'byteArray16', 'shortArray8', 'bit', 'reference', 'byteArray10', 'handleArray10', 'stringArray10', 'varintArray10'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = (location, message) => { throw new Error(`protocol ${location}: ${message}`); };
function object(value, location) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(location, 'expected mapping');
  return value;
}
function integer(value, location, minimum = 0, maximum = 0xffffffff) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(location, `expected integer ${minimum}..${maximum}`);
  return value;
}
function array(value, location) {
  if (!Array.isArray(value)) fail(location, 'expected array');
  return value;
}
function text(value, location) {
  if (typeof value !== 'string' || !value.length) fail(location, 'expected nonempty string');
  return value;
}
const pascal = value => value.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, separator, letter) => letter.toUpperCase());
const upper = value => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const cppEnum = value => `k${pascal(value)}`;
const groupName = offset => offset < 0 ? `Minus${-offset}` : String(offset);

export function parseProtocol(source) {
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw document.errors[0];
  return document.toJS();
}

export function compileProtocol(document) {
  object(document, 'root');
  const input = object(document.input, 'input'), output = object(document.output, 'output');
  const snapshot = object(output.snapshot, 'output.snapshot');
  const model = object(snapshot.componentModel, 'componentModel');
  const count = integer(model.sparseFieldCount, 'sparseFieldCount', 1, 255);
  const componentCount = integer(model.componentCount, 'componentCount', 1, 30);
  const types = object(snapshot.fieldTypes, 'fieldTypes');
  const fields = new Map();
  for (const [type, ids] of Object.entries(types)) {
    if (type === 'confidence' || type === 'note') continue;
    if (!own(scalarTypes, type) && !own(arrayTypes, type)) fail(`fieldTypes.${type}`, 'unknown wire type');
    for (const id of array(ids, `fieldTypes.${type}`)) {
      integer(id, `fieldTypes.${type}`, 1, count);
      if (fields.has(id)) fail(`field ${id}`, 'duplicate wire type');
      fields.set(id, { id, type });
    }
  }
  for (let id = 1; id <= count; ++id)
    if (!fields.has(id)) fail(`field ${id}`, 'missing wire type');
  const components = object(snapshot.fieldComponents, 'fieldComponents');
  const indexed = object(snapshot.indexedFields, 'indexedFields');
  for (const key of [...Object.keys(components), ...Object.keys(indexed)]) {
    if (!/^[1-9][0-9]*$/.test(key) || !fields.has(Number(key))) fail(`field ${key}`, 'unknown field metadata');
  }
  for (let id = 1; id <= count; ++id) {
    if (!own(components, id)) fail(`field ${id}`, 'missing component mapping');
    const field = fields.get(id), mapping = object(components[id], `field ${id} component`);
    field.component = {
      constructor: integer(own(mapping, 'constructor') ? mapping.constructor : undefined, `field ${id} constructor`, 0, 65535),
      offset: integer(mapping.offset, `field ${id} offset`, 0, 65535),
    };
    if (own(indexed, id)) {
      const entry = object(indexed[id], `field ${id} indexed`);
      const element = text(entry.element, `field ${id} element`);
      const length = integer(entry.count, `field ${id} count`, 1, 255);
      const expected = arrayTypes[field.type] ?? scalarTypes[field.type];
      if (element !== expected) fail(`field ${id}`, `indexed element ${element} disagrees with ${field.type}`);
      field.indexed = { element, count: length };
      field.denseType = length === 1 ? element
        : `${element === 'reference' ? 'handle' : element}Array${length}`;
    } else {
      if (own(arrayTypes, field.type)) fail(`field ${id}`, 'missing indexed field metadata');
      field.denseType = scalarTypes[field.type];
    }
    if (!denseTypes.includes(field.denseType)) fail(`field ${id}`, `unsupported dense type ${field.denseType}`);
  }
  const sparseModes = object(snapshot.sparseModes, 'sparseModes');
  for (const name of Object.keys(sparseModes)) {
    if (!['nativeSparse', 'domainSparse'].includes(name)) fail(`sparseModes.${name}`, 'unknown sparse mode');
  }
  const modes = {};
  for (const name of ['nativeSparse', 'domainSparse']) {
    const mode = object(sparseModes[name], `sparseModes.${name}`);
    const native = name === 'nativeSparse';
    const packetFormat = native ? 'archived-client' : 'domain-counted';
    const field26Role = native ? 'player-model' : 'entity-kind';
    if (mode.packetFormat !== packetFormat || mode.field26Role !== field26Role)
      fail(`sparseModes.${name}`, 'wrong packet format or field26 role');
    for (const key of ['fieldDeltaXor', 'indexDeltaXor']) {
      if (integer(mode[key], `sparseModes.${name}.${key}`, 0, 1) !== Number(native))
        fail(`sparseModes.${name}.${key}`, 'disagrees with the established sparse framing');
    }
    const indexedIds = new Set();
    for (const id of array(mode.indexedFields, `sparseModes.${name}.indexedFields`)) {
      integer(id, `sparseModes.${name} indexed field`, 1, count);
      if (!own(indexed, id)) fail(`sparseModes.${name} field ${id}`, 'missing indexed metadata');
      if (indexedIds.has(id)) fail(`sparseModes.${name} field ${id}`, 'duplicate indexed field');
      indexedIds.add(id);
    }
    for (const field of fields.values()) {
      const expectedIndexed = native ? own(indexed, field.id) : own(arrayTypes, field.type);
      if (indexedIds.has(field.id) !== expectedIndexed)
        fail(`sparseModes.${name} field ${field.id}`, 'wrong indexed/scalar encoding');
    }
    modes[name] = {
      packetFormat, fieldDeltaXor: mode.fieldDeltaXor, indexDeltaXor: mode.indexDeltaXor,
      fieldTerminator: mode.fieldDeltaXor, indexTerminator: mode.indexDeltaXor, field26Role,
      fields: [...fields.values()].sort((a, b) => a.id - b.id).map(field => ({
        field: field.id, encoding: indexedIds.has(field.id) ? 'indexed-update' : 'scalar',
        valueType: indexedIds.has(field.id) ? field.indexed.element : scalarTypes[field.type],
      })),
    };
  }
  const seenFields = new Set(), seenOffsets = new Set(), seenComponents = new Set();
  const groups = array(snapshot.denseGroups, 'denseGroups').map((entry, index) => {
    object(entry, `denseGroups[${index}]`);
    const offset = integer(entry.offset, 'dense group offset', -65535, 65535);
    const component = integer(entry.component, 'dense component', 1, componentCount);
    if (seenOffsets.has(offset) || seenComponents.has(component)) fail(`dense group ${offset}`, 'duplicate offset/component');
    if (offset === 0 || (offset < 0 && -offset !== component)) fail(`dense group ${offset}`, 'invalid component offset');
    seenOffsets.add(offset); seenComponents.add(component);
    const checkFields = (values, label) => {
      let previous = 0;
      return array(values, label).map(id => {
        integer(id, label, 1, count);
        if (seenFields.has(id)) fail(`field ${id}`, 'duplicate dense field');
        if (id <= previous) fail(label, 'fields must be strictly ordered');
        previous = id; seenFields.add(id);
        return id;
      });
    };
    const base = checkFields(entry.fields, `dense group ${offset}`);
    if (!base.length) fail(`dense group ${offset}`, 'empty group');
    const extended = own(entry, 'extendedFields') ? checkFields(entry.extendedFields, `dense group ${offset} extended`) : [];
    if (extended.length && component !== componentCount) fail(`dense group ${offset}`, 'only last component has extended fields');
    if (extended.length && extended[0] <= base.at(-1)) fail(`dense group ${offset}`, 'extended fields must follow base fields');
    return { offset, component, fields: base, extendedFields: extended,
      specs: [...base, ...extended].map(id => ({ field: id, type: fields.get(id).denseType })) };
  });
  if (groups.length !== integer(model.denseGroupCount, 'denseGroupCount', 1)) fail('denseGroups', 'count mismatch');
  for (const id of fields.keys()) if (!seenFields.has(id)) fail(`field ${id}`, 'missing dense group');
  const extendedCount = groups.reduce((sum, group) => sum + group.extendedFields.length, 0);
  if (extendedCount !== integer(model.denseComponent30ExtraFields, 'denseComponent30ExtraFields')) fail('extendedFields', 'count mismatch');
  const extensions = array(snapshot.domainExtensions, 'domainExtensions');
  const kind = extensions.find(entry => entry.field === 26);
  if (!kind || kind.permanent !== true || kind.type !== 'byte' || fields.get(26)?.type !== 'byte') fail('domainExtensions', 'field26 must remain the permanent byte kind extension');
  for (const entry of extensions) {
    if (!fields.has(entry.field) || fields.get(entry.field).type !== entry.type) fail('domainExtensions', 'unknown field or wrong wire type');
  }
  const worker = object(document.worker, 'worker');
  for (const direction of ['request', 'response']) {
    for (const field of array(worker[direction]?.fields, `worker.${direction}.fields`)) {
      text(field.name, `worker.${direction} name`);
      if (!['string', 'i32', 'bool', 'bytes'].includes(field.type)) fail(`worker.${direction}.${field.name}`, 'unknown wire type');
      if (own(field, 'optional') && typeof field.optional !== 'boolean') fail(`worker.${direction}.${field.name}`, 'optional must be boolean');
    }
  }
  const checkEntries = (entries, key, label) => {
    const seen = new Set(), names = new Set();
    for (const entry of array(entries, label)) {
      const value = integer(entry[key], `${label}.${key}`, 0, 65535);
      text(entry.name, `${label}.name`);
      if (seen.has(value) || names.has(pascal(entry.name))) fail(label, 'duplicate value/name');
      seen.add(value); names.add(pascal(entry.name));
    }
  };
  checkEntries(worker.functions, 'wasmIndex', 'worker.functions');
  checkEntries(input.commands, 'opcode', 'input.commands');
  checkEntries(snapshot.events, 'opcode', 'snapshot.events');
  checkEntries(output.payload?.types, 'type', 'output.payload.types');
  const payloadType = name => {
    const entry = output.payload.types.find(value => value.name === name);
    if (!entry) fail('output.payload.types', `missing ${name}`);
    return entry.type;
  };
  const constants = {
    maxInputPacketBytes: integer(input.maxPacketBytes, 'input.maxPacketBytes', 1),
    outputQueueCapacity: integer(output.queue?.capacity, 'output.queue.capacity', 1),
    packetHeaderBytes: integer(output.packet?.headerBytes, 'output.packet.headerBytes', 1),
    inlinePayloadBytes: integer(output.packet?.inlinePayloadBytes, 'output.packet.inlinePayloadBytes', 1),
    packetLengthOffset: integer(output.packet?.lengthOffset, 'output.packet.lengthOffset'),
    heapPayloadOffset: integer(output.packet?.heapPayloadOffset, 'output.packet.heapPayloadOffset'),
    inlinePayloadOffset: integer(output.packet?.inlinePayloadOffset, 'output.packet.inlinePayloadOffset'),
    inputXorKeyBytes: integer(input.xor?.keyLength, 'input.xor.keyLength', 1),
    snapshotXorKeyBytes: integer(snapshot.xorKeyLength, 'snapshot.xorKeyLength', 1),
    maxVarintBytes: integer(input.reader?.maxVarintBytes, 'input.reader.maxVarintBytes', 1),
    snapshotType: payloadType('entity-snapshot'), eventType: payloadType('events'),
    componentCount, sparseFieldCount: count, denseGroupCount: groups.length,
    denseComponent30ExtraFields: extendedCount,
    entityFlagsXor: integer(snapshot.framing?.entityFlagsXor, 'framing.entityFlagsXor', 0, 255),
    componentDeltaXor: integer(snapshot.framing?.componentDeltaXor, 'framing.componentDeltaXor'),
    entityIndexMask: integer(snapshot.entityHandle?.indexMask, 'entityHandle.indexMask', 1),
    entityGenerationShift: integer(snapshot.entityHandle?.generationShift, 'entityHandle.generationShift', 1, 31),
    domainKindField: kind.field,
  };
  return { ...structuredClone(document), constants, fields: [...fields.values()].sort((a, b) => a.id - b.id), denseGroups: groups, sparseModes: modes };
}

export function generateProtocolTs(contract) {
  const { constants, fields, denseGroups: groups } = contract;
  const lines = ['// Generated by tools/gen-contracts.mjs from schema/protocol.yaml. Do not edit.',
    '// Shared widths/component mappings do not imply sparse wire or domain semantic equivalence; see SPARSE_MODES.',
    '// Field26 remains the permanent domain-kind extension; archived-client model semantics are separate.'];
  for (const [name, value] of Object.entries(constants)) lines.push(`export const ${upper(name)} = ${value};`);
  lines.push(`export const WORKER_FUNCTIONS = ${JSON.stringify(contract.worker.functions)} as const;`);
  lines.push(`export const INPUT_COMMANDS = ${JSON.stringify(contract.input.commands)} as const;`);
  lines.push(`export const SNAPSHOT_EVENTS = ${JSON.stringify(contract.output.snapshot.events)} as const;`);
  lines.push(`export const OUTPUT_PAYLOAD_TYPES = ${JSON.stringify(contract.output.payload.types)} as const;`);
  lines.push(`export const FIELD_TYPES = ${JSON.stringify(contract.output.snapshot.fieldTypes)} as const;`);
  lines.push(`export const SPARSE_MODES = ${JSON.stringify(contract.sparseModes)} as const;`);
  const sets = { BYTE_FIELDS: ['byte'], FLOAT_FIELDS: ['float', 'interpolatedFloat'], VARINT_FIELDS: ['varint'],
    BIT_FIELDS: ['bit'], STRING_FIELDS: ['string'], STRING_ARRAY_FIELDS: ['stringArray'], BYTE_ARRAY_FIELDS: ['byteArray'], REFERENCE_FIELDS: ['reference'] };
  for (const [name, types] of Object.entries(sets)) lines.push(`export const ${name}: ReadonlySet<number> = new Set(${JSON.stringify(fields.filter(field => types.includes(field.type)).map(field => field.id))});`);
  lines.push('export interface DenseFieldGroup { readonly offset: number; readonly fields: readonly number[]; readonly extendedFields?: readonly number[] }');
  lines.push(`export type DenseFieldType = ${denseTypes.map(type => JSON.stringify(type)).join(' | ')};`);
  lines.push('export interface DenseFieldSpec { readonly field: number; readonly type: DenseFieldType }');
  lines.push('export interface FieldComponent { readonly constructor: number; readonly offset: number }');
  lines.push('export const DENSE_GROUPS: readonly DenseFieldGroup[] = [');
  for (const group of groups) lines.push(`  ${JSON.stringify({ offset: group.offset, fields: group.fields, ...(group.extendedFields.length ? { extendedFields: group.extendedFields } : {}) })},`);
  lines.push('];', 'export const DENSE_GROUP_COMPONENTS: Readonly<Record<number, number>> = {');
  for (const group of groups) lines.push(`  [${group.offset}]: ${group.component},`);
  lines.push('};', 'export const DENSE_GROUP_SPECS: Readonly<Record<number, readonly DenseFieldSpec[]>> = {');
  for (const group of groups) lines.push(`  [${group.offset}]: ${JSON.stringify(group.specs)},`);
  lines.push('};', 'export const FIELD_COMPONENTS: Readonly<Record<number, FieldComponent>> = {');
  for (const field of fields) lines.push(`  ${field.id}: ${JSON.stringify(field.component)},`);
  lines.push('};', `export const INDEXED_FIELDS = ${JSON.stringify(contract.output.snapshot.indexedFields)} as const;`);
  return lines.join('\n') + '\n';
}

export function generateProtocolCpp(contract) {
  const { fields, denseGroups: groups } = contract;
  const lines = ['// Generated by tools/gen-contracts.mjs from schema/protocol.yaml. Do not edit.',
    '// Shared widths/component mappings do not imply sparse wire or domain semantic equivalence; see kNativeSparse/kDomainSparse.',
    '#pragma once', '#include <array>', '#include <cstdint>', '#include <span>', '', 'namespace engine::protocol {'];
  for (const [name, value] of Object.entries(contract.constants)) lines.push(`inline constexpr std::uint32_t k${pascal(name)} = ${value}U;`);
  const entries = (type, values, key) => {
    lines.push(`enum class ${type} : std::uint16_t {`);
    for (const value of values) lines.push(`  ${cppEnum(value.name)} = ${value[key]},`);
    lines.push('};');
  };
  entries('InputOpcode', contract.input.commands, 'opcode');
  entries('SnapshotEventOpcode', contract.output.snapshot.events, 'opcode');
  entries('OutputPayloadType', contract.output.payload.types, 'type');
  lines.push('struct WorkerFunction { const char* name; std::uint16_t original_index; };');
  lines.push(`inline constexpr std::array<WorkerFunction, ${contract.worker.functions.length}> kWorkerFunctions{{`);
  for (const entry of contract.worker.functions) lines.push(`  {${JSON.stringify(entry.name)}, ${entry.wasmIndex}},`);
  lines.push('}};');
  const typeNames = Object.keys(contract.output.snapshot.fieldTypes).filter(name => name !== 'confidence' && name !== 'note');
  lines.push(`enum class FieldType : std::uint8_t { ${typeNames.map(cppEnum).join(', ')} };`);
  lines.push(`enum class DenseFieldType : std::uint8_t { ${denseTypes.map(cppEnum).join(', ')} };`);
  lines.push('enum class SparseEncoding : std::uint8_t { kScalar, kIndexedUpdate };');
  lines.push('enum class SparseValueType : std::uint8_t { kByte, kF32, kF64, kString, kVarint, kReference, kBit, kAngle, kShort };');
  lines.push('struct SparseFieldSpec { std::uint32_t field; SparseEncoding encoding; SparseValueType value_type; };');
  lines.push('struct SparseMode { const char* packet_format; std::uint8_t field_delta_xor; std::uint8_t index_delta_xor; const char* field26_role; std::span<const SparseFieldSpec> fields; };');
  for (const [name, mode] of Object.entries(contract.sparseModes)) {
    const label = pascal(name);
    lines.push(`inline constexpr std::array<SparseFieldSpec, ${mode.fields.length}> k${label}Fields{{`);
    for (const field of mode.fields) lines.push(`  {${field.field}, SparseEncoding::${cppEnum(field.encoding)}, SparseValueType::${cppEnum(field.valueType)}},`);
    lines.push('}};');
    lines.push(`inline constexpr SparseMode k${label}{${JSON.stringify(mode.packetFormat)}, ${mode.fieldDeltaXor}, ${mode.indexDeltaXor}, ${JSON.stringify(mode.field26Role)}, k${label}Fields};`);
  }
  lines.push('struct FieldComponent { std::uint32_t field; std::uint16_t constructor; std::uint16_t offset; };',
    'struct FieldDefinition { std::uint32_t field; FieldType type; DenseFieldType dense_type; };',
    'struct DenseFieldSpec { std::uint32_t field; DenseFieldType type; };',
    'struct DenseFieldGroup { int offset; std::span<const std::uint32_t> fields; std::span<const std::uint32_t> extended_fields{}; };',
    'struct DenseGroupSpec { int offset; std::uint8_t component; std::span<const DenseFieldSpec> specs; };');
  lines.push(`inline constexpr std::array<FieldComponent, ${fields.length}> kFieldComponents{{`);
  for (const field of fields) lines.push(`  {${field.id}, ${field.component.constructor}, ${field.component.offset}},`);
  lines.push('}};', `inline constexpr std::array<FieldDefinition, ${fields.length}> kFieldDefinitions{{`);
  for (const field of fields) lines.push(`  {${field.id}, FieldType::${cppEnum(field.type)}, DenseFieldType::${cppEnum(field.denseType)}},`);
  lines.push('}};');
  for (const group of groups) {
    const name = groupName(group.offset);
    lines.push(`inline constexpr std::array<std::uint32_t, ${group.fields.length}> kDenseFields${name}{${group.fields.join(', ')}};`);
    if (group.extendedFields.length) lines.push(`inline constexpr std::array<std::uint32_t, ${group.extendedFields.length}> kDenseFields${name}Extended{${group.extendedFields.join(', ')}};`);
    lines.push(`inline constexpr std::array<DenseFieldSpec, ${group.specs.length}> kDenseSpecs${name}{{`);
    for (const spec of group.specs) lines.push(`  {${spec.field}, DenseFieldType::${cppEnum(spec.type)}},`);
    lines.push('}};');
  }
  lines.push(`inline constexpr std::array<DenseFieldGroup, ${groups.length}> kDenseGroups{{`);
  for (const group of groups) {
    const name = groupName(group.offset);
    lines.push(`  {${group.offset}, kDenseFields${name}${group.extendedFields.length ? `, kDenseFields${name}Extended` : ''}},`);
  }
  lines.push('}};', `inline constexpr std::array<DenseGroupSpec, ${groups.length}> kDenseGroupSpecs{{`);
  for (const group of groups) lines.push(`  {${group.offset}, ${group.component}, kDenseSpecs${groupName(group.offset)}},`);
  lines.push('}};', 'consteval bool validate_tables() {', '  std::array<unsigned, kSparseFieldCount> seen{};',
    '  for (const auto& group : kDenseGroupSpecs) for (const auto& spec : group.specs) {',
    '    if (spec.field == 0 || spec.field > kSparseFieldCount || ++seen[spec.field - 1] != 1) return false;',
    '    if (kFieldDefinitions[spec.field - 1].dense_type != spec.type) return false;', '  }',
    '  for (std::size_t index = 0; index < seen.size(); ++index)',
    '    if (seen[index] != 1 || kFieldComponents[index].field != index + 1) return false;',
    '  return kDenseGroups.size() == kDenseGroupCount && kFieldDefinitions.size() == kSparseFieldCount;', '}',
    'static_assert(validate_tables(), "protocol tables must cover each field exactly once with the declared type");',
    '} // namespace engine::protocol');
  return lines.join('\n') + '\n';
}
