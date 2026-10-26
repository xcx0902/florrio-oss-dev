import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import wabtFactory from 'wabt';
import { loadOriginal } from './helpers/wasm-probe.mjs';
import { makeReadableWat } from '../tools/lib/readable-wasm.mjs';
import { createSnapshotDecoderHooks, functionIds } from '../source/game/client/snapshot-decoder.mjs';

const originalBytes = await readFile(new URL('../web/client.wasm', import.meta.url));
const originalModule = new WebAssembly.Module(originalBytes);
const dependencies = [362, 363, 368, 369, 370, 371, 372, 382, 398, 409, 416, 426,
  449, 458, 467, 477, 478, 491, 493, 533, 549, 557, 609, 670, 677, 679, 682,
  755, 756, 757, 758, 781, 783, 784, 809, 1006, 1015, 1096];
const packetTrace = JSON.parse(await readFile(new URL('../reports/runtime/client-packet-traces.json', import.meta.url)));
const packets = packetTrace.packets.filter(packet => packet.direction === 'fromWorker' && packet.bytes[0] === 1);
let patchedModule;

async function getPatchedModule() {
  if (patchedModule) return patchedModule;
  const wabt = await wabtFactory();
  const wat = await readFile(new URL('../source/wasm/client.wat', import.meta.url), 'utf8');
  const inventory = JSON.parse(await readFile(new URL('../reports/wasm/client-functions.json', import.meta.url)));
  const result = makeReadableWat(wat, inventory, functionIds.map(id => ({ id, source: 'game/client/snapshot-decoder.mjs' })));
  const parsed = wabt.parseWat('component-decoder.wat', result.text);
  try { patchedModule = new WebAssembly.Module(parsed.toBinary({}).buffer); }
  finally { parsed.destroy(); }
  return patchedModule;
}

async function scenario(recovered, setup, action, patchInternalCalls) {
  const events = [];
  const hookCalls = {};
  let runtime, hooks;
  const imports = {};
  for (const entry of WebAssembly.Module.imports(originalModule)) {
    (imports[entry.module] ??= {})[entry.name] = (...args) => {
      events.push([entry.module, entry.name, ...args]);
      return 0;
    };
  }
  imports.a.La = (count, size) => {
    const view = new DataView(runtime.memory.buffer);
    view.setUint32(count >>> 0, 0, true);
    view.setUint32(size >>> 0, 0, true);
    events.push(['a', 'La', count, size]);
    return 0;
  };
  imports.a.Oa = (fd, vectors, count, written) => {
    const view = new DataView(runtime.memory.buffer);
    let total = 0;
    for (let i = 0; i < count; i++) total += view.getUint32(vectors + i * 8 + 4, true);
    view.setUint32(written >>> 0, total, true);
    events.push(['a', 'Oa', fd, vectors, count, written]);
    return 0;
  };
  if (recovered && patchInternalCalls) {
    imports.readable = Object.fromEntries(functionIds.map(id => [`f${id}`, (...args) => {
      hookCalls[id] = (hookCalls[id] ?? 0) + 1;
      return hooks[id](...args);
    }]));
    const instance = new WebAssembly.Instance(await getPatchedModule(), imports);
    runtime = {
      instance,
      get memory() { return instance.exports.__readable_memory; },
      get table() { return instance.exports.__readable_table; },
      get stackPointer() { return instance.exports.__stack_pointer; },
      call(id, ...args) { return instance.exports[`__fn${id}`](...args); },
      host(module, field, ...args) { return imports[module][field](...args); },
    };
  } else runtime = await loadOriginal('client', { functionIds: [...functionIds, ...dependencies], imports, construct: false });
  const originalCall = runtime.call.bind(runtime);
  const running = {
    get memory() { return runtime.memory; },
    get table() { return runtime.table; },
    get stackPointer() { return runtime.stackPointer; },
    host: runtime.host.bind(runtime),
    call(id, ...args) {
      return recovered && !patchInternalCalls && hooks[id] ? hooks[id](...args) : originalCall(id, ...args);
    },
  };
  hooks = createSnapshotDecoderHooks(running);
  runtime.instance.exports.Nf();
  const data = {
    runtime, running, events, hookCalls, state: 441408,
    get bytes() { return new Uint8Array(runtime.memory.buffer); },
    get view() { return new DataView(runtime.memory.buffer); },
    get(address) { return this.view.getUint32(address, true); },
    put(address, value) { this.view.setUint32(address, value, true); },
    malloc(size) { return originalCall(368, size) >>> 0; },
    entity(index = 0) { return this.state + 2928 + index * 448; },
    reader(bytes, pending = 0, cursor = 0, declaredLength) {
      const pointer = this.malloc(bytes.length + pending + 16), reader = this.malloc(16);
      this.bytes.fill(0xA5, pointer, pointer + bytes.length + pending + 16);
      this.bytes.set(bytes, pointer + pending);
      this.put(reader, pointer);
      this.put(reader + 4, declaredLength ?? bytes.length + pending);
      this.put(reader + 8, cursor);
      this.put(reader + 12, pending);
      return reader;
    },
  };
  data.bytes[441368] = 1;
  originalCall(1096);
  await setup(data);
  const stackBefore = runtime.stackPointer.value;
  let error;
  try { await action(data); }
  catch (caught) { error = { name: caught.constructor.name, message: caught.message }; }
  return {
    data, events, error, stack: runtime.stackPointer.value - stackBefore,
    digest: createHash('sha256').update(data.bytes).digest('hex'),
  };
}

