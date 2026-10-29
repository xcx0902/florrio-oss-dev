#!/usr/bin/env node
/** Isolated original43 lethal-damage replay. Extra exports leave original
 * instructions unchanged; no original assets or recorded goldens are edited. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';

const server = await createServerWorld(false, { functionIds: [17, 43, 144, 404] });
const golden = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
for (const event of golden.messages.filter(row => row.funcName === 'sp_server_send' && row.dataHex).slice(0, 2))
  server.send(Buffer.from(event.dataHex, 'hex'));
// Let the original match initialize its damage-enabled state normally.
server.advance();
const view = new DataView(server.runtime.memory.buffer);
const u32 = p => view.getUint32(p, true), f32 = p => view.getFloat32(p, true);
const player = u32(u32(u32(24936) + 120) + 100);
assert.ok(player, 'real original player joined');
function position(entity, x) {
  const transform = u32(entity + 168);
  view.setFloat32(transform + 20, x, true); view.setFloat32(transform + 16, 0, true);
  view.setUint8(transform + 80, 0); server.runtime.call(17, transform);
}
position(player, 750); view.setUint32(8573024, 787621659, true);
const head = server.runtime.call(144, 22928 + 1936, 17, 0, 0, -1), segments = [head];
while (u32(u32(segments.at(-1) + 212) + 16)) {
  const link = u32(segments.at(-1) + 212);
  segments.push(u32(u32(link + 24) || link + 28));
}
assert.equal(segments.length, 10);
for (const segment of segments) {
  position(segment, 0);
  assert.equal(view.getUint8(u32(segment + 212) + 76), 0, 'centipede links split rather than inherit a predecessor');
}
position(player, 100);
const options = server.runtime.call(16, 4); view.setUint32(options, 0, true);
server.runtime.call(43, u32(head + 164), player, 1, options);
for (const segment of segments) assert.equal(u32(u32(segment + 104) + 152), player);
position(player, 750);
const beforeDeath = server.capture();
// A middle death also splits immediately. Ownership is independent and is
// intentionally left attached until entity removal, as original404 specifies.
server.runtime.call(43, u32(segments[3] + 164), player, f32(u32(segments[3] + 164) + 8), options);
assert.equal(u32(u32(segments[3] + 212) + 4), 0);
assert.equal(u32(u32(segments[4] + 212) + 4), 0);
assert.equal(u32(segments[4] + 236), segments[3]);
server.runtime.call(404, segments[3]);
assert.equal(u32(u32(segments[4] + 212) + 4), 0, 'removal never reconnects the split tail');
assert.equal(u32(segments[4] + 236), segments[2], 'ordinary ownership is reparented at removal');
assert.equal(u32(segments[2] + 72), segments[4] + 44, 'reparented child joins the owner list');
server.restore(beforeDeath);
server.runtime.call(43, u32(head + 164), player, f32(u32(head + 164) + 8), options);
const promoted = segments[1], ai = u32(promoted + 104), transform = u32(promoted + 168);
assert.equal(u32(u32(promoted + 212) + 4), 0, 'next head is detached at lethal damage, not corpse expiry');
assert.equal(u32(promoted + 236), head);
for (let index = segments.length; index-- > 2;) server.runtime.call(404, segments[index]);
const rows = [];
let previous = 0;
for (let step = 1; step <= 22; step++) {
  server.advance();
  const row = { step, x: f32(transform + 20), y: f32(transform + 16),
    vx: view.getFloat64(transform + 40, true), vy: view.getFloat64(transform + 48, true),
    activity: view.getUint8(ai + 8), corpse: view.getInt32(head + 20, true) !== 25076 };
  assert.equal(u32(ai + 152), player, `target at tick ${step}`);
  assert.equal(row.activity & 1, 1, `chase at tick ${step}`);
  assert.ok(row.x > previous && row.vx > 0, `forward motion at tick ${step}`);
  assert.equal(row.corpse, step < 20, `corpse at tick ${step}`);
  previous = row.x; rows.push(row);
}
const nativeIndex = process.argv.indexOf('--native');
if (nativeIndex >= 0) {
  const actual = execFileSync(process.argv[nativeIndex + 1], ['--pursuit-trace'], { encoding: 'utf8' })
    .trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(actual, rows, 'every movement/AI/corpse frame matches original WASM');
}
console.log(JSON.stringify({ passed: true, source: 'original43 → 424 → 267, original654 movement',
  fixture: 'lethal head and middle damage; independent ownership; 22 ticks across corpse expiry', rows }, null, 2));
