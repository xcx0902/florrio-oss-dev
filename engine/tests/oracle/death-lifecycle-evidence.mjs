#!/usr/bin/env node
/** Additional exports expose unmodified original instructions, in memory only.
 * No original artifact, reference capture, or existing oracle is rewritten. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';

const original = await readFile('web/sp_server.wasm');
const sha256 = createHash('sha256').update(original).digest('hex');
assert.equal(sha256, '75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d');
const server = await createServerWorld(false, { functionIds: [43, 145] });
const golden = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
for (const event of golden.messages.filter(event => event.funcName === 'sp_server_send' && event.dataHex).slice(0, 2))
  server.send(Buffer.from(event.dataHex, 'hex'));
const view = new DataView(server.runtime.memory.buffer), bytes = new Uint8Array(view.buffer);
const u32 = address => view.getUint32(address, true), f32 = address => view.getFloat32(address, true);
const peer = u32(u32(24936) + 120), body = u32(peer + 100);
const avatar = u32(body + 200), health = u32(body + 164), loot = u32(body + 204);
const options = server.runtime.call(16, 4);
view.setUint32(options, 0, true);
const baseline = server.capture();
const cases = [];
const spawn = () => server.send(Uint8Array.from([0, 6, ...Buffer.from('reborn'), 0],
  (value, index) => value ^ bytes[4576 + index]));
for (const level of [1, 14, 15, 30, 45, 99]) {
  server.restore(baseline);
  bytes[avatar + 148] = level;
  view.setFloat32(avatar + 280, 2.5, true);
  view.setFloat32(avatar + 16, 1234.5, true);
  server.runtime.call(145, avatar);
  const carried = [1, 2, 6, 7, 8, 9, 10, 12, 15, 18, 19, 22, 25, 29, 34, 36];
  bytes.set(carried, avatar + 20);
  // Explicit fixture RNG: game rolls 47, independent rarity shuffle 1.
  view.setUint32(8573024, 47, true);
  view.setUint32(8573028, 1, true);
  bytes[8569380] = 1;
  server.runtime.call(43, health, 0, f32(health + 8), options);
  const death = {
    level: bytes[peer + 97], rememberedLevel: bytes[peer + 8], score: f32(peer + 84),
    experience: f32(avatar + 280), deadline: view.getFloat64(health + 48, true),
    survivors: Array.from(bytes.slice(peer + 28, peer + 28 + bytes[peer + 96])),
    drops: Array.from(bytes.slice(loot + 9, loot + 9 + bytes[loot + 8])),
    carried: Array.from(bytes.slice(avatar + 20, avatar + 36)),
  };
  assert.equal(death.rememberedLevel, Math.floor(level * 3 / 4));
  assert.equal(death.level, level);
  assert.equal(death.score, 1234.5);
  assert.equal(death.experience, 2.5);
  assert.equal(death.deadline, 2000);
  assert.deepEqual(death.carried, carried, 'corpse keeps its carried loadout');
  for (let step = 0; step < 19; ++step) server.advance();
  assert.equal(u32(peer + 100), body, 'corpse is still controlled at death+950ms');
  server.advance();
  assert.equal(u32(peer + 100), 0, 'corpse is removed at death+1000ms');
  spawn();
  assert.equal(u32(peer + 100), 0, 'spawn cooldown still blocks at death+1000ms');
  assert.equal(f32(peer + 288), 1500);
  for (let step = 0; step < 29; ++step) server.advance();
  spawn();
  assert.equal(u32(peer + 100), 0, 'spawn cooldown still blocks at death+2450ms');
  assert.equal(f32(peer + 288), 50);
  server.advance(); spawn();
  const nextBody = u32(peer + 100), nextAvatar = u32(nextBody + 200);
  assert.ok(nextBody && nextAvatar, 'real opcode 6 creates the next body');
  const respawn = { level: bytes[nextAvatar + 148], experience: f32(nextAvatar + 280),
    score: f32(nextAvatar + 16), slots: Array.from(bytes.slice(nextAvatar + 20, nextAvatar + 36)) };
  assert.equal(respawn.level, Math.max(1, death.rememberedLevel));
  assert.equal(respawn.experience, 0);
  assert.deepEqual(respawn.slots.slice(0, death.survivors.length), death.survivors);
  assert.equal(bytes[peer + 96], 0, 'spawn consumes controller survivors');
  cases.push({ level, gameSeed: 47, shuffleSeed: 1, death, respawn });
}
// Keep one original independent shuffle stream across real deaths/respawns.
// Reset only gameplay RNG to isolate the independent stream's progression.
server.restore(baseline);
view.setUint32(8573028, 1, true); bytes[8569380] = 1;
const sequential = [];
for (let life = 0; life < 3; ++life) {
  const current = u32(peer + 100), avatar = u32(current + 200), health = u32(current + 164), loot = u32(current + 204);
  bytes[avatar + 148] = 45; server.runtime.call(145, avatar);
  bytes.set([1, 2, 6, 7, 8, 9, 10, 12, 15, 18, 19, 22, 25, 29, 34, 36], avatar + 20);
  view.setUint32(8573024, 47, true);
  const before = u32(8573028);
  server.runtime.call(43, health, 0, f32(health + 8), options);
  sequential.push({ life, before, after: u32(8573028),
    survivors: Array.from(bytes.slice(peer + 28, peer + 28 + bytes[peer + 96])),
    drops: Array.from(bytes.slice(loot + 9, loot + 9 + bytes[loot + 8])) });
  for (let step = 0; step < 50; ++step) server.advance();
  spawn(); assert.ok(u32(peer + 100), 'next original life after 2500ms');
}
const report = { originalWasmSha256: sha256, fixture: 'real boot/join; explicit carried slots and RNG; native 43/145 and opcode 6', cases, sequential };
const output = process.argv.indexOf('--out');
if (output >= 0) await writeFile(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