async function compare(setup, action, patchInternalCalls = false) {
  const original = await scenario(false, setup, action, patchInternalCalls);
  const recovered = await scenario(true, setup, action, patchInternalCalls);
  assert.deepEqual(recovered.events, original.events, 'host calls');
  assert.deepEqual(recovered.error, original.error, 'exception');
  assert.equal(recovered.stack, original.stack, 'stack');
  if (recovered.digest !== original.digest) {
    const differing = [];
    for (let i = 0; i < original.data.bytes.length && differing.length < 24; i++)
      if (recovered.data.bytes[i] !== original.data.bytes[i]) differing.push([i, original.data.bytes[i], recovered.data.bytes[i]]);
    assert.equal(recovered.digest, original.digest, `complete memory; first differences ${JSON.stringify(differing)}`);
  }
  return { original, recovered };
}

function maskBytes(mask) {
  return [mask & 255, (mask >>> 8) & 255, (mask >>> 16) & 255, mask >>> 24];
}
function varint(value) {
  const bytes = [];
  do { const group = value & 127; value >>>= 7; bytes.push(group | (value ? 128 : 0)); } while (value);
  return bytes;
}
function deltaBytes(ordinals) {
  let previous = 0;
  return [...ordinals.flatMap(ordinal => {
    const delta = (ordinal - previous) >>> 0;
    previous = ordinal;
    return varint((delta ^ 1) >>> 0);
  }), 1];
}

test('all30 component mask declarations and duplicate declarations match every byte', async () => {
  for (const pending of [0, 1]) {
    const { original } = await compare(
      data => { data.readers = Array.from({ length: 30 }, (_, index) => data.reader(maskBytes(1 << index), pending)); },
      data => {
        for (let ordinal = 1; ordinal <= 30; ordinal++) {
          const entity = data.entity(ordinal - 1), reader = data.readers[ordinal - 1];
          data.running.call(1008, entity, reader, 1);
          data.put(reader + 8, 0);
          data.put(reader + 12, pending);
          data.running.call(1008, entity, reader, 1);
        }
      },
    );
    assert.equal(original.error, undefined);
  }
});

