#!/usr/bin/env node
/** Strict simulation comparison without rebuilding or publishing wasm.
 * The native executable consumes actual golden input packets and emits state
 * records. The oracle executes the shipped wasm with its original exports. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { compareEntities } from '../../../tools/parity/entity-state-diff.mjs';
import { originalEntityIdentity } from '../../../tools/parity/original-entity-identity.mjs';
const option = (name, fallback) => { const i = process.argv.lastIndexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const ticks = Number(option('--ticks', '1000'));
assert.ok(Number.isInteger(ticks) && ticks > 0 && ticks <= 100000);
const nativePath = path.resolve(option('--native', 'engine/build-native/engine_native_replay'));
const output = option('--out', 'engine/build-native/r04-sim-soak');
const names = option('--scenarios', 'boot-menu,garden-idle,move,attack,damage,death,equip,spawn').split(',');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const originalBytes = await readFile('web/sp_server.wasm');
const originalHash = hash(originalBytes), nativeHash = hash(await readFile(nativePath));
await mkdir(output, { recursive: true });

async function originalServer() {
  let instance, clock = 0, seed = 0x6f6c6446;
  const view = () => new DataView(instance.exports.o.buffer);
  function bridge(address, signature, pointer) {
    if (address === 22600 || address === 22639) return 0;
    if (address === 22791) return 1;
    if (address === 22855) return clock;
    if (address === 22903) return view().getFloat64(pointer, true) % view().getFloat64(pointer + 8, true);
    throw new Error(`unhandled original host bridge ${address}`);
  }
  const imports = { a: { a: bridge, b: bridge, c() {}, d() {},
    e() { throw new Error('original OOM'); }, f() { throw new Error('original abort'); }, g: () => 0,
    h: pointer => { view().setUint32(pointer, 0, true); return 0; },
    i: (count, size) => { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
    j: (fd, vectors, count, written) => { view().setUint32(written, 0, true); return 0; },
    k: () => 0, l() {},
    m: (target, start, length) => new Uint8Array(instance.exports.o.buffer).copyWithin(target, start, start + length),
    n: (pointer, length) => { const bytes = new Uint8Array(instance.exports.o.buffer);
      for (let i = 0; i < length; ++i) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; bytes[pointer + i] = seed & 255; } return 0; },
  } };
  instance = (await WebAssembly.instantiate(originalBytes, imports)).instance;
  instance.exports.p(); instance.exports.u(0, 0);
  function state() {
    const v = view(), u32 = p => v.getUint32(p, true), f32 = p => v.getFloat32(p, true), f64 = p => v.getFloat64(p, true);
    const entities = new Map(), seen = new Set();
    for (let node = u32(25092); node && !seen.has(node); node = u32(node + 8)) {
      seen.add(node);
      const entity = node - 20, transform = u32(entity + 168), health = u32(entity + 164), physics = u32(entity + 188);
      if (!transform && !health) continue;
      const handle = u32(entity + 16);
      entities.set(handle, { handle, ...originalEntityIdentity(v, entity),
        x: transform ? f32(transform + 20) : 0, y: transform ? f32(transform + 16) : 0,
        angle: transform ? Math.fround(f64(transform + 8)) : 0, radius: physics ? f32(physics + 8) : 0,
        health: health ? f32(health + 8) : 0, maxHealth: health ? f32(health + 12) : 0,
        vx: transform ? f64(transform + 40) : 0, vy: transform ? f64(transform + 48) : 0,
        ax: transform ? f64(transform + 56) : 0, ay: transform ? f64(transform + 64) : 0 });
    }
    const connection = u32(24936), viewer = connection ? u32(connection + 120) : 0, player = viewer ? u32(viewer + 100) : 0;
    return { entities, rng: u32(8573024), player: player ? u32(player + 16) : 0 };
  }
  return { state,
    send(bytes) { const p = instance.exports.q(bytes.length); new Uint8Array(instance.exports.o.buffer).set(bytes, p);
      instance.exports.w(p, bytes.length); instance.exports.r(p); },
    advance(at) { clock = at; instance.exports.v(); instance.exports.t(0, 0); },
  };
}

const report = { passed: true, originalWasm: originalHash, nativeExecutable: nativePath, nativeSha256: nativeHash,
  ticks, budgets: { tolerance: .001, velocityTolerance: .001, ulpTolerance: 2 }, scenarios: [] };
for (const name of names) {
  assert.match(name, /^[a-z-]+$/);
  const golden = await readFile(`tests/parity/golden/${name}/server.json`);
  const inputs = JSON.parse(golden).messages.filter(row => row.funcName === 'sp_server_send' && row.dataHex);
  const chunks = [Buffer.alloc(4)]; chunks[0].writeUInt32LE(inputs.length);
  for (const row of inputs) { assert.ok(Number.isInteger(row.at)); const bytes = Buffer.from(row.dataHex, 'hex'), header = Buffer.alloc(8);
    header.writeUInt32LE(row.at); header.writeUInt32LE(bytes.length, 4); chunks.push(header, bytes); }
  const fixture = path.resolve(output, `${name}.inputs.bin`);
  await writeFile(fixture, Buffer.concat(chunks));
  const native = execFileSync(nativePath, [fixture, String(ticks)], { maxBuffer: 1024 * 1024 * 512 });
  const original = await originalServer();
  let cursor = 0, next = 0, firstDifference = null, mismatchedTicks = 0;
  const trace = [];
  for (let tick = 1; tick <= ticks; ++tick) {
    const at = tick * 50;
    while (next < inputs.length && inputs[next].at <= at) original.send(Buffer.from(inputs[next++].dataHex, 'hex'));
    original.advance(at);
    assert.equal(native.readUInt32LE(cursor), tick);
    const rng = native.readUInt32LE(cursor + 4), player = native.readUInt32LE(cursor + 8), count = native.readUInt32LE(cursor + 12);
    cursor += 16;
    const candidate = new Map();
    for (let i = 0; i < count; ++i, cursor += 48) {
      const handle = native.readUInt32LE(cursor);
      candidate.set(handle, { handle, type: native.readUInt16LE(cursor + 4), kind: native.readUInt8(cursor + 6),
        ...Object.fromEntries(['x','y','angle','radius','health','maxHealth','vx','vy','ax','ay'].map((field, i) => [field, native.readFloatLE(cursor + 8 + i * 4)])) });
    }
    const expected = original.state(), diff = compareEntities(expected.entities, candidate, report.budgets);
    const passed = diff.matched && expected.rng === rng && expected.player === player;
    if (!passed) {
      ++mismatchedTicks;
      firstDifference ??= { tick, at, originalRng: expected.rng, nativeRng: rng, originalPlayer: expected.player, nativePlayer: player,
        missing: diff.missing, extra: diff.extra, missingSamples: diff.missingSamples, extraSamples: diff.extraSamples,
        mismatchCount: diff.mismatchCount, sample: diff.mismatched };
    }
    trace.push({ tick, passed, originalCount: expected.entities.size, nativeCount: count, rngMatch: expected.rng === rng,
      playerMatch: expected.player === player, missing: diff.missing.length, extra: diff.extra.length, mismatches: diff.mismatchCount,
      maxPositionDelta: diff.maxPositionDelta, maxHealthDelta: diff.maxHealthDelta, maxVelocityDelta: diff.maxVelocityDelta });
  }
  assert.equal(cursor, native.length, 'native replay has exactly the requested tick records');
  const result = { scenario: name, passed: mismatchedTicks === 0, ticks, goldenSha256: hash(golden),
    originalWasm: originalHash, nativeSha256: nativeHash, mismatchedTicks, firstDifference, trace };
  await writeFile(path.join(output, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  report.passed &&= result.passed;
  report.scenarios.push({ scenario: name, passed: result.passed, mismatchedTicks, firstDifference });
  console.log(JSON.stringify({ scenario: name, ticks, passed: result.passed, mismatchedTicks, firstDifference }));
}
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (!report.passed) process.exitCode = 1;
