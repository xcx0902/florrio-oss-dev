#!/usr/bin/env node
/**
 * Semantic server-state trace diff.
 *
 * Replays the golden `sp_server_send` inputs against both the shipped
 * sp_server.wasm and the C++ engine wasm, then compares order-independent
 * state aggregates (count, position sums/extents, player position/health).
 * This is deliberately not a packet-byte diff: the C++ snapshot framing is a
 * domain extension, while the original packet encoding is covered by
 * tools/parity/server-trace.mjs.
 *
 * Usage:
 *   node tools/parity/server-state-trace.mjs --all
 *   node tools/parity/server-state-trace.mjs --scenario garden-idle
 */
import path from 'node:path';
import { evidence } from '../verification-evidence.mjs';
import { compareEntities } from './entity-state-diff.mjs';
import { originalEntityIdentity } from './original-entity-identity.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { scenarios, scenarioByName } from './scenarios.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const flag = name => args.includes(name);
const root = path.resolve('.');
const engineWasmPath = path.resolve(option('--engine-wasm', 'client/public/server.wasm'));
const goldenRoot = path.resolve(option('--golden', 'tests/parity/golden'));
const outputRoot = path.resolve(option('--out', 'tests/parity/engine'));
const seed0 = 0x6f6c6446;
const strict = flag('--strict');
// --baseline is the explicit report-only mode used by the non-blocking
// `parity:engine-state` job. It never fails the build; `--strict` is the gate.
const baseline = flag('--baseline');
if (strict && baseline) throw new Error('--strict and --baseline are mutually exclusive');
const dumpAt = Number(option('--dump-at', '0'));
const trackedHandles = option('--track-handles', '').split(',').filter(Boolean).map(Number);
if (trackedHandles.some(handle => !Number.isInteger(handle) || handle <= 0 || handle > 0xffffffff))
  throw new Error('invalid --track-handles');
const soakTicks = Number(option('--soak-ticks', '0'));
if (!Number.isInteger(soakTicks) || soakTicks < 0) throw new Error('invalid --soak-ticks');
const contactOrder = Number(option('--contact-order', '0'));
const tolerance = Number(option('--tolerance', '0.001'));
// R02: velocity/acceleration are part of the per-entity equivalence gate. They
// use the same absolute tolerance as the other fields unless overridden.
const velocityTolerance = Number(option('--velocity-tolerance', String(tolerance)));
// R01/R02: positions are binary32 in the original transform (+16/+20). At
// |x| >= 16384 one f32 ULP is >= 0.001953, so a 1e-3 absolute gate cannot be
// met by any implementation whose f64 accumulator differs in its low bits.
// Allow a small ULP budget (default 2 ULP) on top of the absolute tolerance and
// report the excess separately so the gate stays explicit.
const ulpTolerance = Number(option('--ulp-tolerance', '2'));
const selected = flag('--all')
  ? scenarios
  : args.filter((value, index) => index > 0 && args[index - 1] === '--scenario').flatMap(name => [scenarioByName(name)]);
if (!selected.length) throw new Error('choose --scenario NAME or --all');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fnv = bytes => {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
};
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = text => Uint8Array.from(text.match(/../g) ?? [], pair => parseInt(pair, 16));