test('combined component mask and delta list preserve allocation order and inline sentinels', async () => {
  for (const pending of [0, 1]) for (const flags of [0, 1, 2, 3]) {
    const ordinals = Array.from({ length: 30 }, (_, index) => index + 1);
    const { original } = await compare(
      data => { data.packetReader = data.reader(flags & 1 ? maskBytes(0xFFFFFFFF) : deltaBytes(ordinals), pending); },
      data => data.running.call(1008, data.entity(), data.packetReader, flags),
    );
    assert.equal(original.error, undefined);
    assert.equal(original.data.get(original.data.entity() + 180), original.data.entity() + 176);
    assert.equal(original.data.get(original.data.entity() + 196), original.data.entity() + 188);
  }
});

test('delta declarations cover gaps, long varints, wrapping ordinals and five-byte limit', async () => {
  for (const wire of [
    deltaBytes([8, 15, 27, 29, 30]),
    deltaBytes([127, 128, 16384, 0xFFFFFFFF, 1, 30]),
    [128, 128, 128, 128, 128, 1],
    [255, 255, 255, 255, 255, 1],
    [1],
  ]) {
    const { original } = await compare(
      data => { data.packetReader = data.reader(wire, 1); },
      data => data.running.call(1008, data.entity(), data.packetReader, 0),
    );
    assert.equal(original.error, undefined);
  }
});

test('mask decoder preserves pending-byte, truncated field and unsigned remaining-length behavior', async () => {
  for (const pending of [0, 1]) for (const length of [0, 1, 3, 4]) {
    const { original } = await compare(
      data => { data.packetReader = data.reader(maskBytes(0), pending, 0, length); },
      data => data.running.call(1008, data.entity(), data.packetReader, 1),
    );
    assert.equal(original.error, undefined);
  }
  await compare(
    data => { data.packetReader = data.reader(new Array(16).fill(0), 0, 8, 4); },
    data => data.running.call(1008, data.entity(), data.packetReader, 1),
  );
});

test('component12 pool reuses max-heap entries and crosses128-object slab boundary', async () => {
  for (const freeCount of [1, 2, 3, 4, 8, 17]) {
    const { original } = await compare(
      data => {
        const components = Array.from({ length: freeCount }, () => data.malloc(20)).sort((a, b) => b - a);
        const entries = data.malloc(freeCount * 4);
        components.forEach((pointer, index) => data.put(entries + index * 4, pointer));
        data.put(data.state + 520, freeCount);
        data.put(data.state + 528, entries);
      },
      data => {
        for (let index = 0; index < freeCount; index++) data.running.call(1007, data.entity(index));
      },
    );
    assert.equal(original.error, undefined);
  }
  const { original } = await compare(
    () => {},
    data => {
      for (let index = 0; index < 130; index++) data.running.call(1007, data.entity(index));
    },
  );
  assert.equal(original.error, undefined);
  assert.equal(original.data.get(original.data.state + 508), 2);
});

test('component active vectors grow from a valid full prefix without changing allocation order', async () => {
  const { original } = await compare(
    data => {
      for (const offset of [360, 404, 492, 536, 580, 636, 1144, 1408, 1656, 1744]) {
        const entries = data.malloc(4);
        data.put(entries, data.entity(1));
        data.put(data.state + offset, 1);
        data.put(data.state + offset + 4, 1);
        data.put(data.state + offset + 8, entries);
      }
      data.packetReader = data.reader(maskBytes(0xFFFFFFFF));
    },
    data => data.running.call(1008, data.entity(), data.packetReader, 1),
  );
  assert.equal(original.error, undefined);
});

test('real startup/spawn/attack/defend/wheel packets execute restored declarations inside native1015', async () => {
  assert.equal(packets.length, 15);
  const { original, recovered } = await compare(
    data => { data.readers = packets.map(packet => data.reader(packet.bytes.slice(1))); },
    data => {
      data.cursors = [];
      for (const reader of data.readers) {
        data.running.call(1015, data.state, reader);
        data.cursors.push([data.get(reader + 8), data.get(reader + 4)]);
      }
    },
    true,
  );
  assert.equal(original.error, undefined);
  assert.equal(recovered.data.get(recovered.data.state + 2276), 89);
  assert.ok(recovered.data.hookCalls[1008] > 0, 'real1015 invoked the restored component parser');
  assert.deepEqual(recovered.data.cursors, original.data.cursors);
  for (const [cursor, length] of recovered.data.cursors) assert.equal(cursor, length);
});

