#!/usr/bin/env node
/** Read-only original wasm evidence for loadout/radius/angle replication. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';

const server = await createServerWorld(false, { functionIds: [43, 94] });
const golden = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
for (const event of golden.messages.filter(event => event.funcName === 'sp_server_send' && event.dataHex).slice(0, 2))
  server.send(Buffer.from(event.dataHex, 'hex'));
const view = new DataView(server.runtime.memory.buffer);
const u32 = address => view.getUint32(address, true);
const entity = u32(u32(u32(24936) + 120) + 100), loadout = u32(entity + 200);
const inventory = () => Array.from({ length: 16 }, (_, i) => view.getUint8(loadout + 20 + i));
const recharge = () => Array.from({ length: 8 }, (_, i) => view.getUint16(loadout + 100 + 2 * i, true));
server.advance();
assert.deepEqual(inventory(), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
assert.deepEqual(recharge(), Array(8).fill(65535));
const initial = { inventory: inventory(), recharge: recharge(), petals: Array.from({ length: 5 }, (_, slot) => {
  const petal = u32(loadout + 296 + 36 * slot);
  return { slot, radius: view.getFloat32(u32(petal + 188) + 8, true) };
}) };
assert.ok(initial.petals.every(petal => petal.radius === 10));
const scratch = server.runtime.call(16, 8);
const transform = u32(entity + 168), angles = [];
for (const angle of [1, 0, 0.00005, -1, Math.PI, -Math.PI, 2 * Math.PI, -0.00005].map(Math.fround)) {
  view.setFloat64(scratch, angle, true);
  server.runtime.call(94, transform + 8, scratch);
  const packet = 8555152;
  assert.equal(u32(packet + 4), 2);
  const encoded = view.getUint16(u32(packet + 12) || packet + 16, true);
  let remainder = angle % (2 * Math.PI);
  if (remainder < 0) remainder += 2 * Math.PI;
  const expected = Math.trunc(remainder * 10430.219195527361) & 65535;
  assert.equal(encoded, expected);
  angles.push({ angle, encoded });
}
view.setBigUint64(scratch, 0n, true);
const petal = u32(loadout + 296), health = u32(petal + 164);
server.runtime.call(43, health, 0, view.getFloat32(health + 8, true), scratch);
const cooldown = [];
for (let elapsed = 0; elapsed <= 2500; elapsed += 50) {
  if (elapsed > 0) server.advance();
  if (![0, 50, 1250, 2450, 2500].includes(elapsed)) continue;
  const row = { elapsed, progress: recharge()[0], elapsedTimer: view.getFloat32(loadout + 608, true),
    handlePresent: u32(loadout + 296) !== 0, inventory: inventory()[0] };
  const expected = elapsed === 0 || elapsed === 2500 ? 65535 : Math.trunc(Math.fround(Math.fround(elapsed * 65535) / 2500));
  assert.equal(row.progress, expected);
  assert.equal(row.inventory, 1);
  assert.equal(row.handlePresent, elapsed === 0 || elapsed === 2500);
  cooldown.push(row);
}
server.runtime.call(14, scratch);
console.log(JSON.stringify({ passed: true, generatedAt: new Date().toISOString(),
  originalWasm: createHash('sha256').update(await readFile('web/sp_server.wasm')).digest('hex'),
  method: 'Unmodified original wasm with additional exports; original funcs 43/94 and real ticks.',
  initial, angles, cooldown,
  sources: { field7: 'simulation-tick.mjs:7735-7773 (entity+188, component+8)',
    basicInitializer: 'petals.mjs:37 (func433 radius10)',
    field60: 'simulation-tick.mjs:10516-10590 (loadout+20, sixteen bytes)',
    field61: 'simulation-tick.mjs:10591-10665 (loadout+100, eight u16)',
    recharge: 'simulation-tick.mjs:4234-4376 (minimum per-instance elapsed progress)',
    angle: 'transforms.mjs:129-157, simulation-tick.mjs:7780-7833 (truncate shipped f64 scale)' },
}, null, 2));
