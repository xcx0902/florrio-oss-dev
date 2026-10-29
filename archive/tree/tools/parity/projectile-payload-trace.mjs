#!/usr/bin/env node
/** Compare focused C++ projectile frames to the immutable shipped WASM. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';
import { createServerWorld } from '../../test/helpers/server-world.mjs';

const native = process.argv[2] ?? '/private/tmp/florr-projectiles-build/engine_projectile_tests';
const actual = JSON.parse(execFileSync(native, ['--trace'], { encoding: 'utf8' }));
const expected = [];
for (const [type, callback] of [[10, 671], [19, 686], [20, 689], [29, 733], [30, 733]]) {
  let now = 0, runtime;
  runtime = await loadOriginal('sp_server', {
    functionIds: [16, 144, 397, callback],
    imports: { a: { a(code, signature, args) {
      if (code === 22855) return now;
      if (code === 22903) { const view = new DataView(runtime.memory.buffer); return view.getFloat64(args, true) % view.getFloat64(args + 8, true); }
      return 0;
    } } },
  });
  runtime.exports.u(0, 0);
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer);
  const word = (a, n) => view.setUint32(a, n, true), u32 = a => view.getUint32(a, true);
  const f32 = a => view.getFloat32(a, true), f64 = a => view.getFloat64(a, true);
  const allocate = n => { const p = runtime.call(16, n); bytes.fill(0, p, p + n); return p; };
  const owner = runtime.call(144, 24864, 1, 0, 0, -1), loadout = allocate(744), context = allocate(12), output = allocate(8);
  word(owner + 200, loadout); word(loadout, owner); bytes[loadout + 20] = type;
  runtime.call(397, loadout, 0, 0);
  const petal = u32(loadout + 296), transform = u32(petal + 168), health = u32(petal + 164), behavior = u32(u32(petal + 124) + 20);
  word(context, petal); word(context + 4, loadout);
  const baseline = Buffer.from(bytes), stack = runtime.stackPointer.value;
  for (let buttons = 0; buttons < 4; ++buttons)
    for (const time of [500, 500.001, 550])
      for (const [x, y] of [[0, 0], [3, 4], [-3, -4], [1, 7]]) {
        bytes.set(baseline); runtime.stackPointer.value = stack; now = time;
        bytes[loadout + 10] = buttons;
        view.setFloat32(transform + 20, x, true); view.setFloat32(transform + 16, y, true); bytes[transform + 80] = 0;
        view.setFloat64(transform + 40, 0.25, true); view.setFloat64(transform + 48, -0.125, true);
        view.setFloat64(transform + 56, 0.125, true); view.setFloat64(transform + 64, -0.25, true);
        word(8573024, 123456789);
        runtime.call(callback, output, behavior, context);
        const row = { type, buttons, now, x, y, released: u32(loadout + 296) === 0,
          vx: f64(transform + 40), vy: f64(transform + 48), ax: f64(transform + 56), ay: f64(transform + 64),
          angle: Math.fround(f64(transform + 8)), life: f32(health + 24) };
        assert.deepEqual(actual[expected.length], row, `callback ${callback}: ${JSON.stringify({ buttons, now, x, y })}`);
        expected.push(row);
      }
}
assert.equal(actual.length, expected.length);
const actualLifecycle = JSON.parse(execFileSync(native, ['--lifecycle'], { encoding: 'utf8' }));
const golden = JSON.parse(await readFile('tests/parity/golden/attack/server.json', 'utf8'));
const lifecycle = [];
for (const type of [10, 11, 12, 19, 20, 29, 30, 34]) {
  const server = await createServerWorld(false, { functionIds: [125, 213, 397] });
  for (const event of golden.messages.filter(row => row.funcName === 'sp_server_send' && row.dataHex).slice(0, 2))
    server.send(Buffer.from(event.dataHex, 'hex'));
  const view = new DataView(server.runtime.memory.buffer), u32 = a => view.getUint32(a, true);
  const controller = u32(u32(24936) + 120), owner = u32(controller + 100), loadout = u32(owner + 200);
  for (let slot = 0; slot < 8; ++slot) server.runtime.call(125, loadout, slot, slot === 0 ? type : 0);
  for (let instance = 0; instance < (type === 19 || type === 30 ? 3 : 1); ++instance)
    server.runtime.call(397, loadout, 0, instance);
  view.setUint32(controller + 276, 1, true);
  const scratch = server.runtime.call(16, 4);
  view.setUint32(scratch, view.getUint8(loadout + 10) | 1, true);
  server.runtime.call(213, loadout + 10, scratch); server.runtime.call(14, scratch);
  const frames = [];
  for (let now = 50; now <= 5000; now += 50) {
    server.advance();
    frames.push({ now, equipped: u32(loadout + 296) !== 0, progress: view.getUint16(loadout + 100, true) });
  }
  assert.deepEqual(actualLifecycle.find(row => row.type === type), { type, frames }, `${type}: all release/recharge frames`);
  lifecycle.push({ type, frames });
}
const actualSplit = JSON.parse(execFileSync(native, ['--split'], { encoding: 'utf8' }));
let splitChildren = 0;
const originalMasks = [];
for (const [type, callback] of [[11, 676], [12, 681], [34, 431], [29, 733]]) {
  const runtime = await loadOriginal('sp_server', { functionIds: [16, 43, 144, 272, 393, 397, 729, 730, 732, callback],
    imports: { a: { a: code => code === 22855 ? 550 : 0 } } });
  runtime.exports.u(0, 0);
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer);
  const u32 = a => view.getUint32(a, true), f32 = a => view.getFloat32(a, true), f64 = a => view.getFloat64(a, true);
  const word = (a, n) => view.setUint32(a, n, true);
  const allocate = n => { const p = runtime.call(16, n); bytes.fill(0, p, p + n); return p; };
  const owner = runtime.call(144, 24864, 1, 0, 0, -1), loadout = allocate(744), context = allocate(12), output = allocate(8);
  word(owner + 200, loadout); word(loadout, owner); bytes[loadout + 20] = type; bytes[loadout + 10] = 1;
  runtime.call(397, loadout, 0, 0);
  const petal = u32(loadout + 296), transform = u32(petal + 168), behavior = u32(u32(petal + 124) + 20);
  bytes[behavior + 8] = 1; view.setFloat64(behavior + 16, 0, true);
  word(context, petal); word(context + 4, loadout);
  view.setFloat32(transform + 20, 300, true); view.setFloat32(transform + 16, 400, true); bytes[transform + 80] = 0;
  const baseline = Buffer.from(bytes), stack = runtime.stackPointer.value;
  if (type === 29) {
    // Native virtual slot6 is reached by damage(43), not by collision slot4.
    const free = u32(22928 + 2152);
    const options = allocate(4); view.setUint16(options, 1, true);
    runtime.call(43, u32(petal + 164), 0, f32(u32(petal + 164) + 8), options);
    assert.equal(u32(22928 + 2152), free, 'unlaunched Web death creates no ground entity');
    bytes.set(baseline); runtime.stackPointer.value = stack;
    runtime.call(callback, output, behavior, context);
    const tag = u32(22928 + 2152) - 20;
    const deathOptions = allocate(4); view.setUint16(deathOptions, 1, true);
    runtime.call(43, u32(petal + 164), 0, f32(u32(petal + 164) + 8), deathOptions);
    const physics = u32(tag + 188), health = u32(tag + 164), area = u32(tag + 208);
    assert.equal(f32(physics + 8), 50); assert.equal(view.getUint8(physics + 50), 1);
    assert.equal(f32(health + 8), 5); assert.equal(f32(health + 12), 5); assert.equal(f32(health + 24), 12000);
    assert.ok(u32(tag + 140)); assert.equal(u32(tag + 124), 0);
    assert.equal(f32(u32(tag + 168) + 20), 300); assert.equal(f32(u32(tag + 168) + 16), 400);
    const payload = u32(area + 8), vtable = u32(payload);
    assert.equal(vtable, 6508, 'ground Web installs the shared slow implementation');
    assert.equal(runtime.call(730, payload), Infinity);
    assert.equal(runtime.call(729, payload), 0.25);
    const writer = allocate(4120); runtime.call(393, tag, 0, 1, writer, 1);
    const mask = u32((u32(writer + 12) || writer + 16)); assert.equal(mask, 0x03184800);
    originalMasks.push({ type, mask: '0x' + mask.toString(16).padStart(8, '0') });
    continue;
  }
  for (const seed of [1, 123456789, 2147483646]) {
    bytes.set(baseline); runtime.stackPointer.value = stack; word(8573024, seed);
    runtime.call(callback, output, behavior, context);
    const deferred = u32(u32(24848) - 4), closure = u32(deferred + 16);
    assert.equal(f64(deferred + 32), 551); assert.equal(view.getUint8(closure + 8), 4);
    runtime.call(272, closure);
    for (let index = 0; index < 4; ++index) {
      const child = u32(closure + 12 + index * 12), t = u32(child + 168), h = u32(child + 164);
      const row = { type, seed, index, x: f32(t + 20), y: f32(t + 16), flags: view.getUint8(u32(child + 116) + 8),
        health: f32(h + 8), life: f32(h + 24), vx: f64(t + 40), vy: f64(t + 48), ax: f64(t + 56), ay: f64(t + 64) };
      assert.deepEqual(actualSplit[splitChildren++], row, `split ${type}, seed ${seed}, child ${index}`);
      const writer = allocate(4120); runtime.call(393, child, 0, 1, writer, 1);
      const mask = u32(u32(writer + 12) || writer + 16); assert.equal(mask, 0x03184050);
      if (seed === 1 && index === 0) originalMasks.push({ type, mask: '0x' + mask.toString(16).padStart(8, '0'), field9: row.flags });
    }
  }
}
assert.equal(actualSplit.length, splitChildren);
console.log(JSON.stringify({ passed: true, callbackFrames: expected.length,
  lifecycleFrames: lifecycle.reduce((n, row) => n + row.frames.length, 0), splitChildren, originalMasks,
  originalWasm: createHash('sha256').update(await readFile('web/sp_server.wasm')).digest('hex'),
  scope: 'Exact native/original callback velocity, acceleration, f32 orientation and lifetime; every 50ms tick of equipped state and recharge wire progress for eight projectile types. No pixel or whole-world equivalence claim.' }));