async function createServer() {
  const wasm = await readFile(path.join(root, 'web/sp_server.wasm'));
  let instance;
  let clock = 0;
  let seed = seed0;
  let memory = null;
  let outgoing = [];
  const imports = {
    a: {
      a: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
      b: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
      c: (pointer, length) => respond(true, pointer, length),
      d: (pointer, length) => respond(false, pointer, length),
      e: () => { throw new WebAssembly.RuntimeError('OOM'); },
      f: () => { throw new WebAssembly.RuntimeError('abort'); },
      g: () => 0,
      h: (pointer) => { new DataView(memory.buffer).setUint32(pointer >>> 0, 0, true); return 0; },
      i: (countPointer, sizePointer) => {
        const view = new DataView(memory.buffer);
        view.setUint32(countPointer >>> 0, 0, true);
        view.setUint32(sizePointer >>> 0, 0, true);
        return 0;
      },
      j: (descriptor, vectors, count, writtenPointer) => {
        const view = new DataView(memory.buffer);
        let total = 0;
        for (let index = 0; index < count; index++) total += view.getUint32(vectors + index * 8 + 4, true);
        view.setUint32(writtenPointer >>> 0, total >>> 0, true);
        return 0;
      },
      k: () => 0,
      l: () => {},
      m: (target, start, length) => { new Uint8Array(memory.buffer).copyWithin(target, start, start + length); },
      n: (pointer, length) => {
        const bytes = new Uint8Array(memory.buffer);
        for (let index = 0; index < length; index++) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          bytes[pointer + index] = seed & 255;
        }
        return 0;
      },
    },
  };
  function asmConst(address, signaturePointer, argumentsPointer) {
    const bytes = new Uint8Array(memory.buffer);
    const view = new DataView(memory.buffer);
    const values = [];
    let word = argumentsPointer >>> 2;
    let cursor = signaturePointer;
    let type;
    while ((type = bytes[cursor++])) {
      const isDouble = type < 105;
      if (isDouble && (word & 1)) word++;
      values.push(isDouble ? view.getFloat64(word * 4, true) : view.getInt32(word * 4, true));
      word += isDouble ? 2 : 1;
    }
    switch (address) {
      case 22600: return 0;
      case 22639: return 0;
      case 22791: return 1;
      case 22855: return values[0] ? clock : clock;
      case 22903: return values[0] % values[1];
      default: throw new Error(`unexpected host bridge ${address}`);
    }
  }
  function respond(final, pointer, length) {
    const bytes = pointer ? new Uint8Array(memory.buffer).slice(pointer, pointer + length) : new Uint8Array(0);
    outgoing.push({ final, length: bytes.length, hash: fnv(bytes), hex: bytes.length && bytes.length <= 8192 ? hex(bytes) : null });
  }
  ({ instance } = await WebAssembly.instantiate(wasm, imports));
  memory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
  instance.exports.p();
  const api = {
    wasmSha256: sha256(wasm),
    exports: instance.exports,
    get memory() { return memory; },
    get clock() { return clock; },
    setClock(value) { clock = value; },
    flush() { outgoing = []; instance.exports.t(0, 0); return outgoing.splice(0); },
    init() {
      clock = 0;
      instance.exports.u(0, 0);
      return outgoing.splice(0);
    },
    send(bytes) {
      const pointer = instance.exports.q(bytes.length);
      new Uint8Array(memory.buffer).set(bytes, pointer);
      instance.exports.w(pointer, bytes.length);
      instance.exports.r(pointer);
    },
    think(at) {
      clock = at;
      instance.exports.v();
      return api.flush();
    },
    memoryHash() { return sha256(new Uint8Array(memory.buffer)); },
  };
  return api;
}

function originalEntities(server) {
  const view = new DataView(server.memory.buffer);
  const u32 = pointer => view.getUint32(pointer >>> 0, true);
  const f32 = pointer => view.getFloat32(pointer >>> 0, true);
  const f64 = pointer => view.getFloat64(pointer >>> 0, true);
  const entities = new Map();
  const seen = new Set();
  let node = u32(25092);
  while (node && !seen.has(node)) {
    seen.add(node);
    const entity = node - 20;
    const transform = u32(entity + 168);
    const health = u32(entity + 164);
    if (!transform && !health) { node = u32(node + 8); continue; }
    const physics = u32(entity + 188);
    const handle = u32(entity + 16);
    const ai = u32(entity + 104);
    let debug;
    if (trackedHandles.includes(handle) && ai) {
      const order = Array.from({ length: u32(23008) }, (_, index) => u32(u32(23016) + index * 4));
      debug = { aiOrder: order.indexOf(ai), aiAngle: f32(ai + 52), deadline: f64(ai + 40),
        interval: f32(ai + 100), timerActive: view.getUint8(ai + 32) };
    }
    entities.set(handle, {
      handle,
      debug,
      ...originalEntityIdentity(view, entity),
      x: transform ? f32(transform + 20) : 0,
      y: transform ? f32(transform + 16) : 0,
      angle: transform ? Math.fround(f64(transform + 8)) : 0,
      radius: physics ? f32(physics + 8) : 0,
      health: health ? f32(health + 8) : 0,
      maxHealth: health ? f32(health + 12) : 0,
      // Original transform stores f64 velocity/acceleration: x +40, y +48,
      // x-acceleration +56, y-acceleration +64 (integrateMovement 153591:
      // y += drag*v48 + dt*a64, x += drag*v40 + dt*a56).
      vx: transform ? f64(transform + 40) : 0,
      vy: transform ? f64(transform + 48) : 0,
      ax: transform ? f64(transform + 56) : 0,
      ay: transform ? f64(transform + 64) : 0,
    });
    node = u32(node + 8);
  }
  return entities;
}

