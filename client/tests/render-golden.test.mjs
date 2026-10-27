import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawHud } from '../public/render/ui.js';

const scenarios = ['boot-menu', 'garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn'];
const load = name => JSON.parse(readFileSync(new URL(`../../tests/parity/next-ui-v2/${name}/canvas.json`, import.meta.url), 'utf8'));

test('all eight Canvas2D goldens have three deterministic frames', () => {
  for (const name of scenarios) {
    const trace = load(name);
    assert.equal(trace.scenario, name);
    assert.equal(trace.frames.length, 3, name);
    assert.equal(trace.frameDigests.length, 3, name);
    assert.ok(trace.digest, name);
    assert.ok(trace.totalOps > 0, name);
  }
});

test('garden renderer emits a populated scene and the attack slice draws petals/health', () => {
  const garden = load('garden-idle');
  assert.ok(garden.totalOps > 500, `garden ops ${garden.totalOps}`);
  assert.ok(garden.totalOps < 5000, `garden ops not culled: ${garden.totalOps}`);
  const attack = load('attack');
  assert.ok(attack.totalOps > 500, `attack ops ${attack.totalOps}`);
  const ops = attack.frames.flatMap(frame => frame.ops);
  assert.ok(ops.some(([, op]) => op === 'arc' || op === 'ellipse'), 'petal/player arcs');
  assert.ok(ops.some(([, op, args]) => op === 'fillRect' && args[2] > 0 && args[3] > 0), 'health/UI rects');
});

test('menu and death overlays contain their text', () => {
  // The recorded stable frames composite cached text. Exercise the current
  // renderer as well, so stale next/ traces cannot hide missing labels or
  // enforce obsolete death wording. Native bitmap contents and warm-cache
  // submission are checked against the original trace in hud-golden.
  const texts = state => {
    const labels = [];
    const context = new Proxy({}, { get(_target, property) {
      if (property === 'measureText') return text => ({ width: String(text).length * 7 });
      if (property === 'fillText') return text => labels.push(String(text));
      return () => {};
    } });
    drawHud(context, { health: 100, maxHealth: 100, level: 1, ...state });
    return labels;
  };
  assert.ok(load('boot-menu').frames.some(frame =>
    frame.ops.some(([, op]) => op === 'drawImage')), 'cached menu labels are composited');
  const menu = texts({ menu: true, animationTime: 2880, menuSeed: 2432940084 });
  for (const label of ['florr.io', 'Settings', 'Petals', 'Mobs', 'Changelog']) assert.ok(menu.includes(label), label);
  const death = texts({ deathState: { elapsedMilliseconds: 1000, killerName: 'Ladybug', respawnLevel: 12 } });
  for (const label of ['You were destroyed by:', 'Ladybug', '(press enter to continue)']) {
    assert.ok(death.includes(label), label);
  }
  assert.ok(!death.some(text => text.startsWith('You will respawn')), 'the death HUD has no respawn line');
  assert.ok(!texts({}).some(text => /destroyed|continue|respawn/.test(text)), 'respawn removes the death overlay');
});
