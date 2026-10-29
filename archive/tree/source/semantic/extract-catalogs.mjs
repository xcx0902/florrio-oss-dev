/** Recover initialized server registries from the supplied executable, without starting its game loop.
 * Probe-only export of internal function 103 lets us run the lazy entity-registry initializer.
 * This changes no instructions, imports, data, globals, or existing exports.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bytes = new Uint8Array(await readFile(path.join(root, 'web/sp_server.wasm')));
const sha256 = createHash('sha256').update(bytes).digest('hex');
function readUleb(bytes, cursor) {
  let value = 0, shift = 0, byte;
  do { byte = bytes[cursor.offset++]; value |= (byte & 127) << shift; shift += 7; } while (byte & 128);
  return value >>> 0;
}
function uleb(value) {
  const out = [];
  do { const byte = value & 127; value >>>= 7; out.push(byte | (value ? 128 : 0)); } while (value);
  return out;
}
function addProbeExport(input, name, functionIndex) {
  const output = [...input.subarray(0, 8)];
  const cursor = { offset: 8 };
  while (cursor.offset < input.length) {
    const sectionId = input[cursor.offset++];
    const length = readUleb(input, cursor);
    const end = cursor.offset + length;
    if (sectionId === 7) {
      const count = readUleb(input, cursor);
      const encodedName = new TextEncoder().encode(name);
      const payload = [...uleb(count + 1), ...input.subarray(cursor.offset, end), ...uleb(encodedName.length), ...encodedName, 0, ...uleb(functionIndex)];
      output.push(sectionId, ...uleb(payload.length), ...payload);
    } else {
      output.push(sectionId, ...uleb(length));
      for (let i = cursor.offset; i < end; i++) output.push(input[i]);
    }
    cursor.offset = end;
  }
  return new Uint8Array(output);
}
let instance;
const imports = Object.fromEntries([...'abcdefghijklmn'].map(name => [name, () => 0]));
imports.i = (countPointer, sizePointer) => {
  const view = new DataView(instance.exports.o.buffer);
  view.setUint32(countPointer, 0, true);
  view.setUint32(sizePointer, 0, true);
  return 0;
};
instance = (await WebAssembly.instantiate(addProbeExport(bytes, 'probe_entity_definition', 103), { a: imports })).instance;
instance.exports.p();
instance.exports.probe_entity_definition(1);
const memory = new Uint8Array(instance.exports.o.buffer);
const view = new DataView(memory.buffer);
const uint = address => view.getUint32(address, true);
const float = address => view.getFloat32(address, true);
const string = address => new TextDecoder().decode(memory.subarray(address, memory.indexOf(0, address)));
const functionIndex = tableIndex => Number(instance.exports.z.get(tableIndex).name);
const petalDefinitions = Array.from({ length: 39 }, (_, typeId) => {
  const address = 8545792 + typeId * 52;
  const factoryTableIndex = uint(address + 48);
  const factory = instance.exports.z.get(factoryTableIndex);
  const behavior = factory();
  const virtualTableAddress = behavior ? uint(behavior) : null;
  return {
    typeId, address, name: string(uint(address)),
    descriptions: Array.from({ length: memory[address + 4] }, (_, i) => string(uint(address + 8 + i * 4))),
    rarityIndex: uint(address + 24), rechargeMilliseconds: float(address + 28),
    instancesPerSlot: uint(address + 32), radius: float(address + 36),
    flag40: memory[address + 40], flag41: memory[address + 41], field44: float(address + 44),
    factoryTableIndex, factoryFunctionIndex: functionIndex(factoryTableIndex),
    virtualTableAddress,
    virtualMethods: virtualTableAddress === null ? [] : Array.from({ length: 9 }, (_, slot) => {
      const tableIndex = uint(virtualTableAddress + slot * 4);
      return { slot, tableIndex, functionIndex: functionIndex(tableIndex) };
    }),
    bytesHex: Buffer.from(memory.subarray(address, address + 52)).toString('hex'),
  };
});
const entityDefinitions = Array.from({ length: 23 }, (_, typeId) => {
  const address = 8548368 + typeId * 116;
  return {
    typeId, address, name: string(uint(address)),
    descriptions: Array.from({ length: memory[address + 4] }, (_, i) => string(uint(address + 8 + i * 4))),
    field24: uint(address + 24), field28: float(address + 28),
    petalTypeIds: Array.from({ length: memory[address + 32] }, (_, i) => uint(address + 36 + i * 8)),
    field100: uint(address + 100), field104: uint(address + 104),
    field108: memory[address + 108], field109: memory[address + 109], field110: memory[address + 110], field112: float(address + 112),
    bytesHex: Buffer.from(memory.subarray(address, address + 116)).toString('hex'),
  };
});
const spawnRules = Array.from({ length: 20 }, (_, index) => {
  const address = 8547824 + index * 16;
  return { address, weight: float(address), regionIds: Array.from(memory.subarray(address + 5, address + 5 + memory[address + 4])), entityTypeId: memory[address + 13], bytesHex: Buffer.from(memory.subarray(address, address + 16)).toString('hex') };
});
const output = { artifact: 'web/sp_server.wasm', sha256, evidence: { constructorFunctionIndex: 279, entityDefinitionFunctionIndex: 103, petalRecordStride: 52, entityRecordStride: 116, unknownFieldNamesAreOffsets: true }, petalDefinitions, entityDefinitions, spawnRules, packetXorKeyHex: Buffer.from(memory.subarray(4576, 4832)).toString('hex') };
await writeFile(path.join(root, 'source/semantic/server-catalogs.json'), JSON.stringify(output, null, 2) + '\n');
console.log(`Recovered ${petalDefinitions.length} petal definitions, ${entityDefinitions.length} entity definitions and ${spawnRules.length} weighted rules from ${sha256}.`);
