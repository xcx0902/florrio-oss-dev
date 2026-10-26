#!/usr/bin/env node
/** Controlled original-WASM vs C++ Hornet fixtures. Extra oracle exports
 * expose original 695 without changing any original instruction; all memory
 * writes are explicit fixture preparation. The normal think path tests retained
 * targets inside/outside attack_range and a nonzero cooldown. Independent
 * callback, contact and lifecycle cases localize behavior and cleanup failures.
 *
 * Usage: node tools/parity/hornet-stinger-trace.mjs [--out FILE] [--long-run]
 * --long-run adds a separately reported, strict 1000-tick production soak.
 */
import path from 'node:path';
import { withAdditionalExports } from '../lib/wasm-binary.mjs';
import { compareEntities } from './entity-state-diff.mjs';
import { originalEntityIdentity } from './original-entity-identity.mjs';
import { evidence } from '../verification-evidence.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const root = path.resolve('.');
const engineWasmPath = path.resolve(option('--engine-wasm', 'client/public/server.wasm'));
const output = path.resolve(option('--out', 'tests/parity/hornet/report.json'));
const goldenScenario = option('--scenario', 'garden-idle');
const seed0 = 0x6f6c6446;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fromHex = text => Uint8Array.from(text.match(/../g) ?? [], pair => parseInt(pair, 16));

async function originalServer() {
  const wasm = await readFile(path.join(root, 'web/sp_server.wasm'));
  let clock = 0;
  let seed = seed0;
  let memory = null;
  const imports = {
    a: {
      a: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
      b: (address, signature, argumentsPointer) => asmConst(address, signature, argumentsPointer),
      c: (pointer, length) => respond(true, pointer, length),
      d: (pointer, length) => respond(false, pointer, length),
      e: () => { throw new WebAssembly.RuntimeError('OOM'); },
      f: () => { throw new WebAssembly.RuntimeError('abort'); },
      g: () => 0,
      h: pointer => { new DataView(memory.buffer).setUint32(pointer >>> 0, 0, true); return 0; },
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
      case 22855: return clock;
      case 22903: return values[0] % values[1];
      default: throw new Error(`unexpected host bridge ${address}`);
    }
  }
  // This fixture compares simulation state, not packets. Still run the
  // original flush, but avoid building unused hex copies on every soak tick.
  function respond() {}
  const { instance } = await WebAssembly.instantiate(withAdditionalExports(wasm, [{name:'callback',index:695}]), imports);
  memory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
  instance.exports.p();
  return {
    wasmSha256: sha256(wasm),
    init() { clock = 0; instance.exports.u(0, 0); },
    setClock(at) { clock = at; },
    send(bytes) {
      const pointer = instance.exports.q(bytes.length);
      new Uint8Array(memory.buffer).set(bytes, pointer);
      instance.exports.w(pointer, bytes.length);
      instance.exports.r(pointer);
    },
    think(at) { clock = at; instance.exports.v(); instance.exports.t(0, 0); },
    set(handle, field, value) {
      const view = new DataView(memory.buffer);
      const entity = this.entities().get(handle)?.pointer;
      if (!entity) throw new Error(`unknown original handle ${handle}`);
      const transform = view.getUint32(entity + 168, true);
      const ai = view.getUint32(entity + 104, true);
      const health = view.getUint32(entity + 164, true);
      const locations = {0:[transform+20,4],1:[transform+16,4],2:[transform+40,8],3:[transform+48,8],4:[transform+56,8],5:[transform+64,8],6:[transform+8,8],8:[health+8,4],9:[health+12,4],10:[ai+52,4],19:[ai+56,4],36:[health+24,4]};
      if(field===12) {
        const target=this.entities().get(value)?.pointer ?? 0;
        // Original spatial-ai.replaceAggroHandle: maintain both intrusive
        // links when selecting an existing actor in the controlled fixture.
        const handleRef=ai+152;
        const prev=view.getUint32(ai+156,true), next=view.getUint32(ai+160,true);
        view.setUint32(prev+8,next,true);view.setUint32(next+4,prev,true);
        view.setUint32(ai+152,0,true);view.setUint32(ai+160,handleRef,true);
        const tail=view.getUint32(target+12,true);
        view.setUint32(handleRef,view.getUint32(target+4,true),true);
        view.setUint32(ai+160,tail,true);view.setUint32(tail+4,handleRef,true);
        view.setUint32(ai+156,target+4,true);view.setUint32(target+12,handleRef,true);
      } else {
        const [address,size]=locations[field] ?? [];
        if(!address) throw new Error(`unsupported field ${field}`);
        if(size===4) view.setFloat32(address,value,true); else view.setFloat64(address,value,true);
      }
      if(transform) view.setUint8(transform+80,0);
    },
    callback(handle) {
      const entity=this.entities().get(handle)?.pointer;
      if(!entity) throw new Error('missing handle');
      instance.exports.callback(entity,0);
    },
    entities() {
      const view = new DataView(memory.buffer);
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
        entities.set(u32(entity + 16), {
          ...originalEntityIdentity(view, entity),
          pointer: entity,
          owner: u32(entity+236) ? u32(u32(entity+236)+16) : null,
          species: u32(entity+148),
          petal: u32(entity+152),
          flags: [view.getUint8(entity+92),view.getUint8(entity+93),view.getUint8(entity+94),view.getUint8(entity+95)],
          physicsFlags: physics ? [view.getUint8(physics+48),view.getUint8(physics+49),view.getUint8(physics+50),view.getUint8(physics+51)] : [],
          parent: u32(entity+224),
          radius2: physics ? f32(physics+12) : 0,
          damage: physics ? f32(physics+44) : 0,
          healthTimer: health ? f32(health+24) : 0,
          cooldown: u32(entity+104) ? f32(u32(entity+104)+56) : null,
          ax: transform ? f64(transform+56) : 0,
          ay: transform ? f64(transform+64) : 0,
          x: transform ? f32(transform + 20) : 0,
          y: transform ? f32(transform + 16) : 0,
          angle: transform ? Math.fround(f64(transform + 8)) : 0,
          radius: physics ? f32(physics + 8) : 0,
          health: health ? f32(health + 8) : 0,
          maxHealth: health ? f32(health + 12) : 0,
          vx: transform ? f64(transform + 40) : 0,
          vy: transform ? f64(transform + 48) : 0,
        });
        node = u32(node + 8);
      }
      return entities;
    },
  };
}

