/** Recover the client display catalogs without starting main, timers, rendering or network. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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

export async function extractClientCatalogs() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const bytes = new Uint8Array(await readFile(path.join(root, 'web/client.wasm')));
  const module = new WebAssembly.Module(addProbeExport(bytes, 'probeEntityDefinition', 391));
  const imports = {};
  for (const item of WebAssembly.Module.imports(module))
    (imports[item.module] ??= {})[item.name] = () => 0;
  const wasm = new WebAssembly.Instance(module, imports).exports;
  wasm.Nf();
  wasm.probeEntityDefinition(1);
  const memory = new Uint8Array(wasm.Mf.buffer), view = new DataView(memory.buffer);
  const uint = address => view.getUint32(address, true);
  const float = address => view.getFloat32(address, true);
  const string = address => new TextDecoder().decode(memory.subarray(address, memory.indexOf(0, address)));
  const record = (typeId, address, stride) => ({
    typeId, address, name: string(uint(address)),
    descriptions: Array.from({ length: memory[address + 4] }, (_, i) => string(uint(address + 8 + i * 4))),
    bytesHex: Buffer.from(memory.subarray(address, address + stride)).toString('hex'),
  });
  return {
    artifact: 'web/client.wasm', sha256: createHash('sha256').update(bytes).digest('hex'),
    evidence: { constructorFunctionIndex: 824, entityDefinitionFunctionIndex: 391, petalRecordStride: 52, entityRecordStride: 116, unknownFieldNamesAreOffsets: true },
    petalDefinitions: Array.from({ length: 39 }, (_, typeId) => {
      const address = 382064 + typeId * 52;
      return { ...record(typeId, address, 52), rarityIndex: uint(address + 24),
        rechargeMilliseconds: float(address + 28), instancesPerSlot: uint(address + 32),
        radius: float(address + 36), flag40: memory[address + 40], flag41: memory[address + 41],
        field44: float(address + 44), field48: uint(address + 48),
      };
    }),
    entityDefinitions: Array.from({ length: 23 }, (_, typeId) => {
      const address = 384096 + typeId * 116;
      return { ...record(typeId, address, 116), field24: uint(address + 24), field28: float(address + 28),
        petalTypeIds: Array.from({ length: memory[address + 32] }, (_, i) => uint(address + 36 + i * 8)),
        field100: uint(address + 100), field104: uint(address + 104),
        field108: memory[address + 108], field109: memory[address + 109], field110: memory[address + 110], field112: float(address + 112),
      };
    }),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = await extractClientCatalogs();
  await writeFile(new URL('./client-catalogs.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
  console.log(`Recovered ${output.petalDefinitions.length} client petal definitions and ${output.entityDefinitions.length} entity definitions.`);
}
