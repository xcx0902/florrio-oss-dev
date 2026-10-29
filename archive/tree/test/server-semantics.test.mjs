import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  main, xorServerPacketInPlace, flushServerOutput, SERVER_MEMORY,
  basicPetalOrbit, fastPetalOrbit, heavyPetalOrbit, rockPetalOrbit,
} from '../source/semantic/server-behavior.mjs';

const artifact = new Uint8Array(await readFile(new URL('../web/sp_server.wasm', import.meta.url)));
function uleb(value) {
  const bytes = [];
  do { const byte = value & 127; value >>>= 7; bytes.push(byte | (value ? 128 : 0)); } while (value);
  return bytes;
}
function readUleb(bytes, cursor) {
  let result = 0, shift = 0, byte;
  do { byte = bytes[cursor.offset++]; result |= (byte & 127) << shift; shift += 7; } while (byte & 128);
  return result >>> 0;
}
function withFunctionExports(input, indexes) {
  const out = [...input.subarray(0, 8)], cursor = { offset: 8 };
  while (cursor.offset < input.length) {
    const id = input[cursor.offset++], size = readUleb(input, cursor), end = cursor.offset + size;
    if (id === 7) {
      const count = readUleb(input, cursor), payload = [...uleb(count + indexes.length), ...input.subarray(cursor.offset, end)];
      for (const index of indexes) {
        const name = new TextEncoder().encode(`probe${index}`);
        payload.push(...uleb(name.length), ...name, 0, ...uleb(index));
      }
      out.push(id, ...uleb(payload.length), ...payload);
    } else {
      out.push(id, ...uleb(size));
      for (let i = cursor.offset; i < end; i++) out.push(input[i]);
    }
    cursor.offset = end;
  }
  return new Uint8Array(out);
}
const probedArtifact = withFunctionExports(artifact, [103, 119, 413, 661, 663]);
async function loadServer(onIntermediate = () => {}, onFinal = () => {}) {
  let instance;
  const imports = Object.fromEntries([...'abcdefghijklmn'].map(name => [name, () => 0]));
  imports.c = onFinal;
  imports.d = (pointer, length) => onIntermediate(pointer, length, instance.exports.o);
  imports.i = (countPointer, sizePointer) => {
    const view = new DataView(instance.exports.o.buffer);
    view.setUint32(countPointer, 0, true); view.setUint32(sizePointer, 0, true); return 0;
  };
  instance = (await WebAssembly.instantiate(probedArtifact, { a: imports })).instance;
  instance.exports.p();
  return instance.exports;
}

test('human main equals original export s', async () => {
  const wasm = await loadServer();
  for (const value of [0, 1, -1, 2147483647]) assert.equal(main(value, value), wasm.s(value, value));
});

test('four recovered orbit functions match original instructions for every input byte and absent owner', async () => {
  const wasm = await loadServer(), view = new DataView(wasm.o.buffer), bytes = new Uint8Array(wasm.o.buffer);
  const output = wasm.q(8), context = wasm.q(16), owner = wasm.q(64);
  for (const [original, recovered] of [[119, basicPetalOrbit], [413, fastPetalOrbit], [661, heavyPetalOrbit], [663, rockPetalOrbit]]) {
    for (const input of [null, ...Array.from({ length: 256 }, (_, i) => i), 0xffffffff, 0x80000000]) {
      view.setUint32(context + 4, input === null ? 0 : owner, true);
      view.setUint8(owner + 10, input ?? 0);
      bytes.fill(0xa5, output, output + 8);
      wasm[`probe${original}`](output, 0, context);
      const expected = bytes.slice(output, output + 8);
      bytes.fill(0xa5, output, output + 8);
      recovered(wasm.o, output, 0, context);
      assert.deepEqual(bytes.slice(output, output + 8), expected, `func${original}, input ${input}`);
    }
  }
});

