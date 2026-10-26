#!/usr/bin/env node
/** Source-grounded arithmetic probes against the shipped, unmodified server. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';

const server = await createServerWorld(false, { functionIds: [145, 215] });
const golden = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
for (const event of golden.messages.filter(event => event.funcName === 'sp_server_send' && event.dataHex).slice(0, 2))
  server.send(Buffer.from(event.dataHex, 'hex'));
const view = new DataView(server.runtime.memory.buffer);
const u32 = address => view.getUint32(address, true);
const f32 = address => view.getFloat32(address, true);
const entity = u32(u32(u32(24936) + 120) + 100);
const profile = u32(entity + 200), health = u32(entity + 164);
const read = () => ({ level: view.getUint8(profile + 148), experience: f32(profile + 280),
  score: f32(profile + 16), health: f32(health + 8), maxHealth: f32(health + 12) });
const initial = read(), rewards = [];
for (const amount of [3, 3, 10, 100]) {
  const before = read();
  server.runtime.call(215, profile, amount);
  const after = read();
  const factor = Math.fround((after.level - 1) * (1 / 44));
  const maximum = Math.fround(Math.fround(Math.min(factor, 1) * 50) + 100);
  assert.equal(after.maxHealth, maximum);
  let expectedHealth = before.health, previousMaximum = before.maxHealth;
  for (let level = before.level + 1; level <= after.level; level++) {
    const nextMaximum = Math.fround(Math.fround(Math.min(Math.fround((level - 1) / 44), 1) * 50) + 100);
    expectedHealth = Math.fround(Math.fround(nextMaximum * expectedHealth) / previousMaximum);
    previousMaximum = nextMaximum;
  }
  assert.equal(after.health, expectedHealth);
  rewards.push({ amount, before, after });
}
view.setFloat32(health + 8, 90, true);
view.setUint8(profile + 148, 2);
server.runtime.call(145, profile);
const proportional = read();
assert.equal(proportional.maxHealth, 101.13636016845703);
const capped = [];
for (const level of [1, 2, 44, 45, 99]) {
  view.setUint8(profile + 148, level); view.setFloat32(health + 8, 100, true);
  view.setFloat32(health + 12, 100, true);
  server.runtime.call(145, profile);
  capped.push(read());
}
view.setUint8(profile + 148, 98); view.setFloat32(profile + 280, 0, true);
server.runtime.call(215, profile, 1e8);
assert.equal(read().level, 99);
// The garden head whose child first exceeded the strict position budget.
// Original 654 stores the unwrapped sum to f32 at AI+52 before remainder.
const head = (() => { let node = u32(25092); while (node) {
  const candidate = node - 20;
  if (u32(candidate + 16) === 3572024024) return candidate;
  node = u32(node + 8);
} throw new Error('centipede head missing'); })();
const ai = u32(head + 104), initialAngle = f32(ai + 52), turn = f32(ai + 60);
const signedTurn = view.getUint8(ai + 48) ? turn : -turn;
const unwrapped = Math.fround(initialAngle + Math.fround(signedTurn * 50) * .001);
let expected = unwrapped % (2 * Math.PI);
if (expected < -Math.PI) expected += 2 * Math.PI;
if (expected > Math.PI) expected -= 2 * Math.PI;
expected = Math.fround(expected);
server.advance();
const actual = f32(ai + 52);
assert.equal(actual, expected);
console.log(JSON.stringify({ passed: true, initial, rewards, proportional, capped,
  centipede: { handle: 3572024024, initialAngle, signedTurn, unwrapped, expected, actual },
  levelCap: 99, originalWasm: createHash('sha256').update(await readFile('web/sp_server.wasm')).digest('hex'),
  sources: { ai: 'simulation-tick.mjs:1989-2003', progression: 'sp_server.wat:49945-51244 (215)',
    maxHealth: 'sp_server.wat:30293-30832 (145)' } }, null, 2));
