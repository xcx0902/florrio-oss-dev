#!/usr/bin/env node
/** Read-only original-WASM visibility oracle. No original packet decoding:
 * func192 runs the actual beginSnapshot quadtree query; 418888/418896 expose
 * the actual local peer's retained handle/revision records after publication.
 * Native membership is decoded from real WorkerApi publisher packets by the
 * standalone CTest executable's --replay mode. Inputs are untouched goldens.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadOriginal } from '../../../test/helpers/wasm-probe.mjs';
import { originalEntityIdentity } from '../../../tools/parity/original-entity-identity.mjs';

const option = (name, fallback) => {
  const index = process.argv.lastIndexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const nativePath = path.resolve(option('--native', 'engine/build-native/engine_peer_visibility_tests'));
const output = path.resolve(option('--out', '/tmp/florr-peer-visibility-evidence'));
const names = option('--scenarios', 'garden-idle,move,attack').split(',');
const ticks = Number(option('--ticks', '70'));
assert.ok(Number.isInteger(ticks) && ticks > 0 && ticks <= 100000);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = values => [...new Set(values)].sort((a, b) => a - b);
const difference = (expected, actual) => {
  const wanted = new Set(expected), got = new Set(actual);
  return { missing: expected.filter(handle => !got.has(handle)), extra: actual.filter(handle => !wanted.has(handle)) };
};

async function originalServer() {
  let runtime, clock = 0, seed = 0x6f6c6446;
  const view = () => new DataView(runtime.memory.buffer);
  function bridge(address, signature, pointer) {
    if (address === 22600 || address === 22639) return 0;
    if (address === 22791) return 1;
    if (address === 22855) return clock;
    if (address === 22903) return view().getFloat64(pointer, true) % view().getFloat64(pointer + 8, true);
    throw new Error(`unhandled original host bridge ${address}`);
  }
  runtime = await loadOriginal('sp_server', { construct: false,
    functionIds: [14, 16, 192, 654, 655, 656, 657],
    imports: { a: { a: bridge, b: bridge, c() {}, d() {},
      e() { throw new Error('original OOM'); }, f() { throw new Error('original abort'); },
      n(pointer, length) {
        const bytes = new Uint8Array(runtime.memory.buffer);
        for (let index = 0; index < length; ++index) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          bytes[pointer + index] = seed & 255;
        }
        return 0;
      },
    } },
  });
  runtime.exports.p(); runtime.call(656, 0, 0);
  // Original192's closure is {queryRect, {world, vector, visitedBitset}}.
  // The inline vector has the original initial capacity 256. Extra exports
  // and this private scratch allocation change no original instructions.
  const scratch = runtime.call(16, 3136), vector = scratch + 16;
  const bits = vector + 12 + 256 * 4, context = bits + 2048, closure = context + 12;
  const identities = new Map();
  function state() {
    let v = view();
    const u32 = pointer => v.getUint32(pointer, true), f32 = pointer => v.getFloat32(pointer, true);
    const connection = u32(24936), viewer = connection ? u32(connection + 120) : 0;
    const body = viewer ? u32(viewer + 100) : 0, player = body ? u32(body + 16) : 0;
    const query = viewer ? { x: f32(viewer + 12), y: f32(viewer + 88), scale: f32(viewer + 92) } : null;
    const known = [];
    for (let index = 0, count = u32(418888), records = u32(418896); index < count; ++index)
      known.push({ handle: u32(records + index * 8), revision: u32(records + index * 8 + 4) });
    let visible = [];
    if (v.getUint8(25066) && query) {
      new Uint8Array(runtime.memory.buffer, scratch, 3136).fill(0);
      const width = Math.fround(Math.fround(1920 / query.scale) + 200);
      const height = Math.fround(Math.fround(1080 / query.scale) + 200);
      const rect = [Math.fround(Math.fround(width * -0.5) + query.x),
        Math.fround(Math.fround(height * -0.5) + query.y), width, height];
      rect.forEach((value, index) => v.setFloat32(scratch + index * 4, value, true));
      v.setUint32(vector + 4, 256, true);
      v.setUint32(context + 4, vector, true); v.setUint32(context + 8, bits, true);
      v.setUint32(closure, scratch, true); v.setUint32(closure + 4, context, true);
      runtime.call(192, 24984, scratch, closure);
      v = view();
      const storage = u32(vector + 8) || vector + 12;
      visible = Array.from({ length: u32(vector) }, (_, index) => u32(storage + index * 4));
      if (u32(vector + 8)) runtime.call(14, u32(vector + 8));
    }
    if (player) visible.push(player);
    // Metadata entities (world/connection) have no domain spatial body.
    const isBody = handle => {
      const entity = 419020 + (handle & 16383) * 496;
      return u32(entity + 16) === handle && !!u32(entity + 168);
    };
    visible = sorted(visible.filter(isBody));
    for (const handle of visible) identities.set(handle,
      originalEntityIdentity(v, 419020 + (handle & 16383) * 496));
    return { rng: u32(8573024), player, query, visible,
      known: known.filter(row => isBody(row.handle)), identities };
  }
  return { state,
    send(bytes) {
      const pointer = runtime.call(16, bytes.length);
      new Uint8Array(runtime.memory.buffer).set(bytes, pointer);
      runtime.call(655, pointer, bytes.length); runtime.call(14, pointer);
    },
    advance(at) { clock = at; runtime.call(654); runtime.call(657, 0, 0); },
  };
}

await mkdir(output, { recursive: true });
const report = { passed: true, ticks, originalWasm: hash(await readFile('web/sp_server.wasm')),
  nativeExecutable: nativePath, nativeSha256: hash(await readFile(nativePath)),
  source: 'simulation-tick.mjs:5897-5958; original func192; local known records 418888/418896', scenarios: [] };
for (const name of names) {
  assert.match(name, /^[a-z-]+$/);
  const golden = await readFile(`tests/parity/golden/${name}/server.json`);
  const inputs = JSON.parse(golden).messages.filter(row => row.funcName === 'sp_server_send' && row.dataHex);
  const header = Buffer.alloc(4); header.writeUInt32LE(inputs.length);
  const chunks = [header];
  for (const row of inputs) {
    const bytes = Buffer.from(row.dataHex, 'hex'), entry = Buffer.alloc(8);
    entry.writeUInt32LE(row.at); entry.writeUInt32LE(bytes.length, 4); chunks.push(entry, bytes);
  }
  const fixture = path.join(output, `${name}.inputs.bin`);
  await writeFile(fixture, Buffer.concat(chunks));
  const native = execFileSync(nativePath, ['--replay', fixture, String(ticks)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .trim().split('\n').map(line => JSON.parse(line));
  assert.equal(native.length, ticks);
  const original = await originalServer(), firstOriginal = new Map(), firstNative = new Map();
  let next = 0, firstDifference = null, mismatchedTicks = 0, firstJoined = null;
  const trace = [];
  for (let tick = 1; tick <= ticks; ++tick) {
    const at = tick * 50;
    while (next < inputs.length && inputs[next].at <= at) original.send(Buffer.from(inputs[next++].dataHex, 'hex'));
    original.advance(at);
    const expected = original.state(), actual = native[tick - 1];
    assert.equal(actual.tick, tick);
    const diff = difference(expected.visible, sorted(actual.visible));
    const matched = diff.missing.length === 0 && diff.extra.length === 0;
    for (const handle of expected.visible) if (!firstOriginal.has(handle)) firstOriginal.set(handle, tick);
    for (const handle of actual.visible) if (!firstNative.has(handle)) firstNative.set(handle, tick);
    if (!matched) {
      ++mismatchedTicks;
      firstDifference ??= { tick, at, ...diff, query: expected.query,
        originalRng: expected.rng, nativeRng: actual.rng, originalPlayer: expected.player, nativePlayer: actual.player };
    }
    if (expected.player && !firstJoined) firstJoined = { tick, at, handles: expected.visible, nativeHandles: sorted(actual.visible) };
    trace.push({ tick, at, matched, rngMatch: expected.rng === actual.rng, playerMatch: expected.player === actual.player,
      query: expected.query, originalVisible: expected.visible, nativeVisible: sorted(actual.visible), known: expected.known,
      nativeDeleted: actual.deleted, ...diff });
  }
  const entries = sorted([...firstOriginal.keys(), ...firstNative.keys()]).map(handle => ({ handle,
    ...original.state().identities.get(handle), originalTick: firstOriginal.get(handle) ?? null,
    nativeTick: firstNative.get(handle) ?? null }));
  const firstEntryDifferences = entries.filter(row => row.originalTick !== row.nativeTick);
  const result = { scenario: name, passed: mismatchedTicks === 0 && firstEntryDifferences.length === 0,
    goldenSha256: hash(golden), ticks, mismatchedTicks, firstDifference, firstJoined, firstEntryDifferences, entries, trace };
  await writeFile(path.join(output, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  report.passed &&= result.passed;
  const summary = { ...result }; delete summary.entries; delete summary.trace;
  report.scenarios.push(summary);
  console.log(JSON.stringify(summary));
}
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (!report.passed) process.exitCode = 1;