function originalState(server) {
  const view = new DataView(server.memory.buffer);
  const u32 = pointer => view.getUint32(pointer >>> 0, true);
  const f32 = pointer => view.getFloat32(pointer >>> 0, true);
  let count = 0;
  let sumX = 0, sumY = 0, sumHealth = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const seen = new Set();
  let node = u32(25092);
  while (node && !seen.has(node)) {
    seen.add(node);
    const entity = node - 20;
    const transform = u32(entity + 168);
    const health = u32(entity + 164);
    // The world list also links four storage sentinels (world record and
    // capacity slots) that have neither a transform nor a health component.
    // They are not entities and must not participate in the semantic count.
    if (!transform && !health) { node = u32(node + 8); continue; }
    let x = 0, y = 0;
    if (transform) { x = f32(transform + 20); y = f32(transform + 16); }
    const value = health ? f32(health + 8) : 0;
    sumX += x; sumY += y; sumHealth += value;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    ++count;
    node = u32(node + 8);
  }
  const connection = u32(24936);
  const player = connection ? u32(connection + 120) : 0;
  const avatar = player ? u32(player + 100) : 0;
  const transform = avatar ? u32(avatar + 168) : 0;
  const health = avatar ? u32(avatar + 164) : 0;
  return {
    count, rng: u32(8573024),
    sumX, sumY, sumHealth,
    minX: count ? minX : 0, maxX: count ? maxX : 0,
    minY: count ? minY : 0, maxY: count ? maxY : 0,
    playerValid: avatar !== 0,
    playerHandle: avatar ? u32(avatar + 16) : 0,
    playerX: transform ? f32(transform + 20) : 0,
    playerY: transform ? f32(transform + 16) : 0,
    playerHealth: health ? f32(health + 8) : 0,
  };
}

