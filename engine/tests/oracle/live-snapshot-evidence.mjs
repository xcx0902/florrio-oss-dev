#!/usr/bin/env node
/** Live WASM wire evidence using the existing production decoder, without
 * rebuilding or modifying client code. Run after building engine wasm. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { OriginalBareSnapshotDecoder } from '../../../client/public/state/snapshot.js';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from '../../../client/public/state/field-types.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const wasmPath = option('--engine-wasm', 'client/public/server.wasm');
const wasm = await readFile(wasmPath);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
let memory;
const { instance } = await WebAssembly.instantiate(wasm, {
  env: { emscripten_notify_memory_growth() {} },
  wasi_snapshot_preview1: { fd_close: () => 0, fd_seek: () => 0,
    fd_write(fd, iovs, length, written) {
      new DataView(memory.buffer).setUint32(written, 0, true); return 0;
    } },
});
const api = instance.exports;
memory = api.memory;
const plans = DENSE_GROUPS.map(group => ({ offset: group.offset, specs: DENSE_GROUP_SPECS[group.offset] ?? [] }));
let decoder, merged, publications, tick;
function init() {
  api.sp_server_init(); decoder = new OriginalBareSnapshotDecoder(plans);
  merged = new Map(); publications = new Map(); tick = 0;
}
function send(bytes) {
  const pointer = api.malloc(bytes.length);
  new Uint8Array(memory.buffer).set(bytes, pointer);
  api.sp_server_send(pointer, bytes.length); api.free(pointer);
}
function snapshot() {
  ++tick;
  api.sp_server_think(); api.sp_server_flush();
  assert.equal(api.sp_server_output_count(), 1);
  const packet = new Uint8Array(memory.buffer, api.sp_server_output_data(0), api.sp_server_output_size(0));
  const decoded = decoder.decode(packet);
  assert.ok(decoded, 'production decoder must consume the complete native packet');
  for (const record of decoded.entities) {
    const fields = merged.get(record.handle) ?? {};
    Object.assign(fields, record.byteFields, record.floatFields, record.denseFields);
    for (const [ordinal, entries] of Object.entries(record.byteArrayFields ?? {})) {
      fields[ordinal] ??= Array(16).fill(0);
      for (const { index, value } of entries) fields[ordinal][index] = value;
    }
    for (const [ordinal, entries] of Object.entries(record.shortArrayFields ?? {})) {
      fields[ordinal] ??= Array(8).fill(0);
      for (const { index, value } of entries) fields[ordinal][index] = value;
    }
    const angle = record.denseFields?.[8] ?? (record.angleField8 === undefined ? undefined
      : Math.round(record.angleField8 * 65535 / (2 * Math.PI)));
    for (const [ordinal, value] of [[5, record.floatFields?.[5] ?? record.denseFields?.[5]],
      [24, record.floatFields?.[24] ?? record.denseFields?.[24]], [8, angle],
      [59, record.floatFields?.[59] ?? record.denseFields?.[59]]]) {
      if (value === undefined) continue;
      const key = `${record.handle}:${ordinal}`, rows = publications.get(key) ?? [];
      const previous = rows.at(-1);
      if (previous?.tick === tick) assert.ok(Object.is(previous.value, value));
      else {
        if (previous) assert.ok(!Object.is(previous.value, value), `unchanged field ${key} republished at tick ${tick}`);
        rows.push({ tick, value });
      }
      publications.set(key, rows);
    }
    merged.set(record.handle, fields);
  }
  for (const event of decoded.events.filter(event => event.opcode === 14)) {
    assert.equal(merged.get(event.handle)?.[26], 4, 'event 14 must refer to a real pickup, never a hit target');
  }
  return decoded;
}
const wire = raw => ((raw >>> 14) | (raw << 18)) >>> 0;
function field(records, ordinal, dense) {
  const row = records.find(record => (dense ? record.denseFields : record.byteFields)?.[ordinal] !== undefined);
  return (dense ? row?.denseFields : row?.byteFields)?.[ordinal];
}
function varuint(value) {
  const bytes = [];
  do { bytes.push((value & 127) | (value > 127 ? 128 : 0)); value >>>= 7; } while (value);
  return bytes;
}
const original = await readFile('web/sp_server.wasm');
// Input XOR key is read from the unchanged oracle's data segment by the
// established original-world helper, rather than duplicated in this probe.
const { createServerWorld } = await import('../../../test/helpers/server-world.mjs');
const oracle = await createServerWorld(false);
const key = Uint8Array.from(new Uint8Array(oracle.runtime.memory.buffer, 4576, 256));
const attack = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
const initial = attack.messages.filter(event => event.funcName === 'sp_server_send' && event.dataHex).slice(0, 2);
init();
for (const event of initial) { const packet = Buffer.from(event.dataHex, 'hex'); send(packet); oracle.send(packet); }
const originalView = new DataView(oracle.runtime.memory.buffer);
const u32 = address => originalView.getUint32(address, true);
const avatar = u32(u32(u32(u32(24936) + 120) + 100) + 200);
assert.ok(avatar);
let sequence = 100;
const directed = [];
for (const [buttons, angle] of [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [0, -1]]) {
  const floats = Buffer.alloc(8); floats.writeFloatLE(angle);
  const plain = [...varuint(sequence++), 12, ...varuint(buttons), ...floats];
  const packet = Uint8Array.from(plain, (byte, index) => byte ^ key[index & 255]);
  send(packet); oracle.send(packet);
  const records = snapshot().entities.filter(record => record.handle === wire(api.sp_server_player_handle()));
  const look = originalView.getUint8(avatar + 8), expression = originalView.getUint8(avatar + 10);
  assert.equal(look, angle === 1 ? 40 : 214);
  for (const dense of [false, true]) {
    if (dense && !records.some(record => record.denseFields)) continue;
    assert.equal(field(records, 2, dense), look, 'player look must match the original accepted input');
    assert.equal(field(records, 31, dense), expression, 'player expression must match the original');
    assert.equal(field(records, 26, dense), 1, 'permanent domain kind remains player');
  }
  directed.push({ buttons, angle, originalLook: look, originalExpression: expression,
    sparseLook: field(records, 2, false), denseLook: field(records, 2, true),
    sparseExpression: field(records, 31, false), denseExpression: field(records, 31, true) });
}

// Replay actual garden input timing through the browser probe's 2880 ms mark.
const garden = JSON.parse(await readFile('tests/parity/golden/garden-idle/server.json', 'utf8'));
const sends = garden.messages.filter(event => event.funcName === 'sp_server_send' && event.dataHex);
init();
let next = 0, last;
for (let at = 50; at <= 2900; at += 50) {
  while (next < sends.length && sends[next].at <= Math.min(at, 2880)) send(Buffer.from(sends[next++].dataHex, 'hex'));
  last = snapshot();
}
const player = last.entities.filter(record => record.handle === wire(api.sp_server_player_handle()));
assert.equal(field(player, 2, false), 148);
if (player.some(record => record.denseFields)) assert.equal(field(player, 2, true), 148);
const playerWire = wire(api.sp_server_player_handle());
const inventory = merged.get(playerWire)[60], recharge = merged.get(playerWire)[61];
assert.deepEqual(inventory, [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
assert.deepEqual(recharge, Array(8).fill(65535));
const scorePublications = publications.get(`${playerWire}:59`);
assert.deepEqual(scorePublications.map(row => row.value), [0, 3]);
const bee = last.entities.filter(record => record.handle === 30896449);
assert.ok(bee.length, 'dead Bee remains in the authoritative corpse window');
assert.equal(field(bee, 38, false), 1, 'death lifecycle flag must be published while the Bee is retained');
assert.equal(bee.find(record => record.healthKnown)?.health, 0);
const petals = new Map();
for (const record of last.entities) {
  const fields = petals.get(record.handle) ?? {};
  Object.assign(fields, record.byteFields, record.denseFields); petals.set(record.handle, fields);
}
const equipped = [...petals].filter(([, fields]) => fields[26] === 3 && fields[12] === 0)
  .map(([handle, fields]) => ({ handle, species: fields[2], slot: fields[11], instance: fields[12],
    radius: merged.get(handle)?.[7] }))
  .sort((a, b) => a.slot - b.slot);
assert.deepEqual(equipped.map(entity => entity.slot), [0, 1, 2, 3, 4]);
assert.ok(equipped.every(entity => entity.species === 1));
assert.ok(equipped.every(entity => entity.radius === 10));
const gardenEvidence = structuredClone({ inputsThrough: 2880, snapshotTickAt: 2900,
  playerLook: field(player, 2, false), beeWire: 30896449, beeLifecycle: field(bee, 38, false),
  equipped, inventory, recharge, scorePublications,
  cameraXPublications: publications.get(`${playerWire}:5`),
  cameraYPublications: publications.get(`${playerWire}:24`),
  beeAnglePublications: publications.get('30896449:8') });
// Real accepted discard commands must publish explicit zero slots, including
// when their representative petal entities disappear before the next packet.
for (let slot = 0; slot < 5; ++slot) {
  const plain = [...varuint(100000 + slot), 8, slot, 1];
  send(Uint8Array.from(plain, (byte, index) => byte ^ key[index & 255]));
}
const cleared = snapshot();
assert.deepEqual(merged.get(playerWire)[60], Array(16).fill(0));
assert.ok(cleared.entities.some(record => record.handle === playerWire && record.byteArrayFields?.[60]?.length === 16));
const unchanged = snapshot();
assert.ok(!unchanged.entities.some(record => record.handle === playerWire && record.byteArrayFields?.[60]));
console.log(JSON.stringify({ passed: true, generatedAt: new Date().toISOString(),
  engineWasmPath: wasmPath, engineWasm: sha256(wasm), originalWasm: sha256(original),
  decoder: 'client/public/state/snapshot.js (existing production decoder; no rebuild)',
  directed, garden: gardenEvidence, discard: { inventory: merged.get(playerWire)[60],
    unchangedInventoryOmitted: true },
  originalSources: { lookExpression: 'input.mjs:698-723',
    deathFlag: 'damage.mjs:451-453', field38: 'simulation-tick.mjs:9391-9434',
    event11: 'damage.mjs:107-149', event14: 'simulation-tick.mjs:898-1128 (pickup/slot transfer)' },
}, null, 2));
