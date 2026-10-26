#!/usr/bin/env node
/** Replay actual production Worker requests through the live ABI and decoder.
 * --delivery DIR supplies an existing compiled client; this test never builds
 * or edits it. --requests FILE is the captured Worker request JSON.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const delivery = path.resolve(option('--delivery', 'client/public'));
const requestsPath = option('--requests');
assert.ok(requestsPath, '--requests FILE is required');
const importFile = file => import(pathToFileURL(path.join(delivery, file)));
const [{ OriginalBareSnapshotDecoder }, { WorldState }, { DENSE_GROUPS, DENSE_GROUP_SPECS }, { PACKET_XOR_KEY }] = await Promise.all([
  importFile('state/snapshot.js'), importFile('state/world.js'), importFile('state/field-types.js'), importFile('schema/packet-key.js'),
]);
const wasm = await readFile(option('--engine-wasm', 'client/public/server.wasm'));
let memory;
const { instance } = await WebAssembly.instantiate(wasm, {
  env: { emscripten_notify_memory_growth() {} },
  wasi_snapshot_preview1: { fd_close: () => 0, fd_seek: () => 0,
    fd_write: (fd, vectors, count, written) => { new DataView(memory.buffer).setUint32(written, 0, true); return 0; } },
});
const e = instance.exports; memory = e.memory;
const decoder = new OriginalBareSnapshotDecoder(DENSE_GROUPS.map(group => ({ offset: group.offset, specs: DENSE_GROUP_SPECS[group.offset] ?? [] })));
const world = new WorldState();
function state() {
  const count = e.sp_server_state_dump(0, 0), size = e.sp_server_state_record_size();
  const pointer = e.malloc(count * size), written = e.sp_server_state_dump(pointer, count);
  const view = new DataView(memory.buffer), petals = [];
  for (let i = 0; i < written; i++) if (view.getUint8(pointer + i * size + 6) === 3)
    { const raw = view.getUint32(pointer + i * size, true);
      petals.push(((raw << 18) | (raw >>> 14)) >>> 0); }
  e.free(pointer);
  return { count: written, petals: petals.sort((a, b) => a - b), decodedCount: world.count,
    decodedPetals: [...world.all()].filter(entity => entity.kind === 3)
      .map(entity => ({ handle: entity.handle, slot: entity.byteFields?.[11] })).sort((a, b) => a.handle - b.handle) };
}
const { requests } = JSON.parse(await readFile(requestsPath, 'utf8'));
const observations = []; let flushes = 0;
for (const request of requests) {
  if (request.funcName === 'sp_server_send') {
    const decoded = request.bytes.map((byte, i) => byte ^ PACKET_XOR_KEY[i & 255]);
    let cursor = 0; const readVar = () => { let value = 0, shift = 0; while (cursor < decoded.length) {
      const byte = decoded[cursor++]; value |= (byte & 127) << shift;
      if (!(byte & 128)) return value >>> 0; shift += 7;
    } return value >>> 0; };
    readVar(); const opcode = readVar(), before = [8, 10].includes(opcode) ? state() : null;
    const pointer = e.malloc(request.bytes.length); new Uint8Array(memory.buffer).set(request.bytes, pointer);
    e.sp_server_send(pointer, request.bytes.length); e.free(pointer);
    if (before) observations.push({ at: request.at, opcode, payload: decoded.slice(cursor), before, afterSend: state() });
  } else if (request.funcName === 'sp_server_flush') {
    e.sp_server_flush();
    for (let i = 0; i < e.sp_server_output_count(); i++) {
      const bytes = new Uint8Array(memory.buffer, e.sp_server_output_data(i), e.sp_server_output_size(i)).slice();
      const snapshot = decoder.decode(bytes); assert.ok(snapshot, 'production snapshot rejected');
      world.applyPartial(snapshot, request.at); ++flushes;
      const current = state();
      assert.deepEqual(current.decodedPetals.map(entity => entity.handle), current.petals, `petal handles at ${request.at}`);
      if (observations.length && !observations.at(-1).nextFlush)
        observations.at(-1).nextFlush = { at: request.at, deletes: snapshot.deletedHandles, state: current };
    }
  } else if (request.funcName === 'sp_server_init') e.sp_server_init();
  else if (request.funcName === 'sp_server_think') e.sp_server_think();
}
const discard = observations.find(row => row.opcode === 8), swap = observations.find(row => row.opcode === 10);
assert.ok(discard && swap, 'capture must contain a real discard followed by a swap');
const removed = discard.before.petals.filter(handle => !discard.afterSend.petals.includes(handle));
assert.equal(removed.length, 1); assert.deepEqual(discard.nextFlush.deletes, removed);
assert.equal(swap.nextFlush.state.decodedPetals.filter(entity => entity.slot === swap.payload[2]).length, 1);
const report = { passed: true, engineWasm: createHash('sha256').update(wasm).digest('hex'),
  requestsSha256: createHash('sha256').update(await readFile(requestsPath)).digest('hex'), flushes, observations, final: state() };
await writeFile(option('--out', 'engine/build-native/r04-production-discard-replay.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: true, engineWasm: report.engineWasm, flushes, removed,
  discardAt: discard.at, swapAt: swap.at, finalPetals: report.final.petals.length }));
