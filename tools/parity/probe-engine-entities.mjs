#!/usr/bin/env node
/**
 * Dump the C++ engine entity table after init (or after N ticks).
 *
 * Usage:
 *   node tools/parity/probe-engine-entities.mjs --limit 40
 *   node tools/parity/probe-engine-entities.mjs --kind 0 --limit 40
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const root = path.resolve('.');
const limit = Number(option('--limit', '40'));
const kindFilter = args.includes('--kind') ? Number(option('--kind', '-1')) : -1;
const typeFilter = args.includes('--type') ? Number(option('--type', '-1')) : -1;
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
exports.sp_server_init();
const size = exports.sp_server_state_record_size();
const count = exports.sp_server_state_dump(0, 0);
const pointer = exports.malloc(count * size);
const written = exports.sp_server_state_dump(pointer, count);
const view = new DataView(memory.buffer);
const rows = [];
for (let index = 0; index < written; index++) {
  const offset = pointer + index * size;
  const row = {
    handle: view.getUint32(offset, true),
    type: view.getUint16(offset + 4, true),
    kind: view.getUint8(offset + 6),
    x: view.getFloat32(offset + 8, true),
    y: view.getFloat32(offset + 12, true),
    angle: view.getFloat32(offset + 16, true),
    radius: view.getFloat32(offset + 20, true),
    health: view.getFloat32(offset + 24, true),
  };
  if (kindFilter >= 0 && row.kind !== kindFilter) continue;
  if (typeFilter >= 0 && row.type !== typeFilter) continue;
  rows.push(row);
}
exports.free(pointer);
const kinds = new Map();
for (let index = 0; index < written; index++) {
  const offset = pointer + index * size;
  const kind = view.getUint8(offset + 6);
  const type = view.getUint16(offset + 4, true);
  const key = `${kind}/${type}`;
  kinds.set(key, (kinds.get(key) ?? 0) + 1);
}
console.log(`entities ${written}`);
console.log('kind/type counts:', [...kinds.entries()].map(([key, value]) => `${key}:${value}`).join(' '));
for (const row of rows.slice(0, limit)) {
  console.log(`  slot ${row.handle & 16383} handle ${row.handle} type ${row.type} kind ${row.kind} ` +
    `pos ${row.x.toFixed(1)},${row.y.toFixed(1)} r ${row.radius} hp ${row.health}`);
}