async function createEngine() {
  const bytes = await readFile(engineWasmPath);
  let memory = null;
  const imports = {
    env: { emscripten_notify_memory_growth: () => {} },
    wasi_snapshot_preview1: {
      fd_close: () => 0,
      fd_write: (fd, iovs, iovsLength, writtenPointer) => {
        const view = new DataView(memory.buffer);
        view.setUint32(writtenPointer >>> 0, 0, true);
        return 0;
      },
      fd_seek: () => 0,
    },
  };
  const { instance } = await WebAssembly.instantiate(bytes, imports);
  memory = instance.exports.memory;
  const exports = instance.exports;
  return {
    wasmSha256: sha256(bytes),
    init() {
      exports.sp_server_init();
    },
    send(bytes) {
      const pointer = exports.malloc(bytes.length);
      new Uint8Array(memory.buffer).set(bytes, pointer);
      exports.sp_server_send(pointer, bytes.length);
      exports.free(pointer);
    },
    think() {
      exports.sp_server_think();
      exports.sp_server_flush();
    },
    setContactOrder(order) { exports.sp_server_debug_set_contact_order(order); },
    stateEntities() {
      const size = exports.sp_server_state_record_size();
      const count = exports.sp_server_state_dump(0, 0);
      if (count === 0) return new Map();
      const pointer = exports.malloc(count * size);
      const written = exports.sp_server_state_dump(pointer, count);
      const view = new DataView(memory.buffer);
      const entities = new Map();
      for (let index = 0; index < written; index++) {
        const offset = pointer + index * size;
        const handle = view.getUint32(offset, true);
        entities.set(handle, {
          handle,
          debug: trackedHandles.includes(handle) ? {
            aiOrder: exports.sp_server_debug_entity_field(handle, 38),
            aiAngle: exports.sp_server_debug_entity_field(handle, 10),
            deadline: exports.sp_server_debug_entity_field(handle, 33),
            interval: exports.sp_server_debug_entity_field(handle, 35),
            timerActive: exports.sp_server_debug_entity_field(handle, 34),
          } : undefined,
          type: view.getUint16(offset + 4, true),
          kind: view.getUint8(offset + 6),
          x: view.getFloat32(offset + 8, true),
          y: view.getFloat32(offset + 12, true),
          angle: view.getFloat32(offset + 16, true),
          radius: view.getFloat32(offset + 20, true),
          health: view.getFloat32(offset + 24, true),
          maxHealth: view.getFloat32(offset + 28, true),
          vx: view.getFloat32(offset + 32, true),
          vy: view.getFloat32(offset + 36, true),
          ax: view.getFloat32(offset + 40, true),
          ay: view.getFloat32(offset + 44, true),
        });
      }
      exports.free(pointer);
      return entities;
    },
    state() {
      return {
        rng: exports.sp_server_debug_rng(),
        rngDraws: exports.sp_server_debug_rng_draws(),
        lastTimer: exports.sp_server_debug_ai_timer_handle(),
        count: exports.sp_server_state_count(),
        sumX: exports.sp_server_state_sum_x(),
        sumY: exports.sp_server_state_sum_y(),
        sumHealth: exports.sp_server_state_sum_health(),
        minX: exports.sp_server_state_min_x(),
        maxX: exports.sp_server_state_max_x(),
        minY: exports.sp_server_state_min_y(),
        maxY: exports.sp_server_state_max_y(),
        playerValid: exports.sp_server_player_valid() !== 0,
        playerHandle: exports.sp_server_player_handle(),
        playerX: exports.sp_server_player_x(),
        playerY: exports.sp_server_player_y(),
        playerHealth: exports.sp_server_player_health(),
        digest: BigInt.asUintN(64, exports.sp_server_state_digest()).toString(16).padStart(16, '0'),
      };
    },
  };
}

const close = (a, b, tolerance = 0.01) => Math.abs(a - b) <= tolerance;

