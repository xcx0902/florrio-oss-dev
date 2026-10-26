import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';
import { advanceSlotRecharge, playerSlotProgress } from '../public/state/loadout.js';
import { createHudState, drawHud } from '../public/render/hud.js';

const f = Math.fround;
const base = { health: 100, maxHealth: 100, level: 1, slots: [1, 1, 1, 1, 1] };

/** Execute the actual slot renderer, stopping after its state stores or wipe
 * arc. No copied smoothing formula serves as the native oracle. The host
 * exception avoids initializing unrelated label/art caches. Restore the WASM
 * stack because this deliberate early exit bypasses the function epilogue. */
async function nativeRecharge() {
  let runtime, captureArc = false, arc;
  const stop = new Error('slot state captured');
  const host = (code, signature, pointer) => {
    if (!runtime) return 0;
    if (code === 136878 && !captureArc) throw stop;
    if (code !== 137995) return 0;
    const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(runtime.memory.buffer), args = [];
    let cursor = pointer >>> 2;
    for (let type; type = bytes[signature++]; cursor++) {
      const double = type < 105;
      if (double && cursor & 1) cursor++;
      args.push(double ? view.getFloat64((cursor++ >> 1) * 8, true) : view.getInt32(cursor * 4, true));
    }
    arc = [...args.slice(1, -1), !!args.at(-1)];
    throw stop;
  };
  runtime = await loadOriginal('client', { functionIds: [368, 587, 818], imports: { a: { a: host, c: host } } });
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer);
  const alloc = size => { const address = runtime.call(368, size); bytes.fill(0, address, address + size); return address; };
  const color = alloc(4), renderer = alloc(112), label = alloc(184), reference = alloc(4);
  const player = alloc(176), visual = alloc(496);
  view.setInt32(color, -1, true);
  bytes[label] = 1; bytes[player + 168] = 1;
  view.setFloat32(visual + 24, 1, true);
  view.setInt32(visual + 464, -1, true);
  return (encoded, delta, { current, withArc = false, index = 0, level = 1 } = {}) => {
    runtime.call(818, renderer, color);
    view.setInt32(visual, index, true);
    bytes[player + 168] = level;
    if (current !== undefined) view.setFloat32(visual + 24, current, true);
    view.setUint16(player + 120 + index * 2, encoded, true);
    captureArc = withArc; arc = undefined;
    const stack = runtime.stackPointer.value;
    try { runtime.call(587, renderer, delta, 1, 70, label, reference, player, visual); }
    catch (error) { if (error !== stop) throw error; }
    finally { runtime.stackPointer.value = stack; }
    return { progress: view.getFloat32(visual + 24, true), arc };
  };
}

test('field61 targets and every retained recharge store agree with original WASM func587', async () => {
  const native = await nativeRecharge();
  let current = 1;
  for (let index = 0; index < 320; index++) {
    const encoded = [65535, 0, 13107, 19660, 19660, 20971, 65535, 32768][Math.floor(index / 40)];
    const delta = [16, 8, 24, 0, 33.333, 4.5, 100][index % 7];
    const target = playerSlotProgress({ shortArrayFields: { 61: [{ index: 0, value: encoded }] } })[0];
    current = advanceSlotRecharge(current, target, delta);
    assert.equal(current, native(encoded, delta).progress, `f32 state at frame ${index}`);
  }
  assert.equal(advanceSlotRecharge(0, 1, 0), 0);
  assert.equal(advanceSlotRecharge(0.8, 0.1, 0), f(0.1), 'a decrease snaps with zero delta');
  assert.equal(advanceSlotRecharge(f(1 - 2 ** -24), 1, 0), native(65535, 0, { current: 1 - 2 ** -24 }).progress,
    'the native near-target branch also runs with zero delta');
});

test('persistent HUD recharge advances unchanged targets once per frame and isolates slot lifetimes', () => {
  const hud = createHudState();
  let state = hud.update({ ...base, slotProgress: [1, 0.1, 0.2, 1, 1] }, 100, 16);
  assert.equal(state.slotProgress[1], f(0.1));
  assert.equal(state.slotProgress[2], f(0.2));
  const target = { ...base, slotProgress: [1, 0.5, 0.2, 1, 1] };
  state = hud.update(target, 116);
  const first = state.slotProgress[1];
  assert.ok(first > 0.1 && first < 0.5);
  assert.deepEqual(hud.update(target, 116, 16).slotProgress, state.slotProgress);
  assert.deepEqual(hud.update({ ...target, slots: [1, 6, 1, 1, 1] }, 116, 16).slotProgress, state.slotProgress,
    'replaying the frame cannot reset a slot lifetime');
  assert.deepEqual(hud.update(target, 110, 16).slotProgress, state.slotProgress);
  state = hud.update(target, 132);
  assert.equal(state.slotProgress[1], advanceSlotRecharge(first, 0.5, 16));
  assert.equal(state.slotProgress[2], f(0.2));
  state = hud.update({ ...target, slots: [1, 6, 1, 1, 1] }, 148, 16);
  assert.equal(state.slotProgress[1], f(0.5), 'a replacement visual starts at one and snaps to its field61 target');
  assert.equal(state.slotProgress[2], f(0.2));
  assert.equal(hud.update(base, 164, 16).slotProgress, undefined, 'missing field61 does not synthesize progress');
  hud.reset();
  assert.equal(hud.update(target, 180, 16).slotProgress[1], f(0.5));
  assert.equal(createHudState().update(target, 196, 16).slotProgress[1], f(0.5));
});

test('production HUD wipe angles match the original slot renderer across all recharge phases', async () => {
  const native = await nativeRecharge(), hud = createHudState();
  let now = 0;
  for (const encoded of [0, 13107, 19660, 19660, 20971, 32768, 0, 65535]) {
    now += 16;
    const expected = native(encoded, 16, { withArc: true });
    assert.ok(expected.arc, `native wipe exists for target ${encoded}`);
    const state = hud.update({ ...base, slotProgress: [encoded / 65535, 1, 1, 1, 1] }, now, 16);
    const arcs = [];
    const context = new Proxy({}, { get: (_, key) => key === 'arc' ? (...args) => arcs.push(args)
      : key === 'measureText' ? text => ({ width: text.length * 7 }) : () => {} });
    drawHud(context, state);
    const actual = arcs.find(args => args[0] === 0 && args[1] === -5 && args[2] === 140);
    assert.deepEqual(actual, expected.arc, `complete wipe arc for target ${encoded}`);
  }
});

test('the recharge sector disappears at the original WASM cutoff and returns on a decrease', async () => {
  const native = await nativeRecharge();
  const sector = args => args?.[0] === 0 && args[1] === -5 && args[2] === 140;
  for (const current of [0.9999, 0.99999, 0.999995, 1]) {
    const expected = native(65535, 0, { current, withArc: true });
    const arcs = [];
    const context = new Proxy({}, { get: (_, key) => key === 'arc' ? (...args) => arcs.push(args)
      : key === 'measureText' ? text => ({ width: text.length * 7 }) : () => {} });
    drawHud(context, { ...base, slotProgress: [expected.progress, 1, 1, 1, 1] });
    assert.equal(arcs.some(sector), sector(expected.arc), `native cutoff at ${current}`);
  }
  assert.equal(native(0, 0, { withArc: true }).progress, 0, 'completion does not prevent an immediate reset');
});