test('component decoder traps with original memory exception and unchanged stack', async () => {
  await compare(() => {}, data => data.running.call(1008, data.entity(), -8, 1));
  await compare(
    data => { data.packetReader = data.reader(maskBytes(0x80)); },
    data => data.running.call(1008, -16, data.packetReader, 1),
  );
});

test('event strings preserve inline and allocated representations, duplicate suppression and terminator cursor', async () => {
  for (const opcode of [0, 1, 9, 15, 128, 0xFFFFFFFF])
    for (const size of [0, 1, 10, 11, 16, 127]) {
      const { original } = await compare(
        data => {
          data.readers = [0, 1].flatMap(pending => [0, 1].map(duplicate => ({
            duplicate,
            reader: data.reader([...varint(opcode), ...Array.from({ length: size }, (_, index) => 65 + index % 26), 0], pending),
          })));
        },
        data => {
          for (const { reader, duplicate } of data.readers)
            data.running.call(1009, data.state, reader, duplicate);
        },
      );
      assert.equal(original.error, undefined);
    }
});

test('event decoder traps reserved opcodes and preserves partial or unbounded first-varint read', async () => {
  for (const opcode of [2, 3, 4, 5, 6, 7, 8, 10, 12, 13]) {
    const { original } = await compare(
      data => { data.packetReader = data.reader([opcode], 1); },
      data => data.running.call(1009, data.state, data.packetReader, 0),
    );
    assert.equal(original.error.name, 'RuntimeError');
    assert.equal(original.stack, -48);
  }
  for (const wire of [[128], [128, 128], [128, 128, 128], [128, 128, 128, 128], [128, 128, 128, 128, 128], [9, 65, 66]]) {
    await compare(
      data => { data.packetReader = data.reader(wire); },
      data => data.running.call(1009, data.state, data.packetReader, 1),
    );
  }
  await compare(
    data => { data.packetReader = data.reader([0, 0], 0, 0, 0); },
    data => data.running.call(1009, data.state, data.packetReader, 1),
  );
  await compare(() => {}, data => data.running.call(1009, data.state, -4, 0));
});

function wireEntity(index, generation = 1) {
  const packed = ((generation << 14) | index) >>> 0;
  return maskBytes(((packed >>> 14) | (packed << 18)) >>> 0);
}

test('event11 entity generation checks and timestamp destinations match for live, stale and duplicate events', async () => {
  for (const duplicate of [0, 1]) for (const valid of [false, true]) {
    const { original } = await compare(
      data => {
        const index = 7, handle = data.malloc(148), entries = data.malloc(4), component = data.malloc(80);
        data.bytes.fill(0xA5, component, component + 80);
        data.put(entries, handle);
        data.put(handle + 144, data.entity(index));
        data.put(data.state + 256, 1);
        data.put(data.state + 264, entries);
        data.put(data.entity(index) + 16, (valid ? 1 : 2) << 14 | index);
        data.put(data.entity(index) + 136, component);
        data.packetReader = data.reader([11, ...wireEntity(index)], 1);
      },
      data => data.running.call(1009, data.state, data.packetReader, duplicate),
    );
    assert.equal(original.error, undefined);
  }
  for (const bytes of [[11], [11, 1], [11, 1, 2], [11, 1, 2, 3]]) {
    await compare(
      data => { data.packetReader = data.reader(bytes); },
      data => data.running.call(1009, data.state, data.packetReader, 0),
    );
  }
});

