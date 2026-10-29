import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldState } from '../../public/state/world.js';
import { DeathLifecycle } from '../../public/state/death.js';
import { drawHud, getHudLayout } from '../../public/render/ui.js';

const carried = [6, 7, 8, 9, 10, 12, 15, 18, 19, 22, 25, 29, 34, 36, 2, 3];
const body = (health = 100, slots = carried, handle = 7) => ({ handle, typeId: 1, kind: 1,
  flags: 0, x: 0, y: 0, angle: 0, radius: 25, health, maxHealth: 100, healthKnown: true,
  level: 45, score: 1234.5, byteArrayFields: { 60: slots.map((value, index) => ({ value, index })) } });
const controller = { handle: 2, typeId: 0, kind: 0, flags: 0, x: 0, y: 0, angle: 0,
  health: 0, maxHealth: 0, referenceFields: { 56: 7 },
  byteFields: { 1: 33, 20: 0, 34: 10, 47: 45 }, floatFields: { 21: 1234.5 },
  stringFields: { 6: 'Hornet' }, byteArrayFields: { 16: carried.slice(5, 15).map((value, index) => ({ value, index })) } };
const apply = (world, entities, sequence) => world.apply({ sequence, serverTime: sequence * 50, entities, events: [] }, sequence * 50);

test('capture the corpse inventory and controller statistics before a batched removal, then reset on a new body', () => {
  const world = new WorldState(), death = new DeathLifecycle();
  apply(world, [body(), controller], 1); death.observe(world);
  const finalSlots = [...carried]; finalSlots[0] = 4;
  apply(world, [body(0, finalSlots), controller], 2); death.observe(world);
  // No render between the two received snapshots, as in a streamed flush.
  apply(world, [], 3); death.observe(world);
  assert.equal(death.dead, true);
  assert.deepEqual(death.snapshot.slots, finalSlots);
  assert.equal(death.snapshot.level, 45);
  assert.equal(death.snapshot.metadata.score, 1234.5);
  assert.equal(death.snapshot.metadata.killerName, 'Hornet');
  assert.equal(death.snapshot.metadata.deathLevel, 45);
  assert.equal(death.snapshot.metadata.respawnLevel, 33);
  assert.equal(death.snapshot.metadata.keptItems.length, 10);
  assert.equal(death.advance(16), Math.fround(1 - Math.pow(0.95, Math.fround(16) * .06)));
  apply(world, [body(100, [1, 1, 1, 1, 1], 8)], 4); death.observe(world);
  assert.equal(death.dead, false);
  assert.equal(death.advance(16), 0);
  assert.deepEqual(death.snapshot.slots.slice(0, 5), [1, 1, 1, 1, 1]);
});

test('native animation rounds every frame and death preserves empty slots and a zero score', () => {
  const world = new WorldState(), death = new DeathLifecycle();
  const zero = { ...controller, floatFields: { 21: 0 }, byteFields: { 1: 0, 20: 0, 34: 0, 47: 1 } };
  apply(world, [body(100, []), zero], 1); death.observe(world);
  apply(world, [body(0, []), zero], 2); death.observe(world);
  let expected = 0;
  for (const dt of [16, 16, 33, 4, 50, 120, 1000, 0]) {
    expected = Math.fround(expected + (1 - expected) * (1 - Math.pow(.95, Math.fround(dt) * .06)));
    assert.equal(death.advance(dt), expected);
  }
  assert.ok(death.snapshot.slots.every(type => type === 0));
  assert.equal(death.snapshot.metadata.score, 0);
  assert.equal(death.snapshot.metadata.respawnLevel, 1);
  death.reset(); death.observe(world);
  assert.equal(death.dead, false, 'old corpse cannot start another death after a menu reset');
});

