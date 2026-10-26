#!/usr/bin/env node
/** Original player-field evidence; never edits the oracle or golden inputs.
 * node engine/tests/oracle/player-wire-evidence.mjs > /tmp/player-wire.json
 * The memory fields inspected here are those read by original writeEntityDelta.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const server = await createServerWorld(false);
const golden = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
for (const event of golden.messages.filter(message => message.funcName === 'sp_server_send'
  && message.dataHex).slice(0, 2)) server.send(Buffer.from(event.dataHex, 'hex'));
const view = new DataView(server.runtime.memory.buffer);
const u32 = address => view.getUint32(address, true);
const control = u32(u32(24936) + 120), entity = u32(control + 100);
assert.ok(entity > 0);
const profile = u32(entity + 200);
assert.ok(profile > 0);
function varuint(value) {
  const bytes = [];
  do { bytes.push((value & 127) | (value > 127 ? 128 : 0)); value >>>= 7; } while (value);
  return bytes;
}
const rows = [];
let sequence = 100;
for (const buttons of [0, 1, 2, 3, 4, 5, 0, 0x10000000]) {
  const floats = Buffer.alloc(8);
  floats.writeFloatLE(1, 0); // one radian -> original packed look byte 40
  const decoded = [...varuint(sequence++), 12, ...varuint(buttons), ...floats];
  const key = new Uint8Array(server.runtime.memory.buffer, 4576, 256);
  server.send(Uint8Array.from(decoded, (byte, index) => byte ^ key[index & 255]));
  const pickup = u32(entity + 100), effects = u32(entity + 192);
  const row = { buttons, storedButtons: u32(control + 276),
    field2Look: view.getUint8(profile + 8), field26Model: view.getUint8(profile + 9),
    field31Expression: view.getUint8(profile + 10),
    field14Effects: effects ? view.getUint8(effects + 8) : null,
    field22ComponentPresent: pickup !== 0, field22: pickup ? view.getUint8(pickup + 8) : null };
  assert.equal(row.storedButtons, buttons);
  assert.equal(row.field2Look, 40);
  assert.equal(row.field31Expression & 3, buttons & 3);
  assert.equal(row.field22ComponentPresent, false);
  rows.push(row);
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), passed: true,
  originalWasm: sha256(await readFile('web/sp_server.wasm')),
  inputSource: sha256(await readFile('source/game/server/input.mjs')),
  method: 'Unmodified original wasm with extra exports; real input packets; inspect fields used by original snapshot sender.',
  sources: {
    input: 'source/game/server/input.mjs:698-723',
    field2: 'source/game/server/simulation-tick.mjs:7429',
    field14: 'source/game/server/simulation-tick.mjs:8108',
    field22: 'source/game/server/simulation-tick.mjs:8509',
    field26: 'source/game/server/simulation-tick.mjs:8751',
    field31: 'source/game/server/simulation-tick.mjs:8990',
    clientConstructors: 'source/wasm/client.wat:92127 (670 -> entity+52), 125636 (756 -> entity+144)',
    renderer: 'source/game/client/entity-renderer.mjs:745-812',
    interpolation: 'source/game/client/entity-snapshot.mjs:208-218',
  }, rows }, null, 2));
