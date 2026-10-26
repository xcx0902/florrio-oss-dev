#!/usr/bin/env node
/** Diagnostic only: preserve original 390 body and route its call sites
 * through a logging import. Frozen WAT/wasm files are never modified. The
 * normal strict state gate still runs against the unmodified shipped wasm. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import wabtFactory from 'wabt';
const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const wasmPath = option('--engine-wasm', 'engine/build-wasm/r04-boot-server.wasm');
const scenario = option('--scenario', 'garden-idle'), ticks = Number(option('--ticks', '305'));
const watchedTick = Number(option('--watch-tick', '303'));
const oracleOnly = process.argv.includes('--oracle-only');
const source = await readFile('source/wasm/sp_server.wat', 'utf8');
const wrapped = source.replace('(func $function_390 (type $t60)', '(func $original_390 (type $t60)')
  .replace('  (import "a" "a"', '  (import "trace" "contact" (func $function_390 (type $t60)))\n  (import "a" "a"')
  .replace('  (export "o"', '  (export "original390" (func $original_390))\n  (export "o"');
const wabt = await wabtFactory(), parsed = wabt.parseWat('contact-trace.wat', wrapped);
parsed.resolveNames(); parsed.validate(); const binary = parsed.toBinary({}).buffer; parsed.destroy();
let oracle, clock = 0, seed = 0x6f6c6446, originalContacts = [], collecting = false;
const view = () => new DataView(oracle.exports.o.buffer);
const u32 = address => view().getUint32(address, true);
const f32 = address => view().getFloat32(address, true);
function bridge(address, signature, argumentsPointer) {
  if (address === 22600 || address === 22639) return 0;
  if (address === 22791) return 1;
  if (address === 22855) return clock;
  if (address === 22903) return view().getFloat64(argumentsPointer, true) % view().getFloat64(argumentsPointer + 8, true);
  throw new Error(`unhandled bridge ${address}`);
}
function body(entity) {
  const transform = u32(entity + 168), physics = u32(entity + 188);
  const health = u32(entity + 164), loadout = u32(entity + 200);
  return { handle: u32(entity + 16), x: f32(transform + 20), y: f32(transform + 16),
    worldX: view().getFloat64(transform + 88, true), worldY: view().getFloat64(transform + 96, true),
    dirty: view().getUint8(transform + 80), radius: f32(physics + 8),
    health: health ? f32(health + 8) : null, maxHealth: health ? f32(health + 12) : null,
    level: loadout ? view().getUint8(loadout + 148) : null,
    vx: view().getFloat64(transform + 40, true), vy: view().getFloat64(transform + 48, true),
    physicsFlags: [...new Uint8Array(oracle.exports.o.buffer, physics + 48, 4)] };
}
const imports = { a: { a: bridge, b: bridge, c() {}, d() {},
  e() { throw new Error('OOM'); }, f() { throw new Error('abort'); }, g: () => 0,
  h: pointer => { view().setUint32(pointer, 0, true); return 0; },
  i: (count, size) => { view().setUint32(count, 0, true); view().setUint32(size, 0, true); return 0; },
  j: (fd, vectors, count, written) => { view().setUint32(written, 0, true); return 0; },
  k: () => 0, l() {}, m: (target, start, length) => new Uint8Array(oracle.exports.o.buffer).copyWithin(target, start, start + length),
  n: (pointer, length) => { const bytes = new Uint8Array(oracle.exports.o.buffer);
    for (let i = 0; i < length; ++i) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; bytes[pointer + i] = seed & 255; } return 0; },
}, trace: { contact: (...args) => {
  let row;
  if (collecting && (u32(args[1] + 16) & 16383) < (u32(args[2] + 16) & 16383)) {
    row = { a: body(args[1]), b: body(args[2]),
      sameOwnerRoot: !!view().getUint8(u32(args[0])) };
    originalContacts.push(row);
  }
  oracle.exports.original390(...args);
  if (row) row.afterFirstResponse = { a: body(args[1]), b: body(args[2]) };
} } };
oracle = (await WebAssembly.instantiate(binary, imports)).instance;
oracle.exports.p(); oracle.exports.u(0, 0);
const engineBytes = oracleOnly ? null : await readFile(wasmPath); let memory;
const { instance } = oracleOnly ? { instance: null } : await WebAssembly.instantiate(engineBytes, { env: { emscripten_notify_memory_growth() {} },
  wasi_snapshot_preview1: { fd_close: () => 0, fd_seek: () => 0, fd_write(fd, vectors, count, written) {
    new DataView(memory.buffer).setUint32(written, 0, true); return 0;
  } } });
const native = instance?.exports; memory = native?.memory; native?.sp_server_init();
const inputs = JSON.parse(await readFile(`tests/parity/golden/${scenario}/server.json`, 'utf8')).messages
  .filter(row => row.funcName === 'sp_server_send' && row.dataHex);
let next = 0, firstOrderDifference = null; const watched = [], differences = [];
function send(bytes) {
  let p = oracle.exports.q(bytes.length); new Uint8Array(oracle.exports.o.buffer).set(bytes, p); oracle.exports.w(p, bytes.length); oracle.exports.r(p);
  if (native) { p = native.malloc(bytes.length); new Uint8Array(memory.buffer).set(bytes, p); native.sp_server_send(p, bytes.length); native.free(p); }
}
for (let tick = 1; tick <= ticks; ++tick) {
  clock = tick * 50;
  while (next < inputs.length && inputs[next].at <= clock) send(Buffer.from(inputs[next++].dataHex, 'hex'));
  originalContacts = []; collecting = tick >= watchedTick - 1 && tick <= watchedTick + 1 || !oracleOnly;
  native?.sp_server_debug_record_all_contacts(1);
  if (tick === watchedTick && process.argv.includes('--all-pairs-at-watch')) native?.sp_server_debug_set_contact_order(7);
  oracle.exports.v(); oracle.exports.t(0, 0); native?.sp_server_think(); native?.sp_server_flush(); collecting = false;
  const nativeContacts = [];
  const field = (i, f) => native.sp_server_debug_contact_field(i, f);
  for (let i = 0; i < (native?.sp_server_debug_contact_count() ?? 0); ++i)
    nativeContacts.push({ a: { handle: (field(i, 1) | (field(i, 12) << 16)) >>> 0, x: field(i, 5), y: field(i, 6) },
      b: { handle: (field(i, 0) | (field(i, 11) << 16)) >>> 0, x: field(i, 3), y: field(i, 4) } });
  const pair = row => `${row?.a.handle}:${row?.b.handle}`;
  let first = -1;
  for (let i = 0; !oracleOnly && i < Math.max(originalContacts.length, nativeContacts.length); ++i)
    if (pair(originalContacts[i]) !== pair(nativeContacts[i])) { first = i; break; }
  if (first >= 0) {
    const row = { tick, index: first, originalCount: originalContacts.length, nativeCount: nativeContacts.length,
      original: originalContacts.slice(Math.max(0, first - 2), first + 4), native: nativeContacts.slice(Math.max(0, first - 2), first + 4) };
    firstOrderDifference ??= row;
    if (differences.length < 6) differences.push(row);
  }
  if (tick >= watchedTick - 1 && tick <= watchedTick + 1) watched.push({ tick, originalContacts, nativeContacts });
}
const report = { diagnostic: true, engineWasm: engineBytes && createHash('sha256').update(engineBytes).digest('hex'), scenario, ticks,
  firstOrderDifference, differences, watched };
await writeFile(option('--out', 'engine/build-native/r04-contact-order.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ scenario, ticks, firstOrderDifference: firstOrderDifference && {
  tick: firstOrderDifference.tick, index: firstOrderDifference.index,
  originalCount: firstOrderDifference.originalCount, nativeCount: firstOrderDifference.nativeCount,
  original: firstOrderDifference.original.map(row => [row.a.handle, row.b.handle]),
  native: firstOrderDifference.native.map(row => [row.a.handle, row.b.handle]),
} }));