async function engineServer() {
  const bytes = await readFile(engineWasmPath);
  let memory = null;
  const imports = {
    env: { emscripten_notify_memory_growth: () => {} },
    wasi_snapshot_preview1: {
      fd_close: () => 0,
      fd_write: (fd, iovs, iovsLength, writtenPointer) => {
        new DataView(memory.buffer).setUint32(writtenPointer >>> 0, 0, true);
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
    init() { exports.sp_server_init(); },
    send(packet) {
      const pointer = exports.malloc(packet.length);
      new Uint8Array(memory.buffer).set(packet, pointer);
      exports.sp_server_send(pointer, packet.length);
      exports.free(pointer);
    },
    think() { exports.sp_server_think(); exports.sp_server_flush(); },
    set(handle,field,value) {
      if(!exports.sp_server_debug_set_entity_field(handle,field,value)) throw new Error(`unable to set ${handle}/${field}`);
    },
    callback(handle) { if(!exports.sp_server_debug_fire_attack(handle)) throw new Error('callback not dispatched'); },
    entities() {
      const size = exports.sp_server_state_record_size();
      const count = exports.sp_server_state_dump(0, 0);
      if (count === 0) return new Map();
      const pointer = exports.malloc(count * size);
      const written = exports.sp_server_state_dump(pointer, count);
      const view = new DataView(memory.buffer);
      const entities = new Map();
      for (let index = 0; index < written; index++) {
        const offset = pointer + index * size;
        entities.set(view.getUint32(offset, true), {
          damage: exports.sp_server_debug_entity_field(view.getUint32(offset,true),26),
          healthTimer: exports.sp_server_debug_entity_field(view.getUint32(offset,true),36),
          cooldown: exports.sp_server_debug_entity_field(view.getUint32(offset,true),19),
          ax: exports.sp_server_debug_entity_field(view.getUint32(offset,true),4),
          ay: exports.sp_server_debug_entity_field(view.getUint32(offset,true),5),
          owner: exports.sp_server_debug_entity_owner(view.getUint32(offset,true)) >>> 0,
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
        });
      }
      exports.free(pointer);
      return entities;
    },
  };
}

const golden = JSON.parse(await readFile(path.join(root, 'tests/parity/golden', goldenScenario, 'server.json'), 'utf8'));
const goldenSends = golden.messages.filter(message => message.funcName === 'sp_server_send' && message.dataHex);
const handshake = fromHex(goldenSends[0].dataHex);
const restart = fromHex(goldenSends[1].dataHex);

const tolerance = 1e-3;
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
function compare(a, b) {
  if (a === undefined || b === undefined) return false;
  return compareEntities(new Map([[1, a]]), new Map([[1, b]]), { ulpTolerance: 0 }).matched
    && a.owner === b.owner && ['damage', 'healthTimer'].every(field => close(a[field], b[field]));
}
async function fixture(name, {
  angle = 0, distance = 300, cooldown = 0, mode = 'callback', ticks = 0,
  hit = false, target = true, expectedSpawn = true,
} = {}) {
  const original = await originalServer(), engine = await engineServer();
  for (const server of [original, engine]) { server.init(); server.send(handshake); server.send(restart); }
  const initial = engine.entities();
  const player = [...initial].find(([, entity]) => entity.kind === 1)[0];
  const hornet = [...initial].find(([, entity]) => entity.kind === 2 && entity.type === 14)[0];
  const checks = {};
  const mutations = [];
  const setBoth = (phase, handle, field, value) => {
    mutations.push({ phase, handle, field, value });
    for (const server of [original, engine]) server.set(handle, field, value);
  };
  // Original memory offsets and the domain debug ABI are adapters for the same
  // explicit starting state. No writes occur during the tick observation loop.
  const y = mode === 'gate' || hit ? 0 : 50000;
  for (const [handle, x] of [[player, 10000 - distance], [hornet, 10000]]) {
    setBoth('setup', handle, 0, x); setBoth('setup', handle, 1, y);
    for (const field of [2, 3, 4, 5]) setBoth('setup', handle, field, 0);
  }
  setBoth('setup', hornet, 6, angle); setBoth('setup', hornet, 10, angle);
  if (target) setBoth('setup', hornet, 12, player);
  setBoth('setup', hornet, 19, cooldown);
  const beforeOriginal = original.entities(), beforeEngine = engine.entities();
  checks.actorIdentity = [beforeOriginal, beforeEngine].every(entities =>
    entities.get(player)?.kind === 1 && entities.get(hornet)?.kind === 2
    && entities.get(hornet)?.type === 14);
  checks.initialActorState = compareEntities(
    new Map([player, hornet].map(handle => [handle, beforeOriginal.get(handle)])),
    new Map([player, hornet].map(handle => [handle, beforeEngine.get(handle)])),
    { tolerance, ulpTolerance: 0 }).matched;
  checks.initialCounts = beforeOriginal.size === beforeEngine.size;
  if (mode === 'gate') { original.think(50); engine.think(); }
  else { original.callback(hornet); engine.callback(hornet); }
  const newOriginal = [...original.entities()].filter(([handle]) => !beforeOriginal.has(handle));
  const newEngine = [...engine.entities()].filter(([handle]) => !beforeEngine.has(handle));
  const a = newOriginal[0], b = newEngine[0];
  checks.spawnCount = newOriginal.length === Number(expectedSpawn) && newEngine.length === Number(expectedSpawn);
  checks.spawnState = !expectedSpawn || Boolean(a && b && a[0] === b[0] && compare(a[1], b[1]));
  const originalHornet = original.entities().get(hornet), engineHornet = engine.entities().get(hornet);
  checks.firingActorState = compareEntities(new Map([[hornet, originalHornet]]),
    new Map([[hornet, engineHornet]]), { tolerance, ulpTolerance: 0 }).matched;
  checks.recoil = ['vx', 'vy', 'ax', 'ay'].every(field => close(originalHornet[field], engineHornet[field]));
  checks.cooldown = close(originalHornet.cooldown, engineHornet.cooldown);
  if (mode === 'gate') checks.cooldownValue = close(originalHornet.cooldown,
    expectedSpawn ? 2000 : Math.max(0, cooldown - 50));
  if (expectedSpawn && a && b) {
    checks.componentValues = [a[1], b[1]].every(entity => entity.kind === 5 && entity.type === 14
      && entity.owner === hornet && entity.radius === 11 && entity.health === 10
      && entity.maxHealth === 10 && entity.damage === 10 && entity.healthTimer === 2000);
    if (mode === 'callback') {
      const facing = Math.fround(angle), dx = Math.fround(Math.cos(facing)), dy = Math.fround(Math.sin(facing));
      checks.launchValues = [a[1], b[1]].every(entity =>
        close(entity.x, Math.fround(10000 - Math.fround(dx * 20)))
        && close(entity.y, Math.fround(y - Math.fround(dy * 20)))
        && close(entity.vx, Math.fround(dx * 1.4)) && close(entity.vy, Math.fround(dy * 1.4))
        && close(entity.ax, Math.fround(dx * 0.6)) && close(entity.ay, Math.fround(dy * 0.6)));
    }
  }
  const stinger = a?.[0] ?? null, candidateStinger = b?.[0] ?? null;
  let contactSite = null;
  if (hit && stinger !== null && candidateStinger === stinger) {
    // Select an arena site clear of the actual initial population on both
    // sides; a distant ambient mob must not become a second damage source.
    const ambient = [...original.entities(), ...engine.entities()]
      .filter(([handle, entity]) => ![hornet, player, stinger].includes(handle) && entity.kind === 2);
    for (let x = 6000; x <= 23000; x += 500) for (let y = -1900; y <= 1900; y += 100) {
      const clearance = Math.min(...ambient.map(([, entity]) => Math.hypot(x - entity.x, y - entity.y)));
      if (contactSite === null || clearance > contactSite.clearance) contactSite = { x, y, clearance };
    }
    checks.contactClearance = contactSite.clearance > 600;
    for (const [handle, dx] of [[hornet, 1000], [player, 0], [stinger, 5]]) {
      setBoth('contact-setup', handle, 0, contactSite.x + dx);
      setBoth('contact-setup', handle, 1, contactSite.y);
    }
    setBoth('contact-setup', player, 8, 100); setBoth('contact-setup', player, 9, 100);
    for (const field of [2, 3, 4, 5]) setBoth('contact-setup', stinger, field, 0);
  }
  const timeline = [];
  for (let tick = 1; tick <= ticks; tick++) {
    const at = (tick + Number(mode === 'gate')) * 50;
    original.think(at); engine.think();
    const originalNow = original.entities(), engineNow = engine.entities();
    const oe = originalNow.get(stinger), ee = engineNow.get(candidateStinger);
    const pa = originalNow.get(player), pb = engineNow.get(player);
    const matched = oe === undefined && ee === undefined || compare(oe, ee);
    const playerDiff = hit ? compareEntities(
      new Map(pa ? [[player, pa]] : []), new Map(pb ? [[player, pb]] : []),
      { tolerance, ulpTolerance: 0 }) : null;
    const playerMatch = !hit || Boolean(pa && pb && playerDiff.matched);
    timeline.push({ tick, at, matched, playerMatch,
      originalCount: Number(oe !== undefined), engineCount: Number(ee !== undefined),
      original: oe ?? null, engine: ee ?? null,
      originalPlayer: hit ? pa : undefined, enginePlayer: hit ? pb : undefined,
      playerDifference: hit && !playerMatch ? playerDiff : undefined });
  }
  checks.tickStates = timeline.every(row => row.matched && row.playerMatch);
  if (name === 'lifetime') {
    const at = tick => timeline.find(row => row.tick === tick);
    checks.aliveThrough1950ms = [at(39)?.original, at(39)?.engine]
      .every(entity => entity?.health === 10 && entity.healthTimer === 50);
    checks.deadAt2000ms = [at(40)?.original, at(40)?.engine]
      .every(entity => entity?.health === 0 && entity.healthTimer === 0);
    checks.corpseThrough2950ms = [at(59)?.original, at(59)?.engine].every(entity => entity?.health === 0);
    checks.removedAt3000ms = timeline.filter(row => row.tick >= 60).length > 0
      && timeline.filter(row => row.tick >= 60).every(row => row.originalCount === 0 && row.engineCount === 0);
  }
  if (hit) {
    checks.damage10OnTick1 = [timeline[0]?.originalPlayer, timeline[0]?.enginePlayer].every(entity => entity?.health === 90);
    checks.projectileKilledOnContact = [timeline[0]?.original, timeline[0]?.engine].every(entity => entity?.health === 0);
    checks.noRepeatedDamage = timeline.every(row => row.originalPlayer?.health >= 90 && row.enginePlayer?.health >= 90);
    checks.contactCorpseAndRemoval = [timeline[19]?.original, timeline[19]?.engine].every(entity => entity?.health === 0)
      && timeline.filter(row => row.tick >= 21).length > 0
      && timeline.filter(row => row.tick >= 21).every(row => row.originalCount === 0 && row.engineCount === 0);
  }
  return { name, passed: Object.values(checks).every(Boolean), checks, mode, distance, cooldown, target,
    expectedSpawn, stinger, candidateStinger, triggerTick: expectedSpawn ? Number(mode === 'gate') : null,
    triggerAt: expectedSpawn ? Number(mode === 'gate') * 50 : null,
    originalHornet, engineHornet, originalSpawn: a?.[1] ?? null, engineSpawn: b?.[1] ?? null,
    originalWasm: original.wasmSha256, engineWasm: engine.wasmSha256,
    playerHandle: player, hornetHandle: hornet, contactSite, mutations, timeline };
}
const fixtures = [];
for (const angle of [0, Math.PI / 2, Math.PI, 2.150125503540039])
  fixtures.push(await fixture(`callback-facing-${angle}`, { angle }));
fixtures.push(await fixture('gate-in-range', { mode: 'gate', ticks: 3 }));
fixtures.push(await fixture('gate-retained-at-range', { mode: 'gate', distance: 500, ticks: 3 }));
fixtures.push(await fixture('gate-retained-out-of-range', { mode: 'gate', distance: 800, ticks: 3 }));
fixtures.push(await fixture('gate-target-invalidated', { mode: 'gate', distance: 1000, expectedSpawn: false }));
fixtures.push(await fixture('gate-no-target', { mode: 'gate', target: false, distance: 2000, expectedSpawn: false }));
fixtures.push(await fixture('gate-cooldown', { mode: 'gate', cooldown: 1000, expectedSpawn: false }));
fixtures.push(await fixture('gate-cooldown-one-ms-left', { mode: 'gate', cooldown: 51, expectedSpawn: false }));
fixtures.push(await fixture('gate-cooldown-exact-expiry', { mode: 'gate', cooldown: 50, ticks: 3 }));
fixtures.push(await fixture('lifetime', { angle: Math.PI / 2, ticks: 65 }));
fixtures.push(await fixture('hit', { angle: 0, hit: true, ticks: 25 }));
// Optional soak uses the unchanged production input sequence. It is separate
// from the controlled callback fixtures so a late population divergence is
// attributed to its first entity/field instead of being called a stinger error.
if (args.includes('--long-run')) {
 const original=await originalServer(),engine=await engineServer();
 for(const server of [original,engine]) server.init();
 let eventIndex=0;
 let firstDifference=null, mismatchedTicks=0;
 const timeline=[];
 for(let tick=1;tick<=1000;tick++) {
  while(eventIndex<goldenSends.length&&goldenSends[eventIndex].at<=tick*50) {
   const event=goldenSends[eventIndex++],packet=fromHex(event.dataHex);
   original.setClock(event.at);original.send(packet);engine.send(packet);
  }
  original.think(tick*50);engine.think();
  const a=original.entities(),b=engine.entities();
  // Use exactly the strict scenario gate on EVERY tick, including after the
  // first failure. A numeric-only early-exit loop missed type/kind changes.
  const diff=compareEntities(a,b,{tolerance});
  if(!diff.matched) {
   mismatchedTicks++;
   if(firstDifference===null) firstDifference={tick,at:tick*50,...diff};
  }
  timeline.push({tick,at:tick*50,matched:diff.matched,originalCount:a.size,engineCount:b.size,
   missing:diff.missing.length,extra:diff.extra.length,mismatchCount:diff.mismatchCount,
   maxPositionDelta:diff.maxPositionDelta,maxHealthDelta:diff.maxHealthDelta,
   maxAngleDelta:diff.maxAngleDelta,maxRadiusDelta:diff.maxRadiusDelta,
   maxVelocityDelta:diff.maxVelocityDelta,maxAccelerationDelta:diff.maxAccelerationDelta});
 }
 fixtures.push({name:'production-idle-1000-ticks',passed:firstDifference===null,ticks:timeline.length,
  scenario:goldenScenario,inputsReplayed:eventIndex,
  comparison:{tolerance,velocityTolerance:tolerance,ulpTolerance:2,identityFields:['type','kind'],finite:true},
  mismatchedTicks,firstDifference,timeline,
  originalWasm:original.wasmSha256,engineWasm:engine.wasmSha256});
}
const report={schema:3,engineWasmPath:path.relative(root,engineWasmPath),evidence:await evidence(),generatedAt:new Date().toISOString(),passed:fixtures.every(f=>f.passed),fixtures};
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,fixtures:fixtures.map(f=>({name:f.name,passed:f.passed,stinger:f.stinger,firstMismatch:f.firstDifference??f.timeline.find(t=>t.matched===false||t.playerMatch===false)}))},null,2));
if(!report.passed) process.exitCode=1;