function event14Fixture(data, { eventIndex = 0, tier = 0, alternate = 0, valid = 1 } = {}) {
  const handle = data.malloc(148), entries = data.malloc(4), marked = data.malloc(80), transform = data.malloc(176), reference = data.malloc(172);
  for (const [pointer, size] of [[handle, 148], [marked, 80], [transform, 176], [reference, 172]]) data.bytes.fill(0, pointer, pointer + size);
  const targetEntity = data.entity(7);
  data.bytes[7931360] = 1;
  data.bytes[7931352] = alternate;
  data.put(alternate ? 7931292 : 4420, data.state);
  data.put(data.state + 256, 1);
  data.put(data.state + 264, entries);
  data.put(entries, handle);
  data.put(handle + 144, data.entity());
  data.put(data.entity() + 152, reference);
  data.put(targetEntity + 16, (1 << 14) | 7);
  data.put(targetEntity + 52, marked);
  data.put(targetEntity + 120, transform);
  data.put(transform, targetEntity);
  data.bytes[transform + 144] = valid;
  data.view.setFloat64(transform + 152, 100.25, true);
  data.view.setFloat64(transform + 160, -500.75, true);
  data.view.setFloat32(transform + 64, 100.25, true);
  data.view.setFloat32(transform + 40, -500.75, true);
  data.bytes[marked + 8] = 127;
  data.bytes[reference + 168] = tier;
  data.view.setUint16(reference + 120 + (eventIndex % 8) * 2, 32767, true);
  data.put(data.state + 2160, 1920);
  data.put(data.state + 2164, 1080);
  data.view.setFloat32(data.state + 2148, 123.5, true);
  data.view.setFloat32(data.state + 2152, -4, true);
  data.view.setFloat32(data.state + 2156, 0.75, true);
  data.view.setFloat32(alternate ? 7931304 : 4432, 2, true);
  data.view.setFloat32(alternate ? 7931308 : 4436, 0.5, true);
  data.put(395184 + eventIndex * 4, 0);
  data.packetReader = data.reader([14, ...wireEntity(7), eventIndex]);
  data.eventIndex = eventIndex;
  data.marked = marked;
}

test('event14 creates the complete original496-byte visual and preserves exact projected float bits', async () => {
  for (const options of [
    {}, { alternate: 1 }, { valid: 0 }, { tier: 14, eventIndex: 4 },
    { tier: 15, eventIndex: 5 }, { tier: 30, eventIndex: 6 },
    { tier: 45, eventIndex: 7 }, { tier: 45, eventIndex: 8 }, { eventIndex: 255 },
  ]) {
    const { original } = await compare(
      data => event14Fixture(data, options),
      data => data.running.call(1009, data.state, data.packetReader, 0),
    );
    assert.equal(original.error, undefined);
    assert.ok(original.data.get(395184 + original.data.eventIndex * 4));
    assert.equal(original.data.bytes[original.data.marked + 72], 1);
  }
});

test('event14 duplicate, occupied slot, absent handle, stale generation and singleton initialization paths match', async () => {
  for (const branch of ['duplicate', 'occupied', 'noHandle', 'stale', 'uninitialized']) {
    const { original } = await compare(
      data => {
        event14Fixture(data);
        if (branch === 'occupied') data.put(395184, 1234);
        if (branch === 'noHandle') data.put(data.state + 256, 0);
        if (branch === 'stale') data.put(data.entity(7) + 16, 2 << 14 | 7);
        if (branch === 'uninitialized') data.bytes[7931360] = 0;
      },
      data => data.running.call(1009, data.state, data.packetReader, branch === 'duplicate' ? 1 : 0),
    );
    assert.equal(original.error, undefined);
  }
});

test('native1006 invokes the restored1009 body for XOR-framed events and duplicate sequences', async () => {
  const { original, recovered } = await compare(
    data => {
      const wire = [1, 9, 65, 66, 0, 1, 9, 67, 68, 0, 2, 0, 0];
      data.packetReader = data.reader(wire.map((value, index) => value ^ data.bytes[32272 + (index & 255)]));
    },
    data => data.running.call(1006, data.state, data.packetReader),
    true,
  );
  assert.equal(original.error, undefined);
  assert.equal(recovered.data.hookCalls[1009], 3);
});
