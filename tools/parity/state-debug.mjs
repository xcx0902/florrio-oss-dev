#!/usr/bin/env node
/**
 * Per-entity state debugger for the semantic trace diff.
 *
 * Replays the golden `sp_server_send` inputs against the shipped
 * `sp_server.wasm` and the C++ engine wasm, then prints the per-tick state of
 * one or more handles on both sides. Used by R01/R06 to find the first tick and
 * the first field that diverges.
 *
 * Usage:
 *   node tools/parity/state-debug.mjs --scenario boot-menu --handle 1174093855
 *   node tools/parity/state-debug.mjs --scenario garden-idle --type 4 --ticks 10
 *   node tools/parity/state-debug.mjs --scenario boot-menu --handle 1174093855 --physics
 *   node tools/parity/state-debug.mjs --scenario boot-menu --handle 1174093855 --initial
 *
 * `--physics` adds physics flags 48-51, mass, contact damage, +93/+95 and the
 * link/predecessor dump; `--initial` prints the original server's AI+52 and
 * transform angle for the watched handles before the first tick.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const root = path.resolve('.');
const scenarioName = option('--scenario', 'boot-menu');
const maxTicks = Number(option('--ticks', '8'));
const handles = args.filter((value, index) => index > 0 && args[index - 1] === '--handle').map(Number);
const typeFilter = args.filter((value, index) => index > 0 && args[index - 1] === '--type').map(Number);
const seed0 = 0x6f6c6446;
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
    outgoing.push({ final, length: bytes.length, hex: bytes.length && bytes.length <= 8192 ? hex(bytes) : null });
  }
  ({ instance } = await WebAssembly.instantiate(wasm, imports));
  memory = Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
  instance.exports.p();
  return {
    exports: instance.exports,
    get memory() { return memory; },
    setClock(value) { clock = value; },
    flush() { outgoing = []; instance.exports.t(0, 0); return outgoing.splice(0); },
    init() { clock = 0; instance.exports.u(0, 0); return outgoing.splice(0); },
    send(bytes) {
      const pointer = instance.exports.q(bytes.length);
      new Uint8Array(memory.buffer).set(bytes, pointer);
      instance.exports.w(pointer, bytes.length);
      instance.exports.r(pointer);
    },
    think(at) { clock = at; instance.exports.v(); return this.flush(); },
  };
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
    const u8 = pointer => view.getUint8(pointer >>> 0);
    entities.set(handle, {
      handle,
      x: transform ? f32(transform + 20) : 0,
      y: transform ? f32(transform + 16) : 0,
      angle: transform ? Math.fround(f64(transform + 8)) : 0,
      radius: physics ? f32(physics + 8) : 0,
      health: health ? f32(health + 8) : 0,
      maxHealth: health ? f32(health + 12) : 0,
      vx: transform ? f64(transform + 40) : 0,
      vy: transform ? f64(transform + 48) : 0,
      ax: transform ? f64(transform + 56) : 0,
      ay: transform ? f64(transform + 64) : 0,
      angularVelocity: transform ? f64(transform + 72) : 0,
      c88: transform ? f64(transform + 88) : 0,
      c96: transform ? f64(transform + 96) : 0,
      worldDirty: transform ? u8(transform + 80) : 0,
      transform,
      ai: u32(entity + 104),
      entityFlags: u8(entity + 93),
      worldFlags: u8(entity + 95),
      physicsFlags: physics ? [u8(physics + 48), u8(physics + 49), u8(physics + 50), u8(physics + 51)] : null,
      mass: physics ? f32(physics + 40) : 0,
      contactDamage: physics ? f32(physics + 44) : 0,
      physics,
      link: u32(entity + 212),
      predecessor: u32(entity + 212) ? u32(u32(entity + 212) + 8) : 0,
      linkedChildren: u32(entity + 212) ? u32(u32(entity + 212) + 16) : 0,
    });
    node = u32(node + 8);
  }
  return entities;
}

async function createEngine() {
  const bytes = await readFile(path.join(root, 'client/public/server.wasm'));
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
    init() { exports.sp_server_init(); },
    send(bytes) {
      const pointer = exports.malloc(bytes.length);
      new Uint8Array(memory.buffer).set(bytes, pointer);
      exports.sp_server_send(pointer, bytes.length);
      exports.free(pointer);
    },
    think() { exports.sp_server_think(); exports.sp_server_flush(); },
    setContactTarget(handle) { exports.sp_server_debug_set_contact_target(handle); },
    recordAllContacts(enable) { exports.sp_server_debug_record_all_contacts(enable ? 1 : 0); },
    contacts() {
      const count = exports.sp_server_debug_contact_count();
      const entries = [];
      for (let index = 0; index < count; index++) {
        entries.push({
          other: exports.sp_server_debug_contact_field(index, 1)
            + exports.sp_server_debug_contact_field(index, 12) * 65536,
          target: exports.sp_server_debug_contact_field(index, 0)
            + exports.sp_server_debug_contact_field(index, 11) * 65536,
          sequence: exports.sp_server_debug_contact_field(index, 13),
          overlap: exports.sp_server_debug_contact_field(index, 2),
          tx0: exports.sp_server_debug_contact_field(index, 3),
          ty0: exports.sp_server_debug_contact_field(index, 4),
          ox0: exports.sp_server_debug_contact_field(index, 5),
          oy0: exports.sp_server_debug_contact_field(index, 6),
          tx1: exports.sp_server_debug_contact_field(index, 7),
          ty1: exports.sp_server_debug_contact_field(index, 8),
          ox1: exports.sp_server_debug_contact_field(index, 9),
          oy1: exports.sp_server_debug_contact_field(index, 10),
        });
      }
      return entries;
    },
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
    field(handle, field) { return exports.sp_server_debug_entity_field(handle, field); },
    rng() { return exports.sp_server_debug_rng(); },
  };
}

const browser = JSON.parse(await readFile(path.join(root, 'tests/parity/golden', scenarioName, 'server.json'), 'utf8'));
const sends = browser.messages
  .filter(message => message.funcName === 'sp_server_send' && message.dataHex)
  .map((message, index) => ({ at: message.at, order: index, bytes: fromHex(message.dataHex) }));
const server = await createServer();
server.init();
if (args.includes('--initial')) {
  const view = new DataView(server.memory.buffer);
  const u32 = pointer => view.getUint32(pointer >>> 0, true);
  const f32 = pointer => view.getFloat32(pointer >>> 0, true);
  let node = u32(25092);
  const seen = new Set();
  while (node && !seen.has(node)) {
    seen.add(node);
    const entity = node - 20;
    const handle = u32(entity + 16);
    const ai = u32(entity + 104);
    const transform = u32(entity + 168);
    if (handles.length && !handles.includes(handle)) { node = u32(node + 8); continue; }
    if (ai) console.log(`initial ${handle} type=${u32(entity + 92) & 0xFFFF} aiAngle=${f32(ai + 52).toFixed(9)} angle(f64)=${view.getFloat64(transform + 8, true).toFixed(9)}`);
    node = u32(node + 8);
  }
}
const engine = await createEngine();
engine.init();
const maxTime = browser.messages.length ? Math.max(...browser.messages.map(message => message.at), 0) : 0;
const lastTick = Math.floor(maxTime / 50) * 50;
let eventIndex = 0;
const watched = new Set(handles);
const rows = [];
const readAi = (server, pointer) => {
  if (!pointer) return null;
  const view = new DataView(server.memory.buffer);
  const base = pointer;
  const f64 = offset => view.getFloat64(base + offset, true);
  const f32 = offset => view.getFloat32(base + offset, true);
  const u8 = offset => view.getUint8(base + offset);
  return {
    currentAngle: f32(52), idleSpeed: f32(72), waveEnabled: u8(76), waveFrequency: f32(80),
    wavePower: f32(84), sineEnabled: u8(88), sineFrequency: f32(92), sineAmplitude: f32(96),
    timerDeadline: f64(40), clockMs: f64(24), attackRange: f32(128), attackSpeed: f32(132),
    chase: u8(110), aggressive: u8(108), target: view.getUint32(base + 152, true),
  };
};
for (let at = 50; at <= lastTick; at += 50) {
  while (eventIndex < sends.length && sends[eventIndex].at <= at) {
    const event = sends[eventIndex++];
    server.setClock(event.at);
    server.send(event.bytes);
    engine.send(event.bytes);
  }
  server.think(at);
  if (args.includes('--all-contacts')) engine.recordAllContacts(true);
  else if (watched.size) engine.setContactTarget([...watched][0]);
  engine.think();
  const original = originalEntities(server);
  const candidate = engine.stateEntities();
  if (!watched.size) {
    for (const [handle, value] of candidate)
      if (!typeFilter.length || typeFilter.includes(value.type)) watched.add(handle);
  }
  const originalRng = new DataView(server.memory.buffer).getUint32(8573024, true);
  rows.push({ at, original, candidate, server, contacts: engine.contacts(), originalRng, candidateRng: engine.rng() });
  if (rows.length >= maxTicks) break;
}
const format = value => (value === undefined ? '  -  ' : value.toFixed(5).padStart(11));
for (const row of rows) {
  console.log(`rng ${row.at}: original ${row.originalRng} candidate ${row.candidateRng}` +
    (row.originalRng === row.candidateRng ? '' : '  MISMATCH'));
}
if (args.includes('--overlaps')) {
  // List the original's overlapping bodies for the watched handles, using the
  // previous tick's final positions (the state the tick starts from).
  for (const handle of watched) {
    console.log(`\noverlaps for ${handle}`);
    for (let index = 1; index < rows.length; index++) {
      const previous = rows[index - 1].original;
      const self = previous.get(handle);
      if (!self) continue;
      const hits = [];
      for (const [other, value] of previous) {
        if (other === handle) continue;
        const dx = value.x - self.x, dy = value.y - self.y;
        const reach = self.radius + value.radius;
        const distance = Math.hypot(dx, dy);
        if (distance < reach) hits.push({ other, distance, overlap: reach - distance,
          nx: dx / distance, ny: dy / distance, radius: value.radius });
      }
      hits.sort((a, b) => b.overlap - a.overlap);
      const next = rows[index].original.get(handle);
      console.log(`  tick ${rows[index].at}: start ${self.x.toFixed(3)},${self.y.toFixed(3)} -> end ${next?.x.toFixed(3)},${next?.y.toFixed(3)} delta ${(next.x - self.x).toFixed(3)},${(next.y - self.y).toFixed(3)}`);
      for (const hit of hits.slice(0, 8))
        console.log(`    other ${hit.other} r=${hit.radius} dist=${hit.distance.toFixed(3)} overlap=${hit.overlap.toFixed(3)} n=(${hit.nx.toFixed(3)},${hit.ny.toFixed(3)})`);
    }
  }
}
for (const handle of watched) {
  console.log(`\nhandle ${handle}`);
  console.log('  at   side        x           y          vx          vy          ax          ay       angle      c88         c96');
  for (const row of rows) {
    const o = row.original.get(handle);
    if (!o) continue;
    const ai = readAi(row.server, o.ai);
    console.log(`  ${String(row.at).padStart(4)} originalAI ${ai ? [ai.currentAngle, ai.idleSpeed, ai.waveFrequency, ai.sineAmplitude].map(v => v.toFixed(9).padStart(14)).join(' ') : '-'}  wave=${ai?.waveEnabled} sine=${ai?.sineEnabled} deadline=${ai?.timerDeadline?.toFixed(2)} clock=${ai?.clockMs?.toFixed(2)}`);
  }
  for (const row of rows) {
    const o = row.original.get(handle);
    const c = row.candidate.get(handle);
    if (!o && !c) continue;
    const fields = value => value === undefined ? [] : [value.x, value.y, value.vx, value.vy, value.ax, value.ay, value.angle];
    console.log(`  ${String(row.at).padStart(4)} original ${fields(o).map(format).join(' ')}  c88=${o?.c88?.toFixed(4)} c96=${o?.c96?.toFixed(4)} t=0x${o?.transform?.toString(16)}`);
    if (args.includes('--physics') && o)
      console.log(`${' '.repeat(7)}  phys48..51=${o.physicsFlags?.join(',') ?? '-'} mass=${o.mass?.toFixed(3)} dmg=${o.contactDamage?.toFixed(3)} flags93=0x${o.entityFlags?.toString(16)} flags95=0x${o.worldFlags?.toString(16)} dirty=${o.worldDirty} link=0x${o.link?.toString(16)} pred=0x${o.predecessor?.toString(16)} children=${o.linkedChildren}`);
    console.log(`  ${String(row.at).padStart(4)} candidate${fields(c).map(format).join(' ')}  type=${c?.type ?? '-'} aiAngle=${engine.field(handle, 10).toFixed(6)} aiIdle=${engine.field(handle, 11).toFixed(4)} pred=${engine.field(handle,27)} turn=${engine.field(handle,32)} clock=${engine.field(handle,30)} sineF=${engine.field(handle,28)} sineA=${engine.field(handle,29)}`);
    for (const contact of row.contacts ?? [])
      console.log(`        #${contact.sequence} contact target=${contact.target} other=${contact.other} overlap=${contact.overlap.toFixed(3)} target ${contact.tx0.toFixed(2)},${contact.ty0.toFixed(2)} -> ${contact.tx1.toFixed(2)},${contact.ty1.toFixed(2)} | other ${contact.ox0.toFixed(2)},${contact.oy0.toFixed(2)} -> ${contact.ox1.toFixed(2)},${contact.oy1.toFixed(2)}`);
  }
}
