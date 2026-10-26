#!/usr/bin/env node
/** Original viewer gate versus the live engine ABI; no client changes. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';
import { OriginalBareSnapshotDecoder } from '../../../client/public/state/snapshot.js';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from '../../../client/public/state/field-types.js';
const index = process.argv.indexOf('--engine-wasm');
const wasmPath = index < 0 ? 'client/public/server.wasm' : process.argv[index + 1];
const bytes = await readFile(wasmPath);
const original = await createServerWorld(false);
let memory;
const { instance } = await WebAssembly.instantiate(bytes, {
  env: { emscripten_notify_memory_growth() {} },
  wasi_snapshot_preview1: { fd_close: () => 0, fd_seek: () => 0,
    fd_write(fd, vectors, count, written) { new DataView(memory.buffer).setUint32(written, 0, true); return 0; } },
});
const api = instance.exports; memory = api.memory; api.sp_server_init();
const decoder = new OriginalBareSnapshotDecoder(DENSE_GROUPS.map(group => ({
  offset: group.offset, specs: DENSE_GROUP_SPECS[group.offset] ?? [],
})));
const rows = [];
// Fresh worker flushes before the first simulation tick carry no payload.
for (let i = 0; i < 3; ++i) {
  api.sp_server_flush(); assert.equal(api.sp_server_output_count(), 0);
  original.runtime.call(657, 0, 0);
  assert.equal(original.outgoing.filter(row => row[0] === 'data').length, 0);
}
function advance() {
  original.advance(); api.sp_server_think(); api.sp_server_flush();
  const v = new DataView(original.runtime.memory.buffer), u32 = address => v.getUint32(address, true);
  const viewer = u32(u32(24936) + 120);
  const packet = decoder.decode(new Uint8Array(memory.buffer, api.sp_server_output_data(0), api.sp_server_output_size(0)));
  assert.ok(packet);
  const row = { tick: rows.length + 1, originalBodyCount: u32(24400),
    originalControlledBody: u32(viewer + 100), originalSpatialQuery: v.getUint8(25066),
    engineSimulatedEntities: api.sp_server_entity_count(), engineUpdates: packet.entities.length,
    engineEvents: packet.events.length, engineDeletes: packet.deletedHandles.length };
  rows.push(row); original.outgoing.length = 0;
  return row;
}
for (let i = 0; i < 3; ++i) {
  const row = advance();
  assert.equal(row.originalBodyCount, 866); assert.equal(row.originalControlledBody, 0);
  assert.equal(row.originalSpatialQuery, 0); assert.equal(row.engineSimulatedEntities, 866);
  assert.equal(row.engineUpdates, 0); assert.equal(row.engineEvents, 0); assert.equal(row.engineDeletes, 0);
}
const golden = JSON.parse(await readFile('tests/parity/golden/garden-idle/server.json', 'utf8'));
for (const event of golden.messages.filter(row => row.funcName === 'sp_server_send' && row.dataHex).slice(0, 2)) {
  const packet = Buffer.from(event.dataHex, 'hex'); original.send(packet);
  const pointer = api.malloc(packet.length); new Uint8Array(memory.buffer).set(packet, pointer);
  api.sp_server_send(pointer, packet.length); api.free(pointer);
}
const spawned = advance();
assert.ok(spawned.originalControlledBody); assert.equal(spawned.originalSpatialQuery, 1);
assert.ok(spawned.engineUpdates > 866); assert.equal(api.sp_server_player_valid(), 1);
console.log(JSON.stringify({ passed: true, engineWasm: createHash('sha256').update(bytes).digest('hex'),
  source: 'simulation-tick.mjs:5897-5959 (viewer+100 gates spatial query)', rows }, null, 2));