test('dense and sparse controller fields distinguish the death level from the respawn level', () => {
  for (const dense of [false, true]) {
    const world = new WorldState();
    const record = dense ? { ...body(0), denseFields: { 1: 33, 20: 0, 34: 10, 47: 45, 21: 0, 6: 'Bee', 16: carried.slice(0, 10), 56: 7 },
      referenceFields: { 56: 7 }, byteFields: { 20: 0 } } : controller;
    apply(world, [record], 1);
    const value = world.deathMetadata();
    assert.equal(value.deathLevel, 45);
    assert.equal(value.respawnLevel, 33);
    assert.equal(value.keptCount, 10);
    assert.equal(value.keptItems.length, 10);
  }
});

// Record the renderer's public drawing protocol; no art/model implementation
// is mocked or replaced. Geometry and text must both move with the animation.
class RecordingContext {
  ops = [];
  texts = [];
  matrix = [1, 0, 0, 1, 0, 0];
  stack = [];
  save() { this.stack.push([...this.matrix]); this.ops.push(['save']); }
  restore() { this.matrix = this.stack.pop() ?? this.matrix; this.ops.push(['restore']); }
  setTransform(...matrix) { this.matrix = matrix; this.ops.push(['setTransform', ...matrix]); }
  getTransform() { return [...this.matrix]; }
  fillText(text, x, y) {
    const m = this.matrix;
    this.texts.push({ text, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
    this.ops.push(['fillText', text, x, y]);
  }
  measureText(text) { return { width: text.length * 7 }; }
}
for (const name of ['setFillRgb', 'setStrokeRgb', 'setGlobalAlpha',
  'setLineWidth', 'setLineCap', 'setLineJoin', 'beginPath', 'moveTo', 'lineTo',
  'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'arc', 'ellipse', 'rect', 'fill', 'stroke',
  'fillRect', 'strokeRect', 'clearRect', 'setFont', 'strokeText', 'drawImage'])
  RecordingContext.prototype[name] = function (...args) { this.ops.push([name, ...args]); };

const render = (slots, progress) => {
  const context = new RecordingContext();
  drawHud(context, { width: 1280, height: 720, level: 45, health: 0, maxHealth: 100,
    death: true, slots, deathState: { elapsedMilliseconds: 0, progress, keptSlots: slots,
      killerName: 'Hornet', respawnLevel: 45, score: 1234.5 } });
  return context;
};

test('death overlay slides both groups, draws real petals and retains reserve cards', () => {
  const settled = render(carried, 1), initial = render(carried, 0), middle = render(carried, .5);
  const textY = (context, text) => {
    const label = context.texts.find(label => label.text === text);
    assert.ok(label, `painted ${text}`);
    return label.y;
  };
  for (const text of ['You were destroyed by:', 'Hornet', 'Stats', 'Points: 1.2k', 'Level: 45']) {
    const a = textY(initial, text), b = textY(settled, text), c = textY(middle, text);
    assert.notEqual(a, b, `${text} moves into view`);
    assert.ok(Math.abs(c - (a + b) / 2) < .001, `${text} follows supplied progress`);
  }
  // Original1095 box tops, not approximate text baselines from a screenshot.
  // The non-raster fallback paints at each box's centre.
  const { logicalHeight: height, scale } = getHudLayout(1280, 720, 45);
  for (const [text, top, font] of [['Stats', height - 160, 24], ['Points: 1.2k', height - 126, 16], ['Level: 45', height - 104, 16]]) {
    assert.ok(Math.abs(textY(settled, text) - scale * (top + Math.fround(font * 1.4) / 2)) < .001, `${text} native box`);
    assert.ok(Math.abs(textY(initial, text) - textY(settled, text) - scale * height) < .001, `${text} begins one screen below`);
  }
  assert.notDeepEqual(render([6, 7, 8, 9, 10], 1).ops, render([1, 1, 1, 1, 1], 1).ops, 'ring uses real types');
  assert.notDeepEqual(settled.ops, render(carried.slice(0, 8), 1).ops, 'reserve inventory remains visible');
  assert.ok(!render([], 1).ops.some(op => op[0] === 'arc' && op[3] === 10), 'empty inventory invents no Basic ring');
});
