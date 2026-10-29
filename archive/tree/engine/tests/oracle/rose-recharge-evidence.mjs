#!/usr/bin/env node
/** Exact callback comparison against the retained, unmodified server WASM. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadOriginal } from '../../../test/helpers/wasm-probe.mjs';
import { createServerWorld } from '../../../test/helpers/server-world.mjs';

const native = process.argv[2] ?? 'build/engine/engine_rose_tests';
const actual = JSON.parse(execFileSync(native, ['--trace'], { encoding: 'utf8' }));
const traces = [];
for (const [type, callback] of [[6, 665], [15, 682], [24, 723]]) {
  let now = 0;
  const runtime = await loadOriginal('sp_server', {
    functionIds: [16, 144, 397, callback],
    imports: { a: { a: code => code === 22855 ? now : 0 } },
  });
  runtime.exports.u(0, 0);
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer);
  const word = (address, value) => view.setUint32(address, value, true);
  const u32 = address => view.getUint32(address, true);
  const f32 = address => view.getFloat32(address, true);
  const allocate = size => {
    const pointer = runtime.call(16, size);
    bytes.fill(0, pointer, pointer + size);
    return pointer;
  };
  // Use real world entity/component pools and original function 397. The
  // minimal flower/loadout records allow the original ownership and death
  // callbacks to run, including actual zero-health consumption.
  const owner = runtime.call(144, 22928 + 1936, 1, 1, 2, -1);
  const loadout = allocate(744), flower = allocate(292), context = allocate(12), output = allocate(8);
  word(owner + 200, loadout); word(loadout, owner); bytes[loadout + 20] = type;
  word(owner + 120, flower); word(flower, owner); word(flower + 100, owner); bytes[owner + 92] |= 32;
  const ownerHealth = u32(owner + 164), ownerTransform = u32(owner + 168);
  view.setFloat32(ownerHealth + 8, 50, true); view.setFloat32(ownerHealth + 12, 100, true);
  runtime.call(397, loadout, 0, 0);
  const petal = u32(loadout + 296), slot = u32(petal + 124), behavior = u32(slot + 20);
  const health = u32(petal + 164), transform = u32(petal + 168);
  view.setFloat32(transform + 20, 3, true); view.setFloat32(transform + 16, 4, true);
  bytes[transform + 80] = 0;
  view.setFloat32(ownerTransform + 20, 1, true); view.setFloat32(ownerTransform + 16, 2, true);
  bytes[ownerTransform + 80] = 0;
  word(context, petal); word(context + 4, loadout); view.setFloat32(context + 8, 50, true);
  const frames = [];
  for (now = 50; now <= 1450; now += 50) {
    runtime.call(callback, output, behavior, context);
    frames.push({ now, state: u32(behavior + 4), x: f32(transform + 20), y: f32(transform + 16),
      health: f32(health + 8), ownerHealth: f32(ownerHealth + 8) });
  }
  assert.equal(frames[19].state, 0, `${type}: strict 1000ms gate`);
  assert.equal(frames[20].state, 2, `${type}: first contraction frame`);
  assert.equal(frames.at(-1).health, 0, `${type}: original consumes all current health`);
  const trace = { type, frames };
  assert.deepEqual(actual.find(row => row.type === type), trace, `${type}: every callback frame matches original f32 bits`);
  traces.push(trace);
}
const actualLifecycle = JSON.parse(execFileSync(native, ['--lifecycle'], { encoding: 'utf8' }));
const golden = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
const lifecycles = [];
for (const type of [6, 15, 24]) {
  const server = await createServerWorld(false, { functionIds: [125, 397] });
  for (const event of golden.messages.filter(row => row.funcName === 'sp_server_send' && row.dataHex).slice(0, 2))
    server.send(Buffer.from(event.dataHex, 'hex'));
  const view = new DataView(server.runtime.memory.buffer);
  const u32 = address => view.getUint32(address, true), f32 = address => view.getFloat32(address, true);
  const owner = u32(u32(u32(24936) + 120) + 100), loadout = u32(owner + 200), health = u32(owner + 164);
  for (let slot = 1; slot < 5; ++slot) server.runtime.call(125, loadout, slot, 0);
  server.runtime.call(125, loadout, 0, type);
  const count = type === 24 ? 3 : 1;
  for (let instance = 0; instance < count; ++instance) server.runtime.call(397, loadout, 0, instance);
  view.setFloat32(health + 8, 50, true);
  const frames = [];
  for (let now = 50; now <= 10000; now += 50) {
    server.advance();
    let alive = 0;
    for (let instance = 0; instance < count; ++instance) {
      const petal = u32(loadout + 296 + instance * 12);
      if (petal && f32(u32(petal + 164) + 8) > 0) ++alive;
    }
    frames.push({ now, ownerHealth: f32(health + 8), alive, progress: view.getUint16(loadout + 100, true) });
  }
  assert.equal(frames[28].alive, 0, `${type}: first heal consumes all petals`);
  assert.equal(frames[98].alive, count, `${type}: original 3500ms recharge restores instances`);
  assert.equal(frames[127].alive, 0, `${type}: respawn can heal and consume again`);
  const lifecycle = { type, frames };
  assert.deepEqual(actualLifecycle.find(row => row.type === type), lifecycle,
    `${type}: every real tick matches healing, instance life and recharge wire progress`);
  lifecycles.push(lifecycle);
}
console.log(JSON.stringify({ passed: true, comparedFrames: traces.reduce((count, row) => count + row.frames.length, 0),
  comparedLifecycleFrames: lifecycles.reduce((count, row) => count + row.frames.length, 0),
  originalWasm: createHash('sha256').update(await readFile('web/sp_server.wasm')).digest('hex'),
  scope: 'Rose callback state, f32 contraction coordinates and consumption; 10 seconds of real ticks for each variant compare player health, living instance count and recharge wire progress. General world geometry and pixels are outside this isolated server test.',
  sources: { callbacks: 'sp_server func665/682/723', skipSpring: 'simulation-tick.mjs:4771-4773',
    consumption: 'petals.mjs:449-452', recharge: 'simulation-tick.mjs:4245-4333' }, traces, lifecycles }, null, 2));