async function replay(scenario) {
  const browser = JSON.parse(await readFile(path.join(goldenRoot, scenario.name, 'server.json'), 'utf8'));
  const sends = browser.messages
    .filter(message => message.funcName === 'sp_server_send' && message.dataHex)
    .map((message, index) => ({ at: message.at, order: index, bytes: fromHex(message.dataHex) }));
  const server = await createServer();
  server.init();
  const engine = await createEngine();
  engine.init();
  if (contactOrder !== 0) engine.setContactOrder(contactOrder);
  const maxTime = browser.messages.length ? Math.max(...browser.messages.map(message => message.at), 0) : 0;
  const lastTick = Math.max(Math.floor(maxTime / 50) * 50, soakTicks * 50);
  const trace = [];
  let eventIndex = 0;
  for (let at = 50; at <= lastTick; at += 50) {
    while (eventIndex < sends.length && sends[eventIndex].at <= at) {
      const event = sends[eventIndex++];
      server.setClock(event.at);
      server.send(event.bytes);
      engine.send(event.bytes);
    }
    server.think(at);
    engine.think();
    const original = originalState(server);
    const candidate = engine.state();
    const originalMap = originalEntities(server);
    const candidateMap = engine.stateEntities();
    const entityDiff = compareEntities(originalMap, candidateMap, { tolerance, velocityTolerance, ulpTolerance });
    if (dumpAt !== 0 && at === dumpAt) {
      const rows = [];
      for (const [handle, value] of originalMap) rows.push({ side: 'original', handle, index: handle & 0x3fff, ...value });
      for (const [handle, value] of candidateMap) rows.push({ side: 'candidate', handle, index: handle & 0x3fff, ...value });
      rows.sort((a, b) => a.index - b.index || a.side.localeCompare(b.side));
      report.dump = rows.filter(row => row.index >= 860);
    }
    trace.push({
      at,
      tracked: trackedHandles.length ? trackedHandles.map(handle => ({ handle,
        original: originalMap.get(handle) ?? null, candidate: candidateMap.get(handle) ?? null })) : undefined,
      original: { count: original.count, sumX: original.sumX, sumY: original.sumY,
                  rng: original.rng,
                  sumHealth: original.sumHealth, playerValid: original.playerValid,
                  playerHandle: original.playerHandle,
                  playerX: original.playerX, playerY: original.playerY,
                  playerHealth: original.playerHealth },
      candidate: { count: candidate.count, sumX: candidate.sumX, sumY: candidate.sumY,
                   rng: candidate.rng, rngDraws: candidate.rngDraws, lastTimer: candidate.lastTimer,
                   sumHealth: candidate.sumHealth, playerValid: candidate.playerValid,
                   playerHandle: candidate.playerHandle,
                   playerX: candidate.playerX,
                   playerY: candidate.playerY, playerHealth: candidate.playerHealth,
                   digest: candidate.digest },
      entity: {
        matched: entityDiff.matched,
        exactHandles: entityDiff.exactHandles,
        missing: entityDiff.missing.length,
        extra: entityDiff.extra.length,
        maxPositionDelta: entityDiff.maxPositionDelta,
        maxPositionExcess: entityDiff.maxPositionExcess,
        positionWorst: entityDiff.positionWorst,
        maxHealthDelta: entityDiff.maxHealthDelta,
        maxAngleDelta: entityDiff.maxAngleDelta,
        maxRadiusDelta: entityDiff.maxRadiusDelta,
        maxVelocityDelta: entityDiff.maxVelocityDelta,
        maxAccelerationDelta: entityDiff.maxAccelerationDelta,
        velocityWorst: entityDiff.velocityWorst,
        missingSamples: entityDiff.missingSamples,
        extraSamples: entityDiff.extraSamples,
        mismatchCount: entityDiff.mismatchCount,
        mismatchedHandles: entityDiff.mismatchedHandles.slice(0, 64),
        sample: entityDiff.mismatched.slice(0, 4),
      },
    });
  }
  const last = trace[trace.length - 1];
  const countMatch = trace.every(tick => tick.original.count === tick.candidate.count);
  const entityMatch = trace.every(tick => tick.entity.matched);
  const handleMatch = trace.every(tick => tick.entity.exactHandles);
  const firstEntityDiff = trace.find(tick => !tick.entity.matched) ?? null;
  const firstRngDiff = trace.find(tick => tick.original.rng !== tick.candidate.rng) ?? null;
  const rngMatch = firstRngDiff === null;
  // R02: the deterministic scenarios use the same 1e-3 tolerance for the player
  // position and health as for every other entity (the old 0.05 was a
  // transition value).
  const playerDeltas = trace.map(tick => ({
    at: tick.at,
    valid: tick.original.playerValid === tick.candidate.playerValid,
    x: Math.abs(tick.original.playerX - tick.candidate.playerX),
    y: Math.abs(tick.original.playerY - tick.candidate.playerY),
    health: Math.abs(tick.original.playerHealth - tick.candidate.playerHealth),
  }));
  const maxPlayerDelta = playerDeltas.reduce(
    (worst, entry) => Math.max(worst, entry.x, entry.y, entry.health), 0);
  const firstPlayerDiff = playerDeltas.find(entry =>
    !entry.valid || entry.x > tolerance || entry.y > tolerance || entry.health > tolerance) ?? null;
  const playerMatch = trace.every(tick =>
    tick.original.playerValid === tick.candidate.playerValid
      && (!tick.original.playerValid
        || (close(tick.original.playerX, tick.candidate.playerX, tolerance)
          && close(tick.original.playerY, tick.candidate.playerY, tolerance)
          && close(tick.original.playerHealth, tick.candidate.playerHealth, tolerance))));
  return {
    scenario: scenario.name,
    originalWasm: server.wasmSha256,
    engineWasm: engine.wasmSha256,
    inputs: sends.length,
    ticks: trace.length,
    countMatch,
    handleMatch,
    entityMatch,
    mismatchedTicks: trace.filter(tick => !tick.entity.matched).length,
    rngMatch,
    firstRngDiff: firstRngDiff === null ? null : { at: firstRngDiff.at,
      original: firstRngDiff.original.rng, candidate: firstRngDiff.candidate.rng,
      candidateDraws: firstRngDiff.candidate.rngDraws, lastTimer: firstRngDiff.candidate.lastTimer },
    playerMatch,
    tolerance,
    velocityTolerance,
    maxPlayerDelta,
    firstPlayerDiff,
    firstEntityDiff: firstEntityDiff === null ? null : {
      at: firstEntityDiff.at,
      missing: firstEntityDiff.entity.missing,
      extra: firstEntityDiff.entity.extra,
      missingSamples: firstEntityDiff.entity.missingSamples,
      extraSamples: firstEntityDiff.entity.extraSamples,
      maxPositionDelta: firstEntityDiff.entity.maxPositionDelta,
      maxPositionExcess: firstEntityDiff.entity.maxPositionExcess,
      positionWorst: firstEntityDiff.entity.positionWorst,
      maxHealthDelta: firstEntityDiff.entity.maxHealthDelta,
      maxAngleDelta: firstEntityDiff.entity.maxAngleDelta,
      maxRadiusDelta: firstEntityDiff.entity.maxRadiusDelta,
      maxVelocityDelta: firstEntityDiff.entity.maxVelocityDelta,
      maxAccelerationDelta: firstEntityDiff.entity.maxAccelerationDelta,
      sample: firstEntityDiff.entity.sample,
    },
    final: last,
    trace,
  };
}