test('packet XOR stage matches original send for safe no-op packets across key boundaries', async () => {
  const wasm = await loadServer(), bytes = new Uint8Array(wasm.o.buffer);
  bytes[SERVER_MEMORY.initialized] = 1;
  for (const length of [0, 1, 2, 255, 256, 257, 4096, 65536]) {
    const pointer = wasm.q(Math.max(length, 1));
    for (let i = 0; i < length; i++) bytes[pointer + i] = bytes[SERVER_MEMORY.xorKey + (i & 255)];
    const encrypted = bytes.slice(pointer, pointer + length);
    wasm.w(pointer, length);
    const expected = bytes.slice(pointer, pointer + length);
    bytes.set(encrypted, pointer);
    xorServerPacketInPlace(wasm.o, pointer, length);
    assert.deepEqual(bytes.slice(pointer, pointer + length), expected);
    assert.ok(expected.every(byte => byte === 0));
    wasm.r(pointer);
  }
});

test('recovered flush matches original callbacks, inline/heap payloads and queue cleanup', async () => {
  for (const initialized of [false, true]) {
    for (const count of [0, 1, 2, 16, 17]) {
      async function scenario(recovered) {
        const events = [];
        const wasm = await loadServer((pointer, length, memory) => {
          events.push(['data', Array.from(new Uint8Array(memory.buffer, pointer, length))]);
        }, (pointer, length) => events.push(['final', pointer, length]));
        const bytes = new Uint8Array(wasm.o.buffer), view = new DataView(wasm.o.buffer);
        bytes[SERVER_MEMORY.initialized] = Number(initialized);
        bytes[SERVER_MEMORY.outputCount] = count;
        for (let index = 0; index < count; index++) {
          const packet = wasm.q(24), payload = index % 2 ? wasm.q(12) : 0;
          view.setUint32(SERVER_MEMORY.outputPointers + index * 4, packet, true);
          view.setUint32(packet + 4, 3, true); view.setUint32(packet + 12, payload, true);
          bytes.set([index, index + 1, index + 2], payload || packet + 16);
        }
        if (recovered) {
          flushServerOutput(wasm.o, {
            free: wasm.r,
            respondIntermediate: (pointer, length) => events.push(['data', Array.from(bytes.slice(pointer, pointer + length))]),
            respondFinal: (pointer, length) => events.push(['final', pointer, length]),
          });
        } else wasm.t(0, 0);
        return { events, count: bytes[SERVER_MEMORY.outputCount], pointers: Array.from(bytes.slice(SERVER_MEMORY.outputPointers, SERVER_MEMORY.outputPointers + count * 4)) };
      }
      assert.deepEqual(await scenario(true), await scenario(false), `initialized=${initialized}, count=${count}`);
    }
  }
});

test('catalog names, descriptions, raw records and all behavior dispatch slots match initialized original WASM', async () => {
  const expected = JSON.parse(await readFile(new URL('../source/semantic/server-catalogs.json', import.meta.url), 'utf8'));
  assert.equal(expected.sha256, createHash('sha256').update(artifact).digest('hex'));
  const wasm = await loadServer(), bytes = new Uint8Array(wasm.o.buffer), view = new DataView(wasm.o.buffer);
  wasm.probe103(1);
  const string = pointer => new TextDecoder().decode(bytes.subarray(pointer, bytes.indexOf(0, pointer)));
  for (const entry of [...expected.petalDefinitions, ...expected.entityDefinitions]) {
    const size = 'factoryTableIndex' in entry ? 52 : 116;
    assert.equal(Buffer.from(bytes.subarray(entry.address, entry.address + size)).toString('hex'), entry.bytesHex);
    assert.equal(string(view.getUint32(entry.address, true)), entry.name);
    assert.deepEqual(Array.from({ length: bytes[entry.address + 4] }, (_, i) => string(view.getUint32(entry.address + 8 + i * 4, true))), entry.descriptions);
    if ('factoryTableIndex' in entry) {
      const factory = wasm.z.get(entry.factoryTableIndex);
      assert.equal(Number(factory.name), entry.factoryFunctionIndex);
      const behavior = factory();
      assert.equal(behavior ? view.getUint32(behavior, true) : null, entry.virtualTableAddress);
      for (const method of entry.virtualMethods) assert.equal(Number(wasm.z.get(method.tableIndex).name), method.functionIndex);
    }
  }
  for (const entry of expected.spawnRules) {
    assert.equal(Buffer.from(bytes.subarray(entry.address, entry.address + 16)).toString('hex'), entry.bytesHex);
  }
});