await mkdir(outputRoot, { recursive: true });
const report = { soakTicks, engineWasmPath: path.relative(root, engineWasmPath), evidence: await evidence(), generatedAt: new Date().toISOString(), strict, baseline, tolerance, velocityTolerance,
  ulpTolerance, scenarios: [], passed: true, strictPassed: true };
for (const scenario of selected) {
  const result = await replay(scenario);
  await writeFile(path.join(outputRoot, `${scenario.name}.json`), JSON.stringify(result) + '\n');
  report.scenarios.push({ scenario: result.scenario, countMatch: result.countMatch,
    originalWasm: result.originalWasm, engineWasm: result.engineWasm,
    rngMatch: result.rngMatch, firstRngDiff: result.firstRngDiff,
    handleMatch: result.handleMatch, entityMatch: result.entityMatch,
    mismatchedTicks: result.mismatchedTicks,
    playerMatch: result.playerMatch, inputs: result.inputs, ticks: result.ticks,
    maxPlayerDelta: result.maxPlayerDelta, firstPlayerDiff: result.firstPlayerDiff,
    maxVelocityDelta: result.final?.entity?.maxVelocityDelta ?? null,
    firstEntityDiff: result.firstEntityDiff, final: result.final });
  if (!result.countMatch) report.passed = false;
  report.strictPassed = report.strictPassed !== false
    && result.handleMatch && result.entityMatch && result.playerMatch && result.rngMatch;
  if (strict && !(result.handleMatch && result.entityMatch && result.playerMatch && result.rngMatch))
    report.passed = false;
  console.log(JSON.stringify({ scenario: result.scenario, countMatch: result.countMatch,
    handleMatch: result.handleMatch, entityMatch: result.entityMatch,
    playerMatch: result.playerMatch, firstEntityDiff: result.firstEntityDiff,
    final: result.final }, null, 2));
}
await writeFile(path.join(outputRoot, selected.length === scenarios.length ? 'report.json' : 'report-partial.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, strictPassed: report.strictPassed,
  strict, baseline, scenarios: report.scenarios.length }, null, 2));
// `--baseline` is the non-blocking baseline job: it records the report and
// always exits zero. `--strict` is the gate used by `test:all` and fails on any
// count/handle/entity/player mismatch. The bare invocation stays report-only
// for ad-hoc investigation.
if (strict && !report.passed) process.exitCode = 1;
if (!strict && !baseline) console.log('report-only run; use --strict to gate or --baseline for the recorded baseline');
