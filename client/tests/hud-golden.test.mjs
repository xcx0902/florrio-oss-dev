import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { chromiumExecutable } from '../../tools/lib/chromium.mjs';
import { installCanvasTrace } from '../../tools/parity/canvas-trace.js';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';
import { drawHud, createHudState, hotbarSlotAt, inventorySlotAt, getHudLayout, equippedSlotCount } from '../public/render/ui.js';

/** Minimal Canvas2DContext recorder (no DOM, so drawHud uses its fillText
 * fallback and records the same geometry the browser path draws). */
class RecordingContext {
  constructor() {
    this.ops = [];
  }

  record(name, ...args) {
    this.ops.push([name, ...args]);
  }

  save() { this.record('save'); }
  restore() { this.record('restore'); }
  setTransform(...args) { this.record('setTransform', ...args); }
  beginPath() { this.record('beginPath'); }
  closePath() { this.record('closePath'); }
  rect(...args) { this.record('rect', ...args); }
  moveTo(...args) { this.record('moveTo', ...args); }
  lineTo(...args) { this.record('lineTo', ...args); }
  quadraticCurveTo(...args) { this.record('quadraticCurveTo', ...args); }
  bezierCurveTo(...args) { this.record('bezierCurveTo', ...args); }
  arc(...args) { this.record('arc', ...args); }
  ellipse(...args) { this.record('ellipse', ...args); }
  fill() { this.record('fill'); }
  stroke() { this.record('stroke'); }
  clip() { this.record('clip'); }
  fillRect(...args) { this.record('fillRect', ...args); }
  strokeRect(...args) { this.record('strokeRect', ...args); }
  clearRect(...args) { this.record('clearRect', ...args); }
  setFillRgb(...args) { this.record('setFillRgb', ...args); }
  setStrokeRgb(...args) { this.record('setStrokeRgb', ...args); }
  setGlobalAlpha(...args) { this.record('setGlobalAlpha', ...args); }
  setLineWidth(...args) { this.record('setLineWidth', ...args); }
  setLineJoin(...args) { this.record('setLineJoin', ...args); }
  setLineCap(...args) { this.record('setLineCap', ...args); }
  setFont(...args) { this.record('setFont', ...args); }
  fillText(...args) { this.record('fillText', ...args); }
  strokeText(...args) { this.record('strokeText', ...args); }
  measureText(text) { return { width: String(text).length * 7 }; }
  drawImage(...args) { this.record('drawImage', ...args); }

  find(name, predicate = () => true) {
    return this.ops.find(([op, ...args]) => op === name && predicate(...args));
  }

  all(name) {
    return this.ops.filter(([op]) => op === name);
  }
}

function drawTwice(state) {
  const first = new RecordingContext();
  drawHud(first, state);
  const second = new RecordingContext();
  drawHud(second, state);
  return [first, second];
}

test('boot menu reproduces the archived 1280x720 layout', () => {
  const [menu, repeat] = drawTwice({
    health: 100, maxHealth: 100, level: 1, menu: true, status: '',
    animationTime: 2880, menuSeed: 2432940084,
  });

  // Background.
  assert.ok(menu.ops.some(([op, ...args]) =>
    op === 'setFillRgb' && args[0] === 30 && args[1] === 167 && args[2] === 97));
  const background = menu.ops.findIndex(([op, ...args]) => op === 'setTransform'
    && args[0] === 1280 && args[3] === 720 && args[4] === 0 && args[5] === 0);
  assert.ok(background > 0, 'source background uses a viewport-scaled unit rectangle');
  assert.deepEqual(menu.ops[background + 1], ['fillRect', 0, 0, 1, 1]);

  // Fifteen floating flower discs decoded from the settled trace.
  const discs = menu.all('arc').filter(([, x, y, r]) => x === 0 && y === 0 && r === 10);
  assert.equal(discs.length, 15);
  const transforms = menu.all('setTransform').map(([, ...args]) => args);
  assert.ok(transforms.some(([a, b, c, d, e, f]) =>
    Math.abs(a - 0.446572) < 1e-6 && b === 0 && c === 0 && Math.abs(d - 0.446572) < 1e-6
    && Math.abs(e - 57.886974) < 1e-4 && Math.abs(f - 411.328552) < 1e-4));
  assert.ok(transforms.some(([a, b, c, d, e, f]) =>
    Math.abs(a - 1.371761) < 1e-6 && Math.abs(d - 1.371761) < 1e-6
    && Math.abs(e - 195.455902) < 1e-4 && Math.abs(f - 301.007965) < 1e-4));

  // Title and the four bottom tabs, at the archived centres.
  const title = menu.find('fillText', text => text === 'florr.io');
  assert.ok(title);
  assert.equal(title[2], 914);
  assert.equal(title[3], 257);
  for (const tab of ['Settings', 'Petals', 'Mobs', 'Changelog']) {
    assert.ok(menu.find('fillText', text => text === tab), `missing ${tab} label`);
  }
  const petals = menu.find('fillText', text => text === 'Petals');
  assert.equal(petals[2], 160);
  assert.equal(petals[3], 1001.5);

  // Frame stability: every run records exactly the same commands.
  assert.deepEqual(menu.ops, repeat.ops);
});

test('in-game HUD reproduces the archived slot, map and bar geometry', () => {
  const [hud, repeat] = drawTwice({
    health: 50.145, maxHealth: 100, level: 1, levelProgress: 0.74456014, score: 3, pixelRatio: 1,
    slots: [1, 1, 1, 1, 1], selectedSlot: 0,
  });

  // The level bar: full 300-unit track, settled 74.456% fill (223.368 units).
  assert.ok(hud.ops.some(([op, ...args]) =>
    op === 'moveTo' && args[0] === 0 && args[1] === 919));
  assert.ok(hud.ops.some(([op, ...args]) =>
    op === 'lineTo' && Math.abs(args[0] - 223.368042) < 1e-4 && args[1] === 919));

  // First equipped slot: 44.9167 px green fill at the archived position.
  assert.ok(hud.ops.some(([op, ...args]) =>
    op === 'setTransform' && Math.abs(args[0] - 44.916653) < 1e-4
    && Math.abs(args[4] - 491.341675) < 1e-4
    && Math.abs(args[5] - 596.341675) < 1e-4));
  assert.ok(hud.ops.some(([op, ...args]) =>
    op === 'setTransform' && args[0] === 52.5 && args[1] === 0 && args[2] === 0
    && args[3] === 28 && Math.abs(args[4] - 1070.299927) < 1e-4
    && Math.abs(args[5] - 636.299988) < 1e-4));
  assert.ok(hud.ops.some(([op, ...args]) =>
    op === 'setTransform' && Math.abs(args[0] - 40.833332) < 1e-4
    && Math.abs(args[4] - 493.383301) < 1e-4));

  // Logo + panel name go through the same text path.
  const logo = hud.find('fillText', text => text === 'florr.io');
  assert.ok(logo);
  assert.ok(hud.find('fillText', text => text === 'Unnamed Flower'));
  assert.ok(hud.find('fillText', text => text === '1 Flower'));
  assert.ok(hud.find('fillText', text => text === 'Move mouse here to disable movement'));

  // Frame stability.
  assert.deepEqual(hud.ops, repeat.ops);
});

test('hit tests use the golden slot positions', () => {
  assert.equal(hotbarSlotAt(490 + 28, 594 + 28), 0);
  assert.equal(hotbarSlotAt(490 + 4 * 62 + 28, 594 + 28), 4);
  assert.equal(hotbarSlotAt(490 + 28, 655 + 18), 6); // second storage slot
  assert.equal(hotbarSlotAt(810 + 18, 655 + 18), 'discard');
  assert.equal(hotbarSlotAt(10, 10), undefined);
  assert.equal(inventorySlotAt(454 + 28, 279 + 28), 0);
  assert.equal(inventorySlotAt(454 + 3 * 62 + 28, 279 + 2 * 62 + 28), 15);
  assert.equal(inventorySlotAt(454 + 5 * 62 + 28, 279 + 2 * 62 + 28), undefined);
  assert.equal(inventorySlotAt(10, 10), undefined);
});

test('HUD progress and extra-slot hint follow authoritative player state', () => {
  const empty = new RecordingContext();
  drawHud(empty, { health: 100, maxHealth: 100, level: 1, levelProgress: 0, score: 0 });
  // func1095 still submits the empty XP path, at alpha/width zero. Map and
  // scoreboard strokes are independent, so absence of a colour is not a gate.
  const xp = empty.ops.findIndex(([op, r, g, b]) => op === 'setStrokeRgb' && r === 245 && g === 255 && b === 101);
  assert.ok(xp > 0);
  assert.ok(empty.ops.slice(xp - 6, xp).some(([op, alpha]) => op === 'setGlobalAlpha' && alpha === 0));
  assert.ok(empty.ops.slice(xp - 6, xp).some(([op, width]) => op === 'setLineWidth' && width === 0));
  const advanced = new RecordingContext();
  drawHud(advanced, { health: 100, maxHealth: 100, level: 20, levelProgress: 0.5, score: 43 });
  assert.ok(advanced.find('lineTo', (x, y) => x === 150 && y === 919));
  assert.ok(advanced.find('fillText', text => text === 'Extra petal slot at level 30'));
  assert.ok(advanced.find('fillText', text => text === '- 43'));
  const maximumSlots = new RecordingContext();
  drawHud(maximumSlots, { health: 100, maxHealth: 100, level: 45, levelProgress: 0.2 });
  assert.ok(!maximumSlots.find('fillText', text => String(text).includes('Extra petal slot')));
});

const baseState = { health: 100, maxHealth: 100, level: 1, slots: [1, 1, 1, 1, 1] };
const texts = context => context.all('fillText').map(([, text]) => text);
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1e-4, `${label}: ${actual} != ${expected}`);

test('level thresholds and resized/mobile hit regions use the same dynamic layout', () => {
  for (const [level, count] of [[1, 5], [14, 5], [15, 6], [29, 6], [30, 7], [44, 7], [45, 8], [99, 8]]) {
    assert.equal(equippedSlotCount(level), count);
    for (const [width, height, mobile] of [[1280, 720, false], [1920, 1080, false], [960, 540, false], [390, 844, true]]) {
      const layout = getHudLayout(width, height, level, mobile);
      for (let index = 0; index < count; index++) {
        assert.equal(hotbarSlotAt((layout.equippedX + index * 90) * layout.scale,
          layout.equippedY * layout.scale, width, height, level, mobile), index);
      }
      for (let index = 0; index < 8; index++) {
        assert.equal(hotbarSlotAt((layout.storageX + index * 65) * layout.scale,
          layout.storageY * layout.scale, width, height, level, mobile), count + index);
      }
      assert.equal(hotbarSlotAt((layout.storageX + 520) * layout.scale,
        layout.storageY * layout.scale, width, height, level, mobile), 'discard');
      assert.equal(hotbarSlotAt((layout.equippedX - 36) * layout.scale,
        layout.equippedY * layout.scale, width, height, level, mobile), undefined);
    }
  }
});

test('XP, map position, player count and leaderboard follow state without clearing the main canvas', () => {
  const context = new RecordingContext();
  drawHud(context, { ...baseState, level: 30, levelProgress: 0.25, mapPosition: 0.5,
    flowerEntries: [{ name: 'Local', score: 43, local: true }, { name: 'Leader', score: 1000 }] });
  assert.ok(context.find('lineTo', (x, y) => x === 75 && y === 919));
  assert.ok(context.find('arc', (x, y, radius) => x === 125 && y === 20 && radius === 15));
  assert.ok(texts(context).includes('Lvl 30 Flower'));
  assert.ok(texts(context).includes('Extra petal slot at level 45'));
  assert.ok(texts(context).includes('2 Flowers'));
  assert.ok(texts(context).indexOf('Leader') < texts(context).indexOf('Local'));
  assert.equal(context.all('clearRect').length, 0, 'DOM-free panel must not erase the scene');
  for (const progress of [-1, NaN, Infinity, 2]) {
    const draw = new RecordingContext();
    drawHud(draw, { ...baseState, levelProgress: progress });
    assert.ok(draw.find('lineTo', (x, y) => y === 919 && x === (progress === 2 ? 300 : 0)));
    for (const [, ...args] of draw.ops) for (const arg of args) {
      if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `non-finite ${progress}`);
    }
  }
});

test('storage, rarity, recharge and drag rendering use current slots', () => {
  const context = new RecordingContext();
  drawHud(context, { ...baseState, slots: [6, 1, 1, 1, 1], storageSlots: [5], slotProgress: [0.5] });
  assert.ok(texts(context).includes('Rose'));
  assert.ok(texts(context).includes('Square'));
  const angle = Math.fround(0.5 * 0.5 * 6.283185);
  const sector = context.find('arc', (x, y, radius) => x === 0 && y === -5 && radius === 140);
  assert.ok(sector);
  close(sector[4], angle * 5.7, 'sector start');
  close(sector[5], angle * 4.7 + 6.283185, 'sector end');
  const clip = context.ops.findIndex(([op]) => op === 'clip');
  const border = context.ops.findIndex(([op, r, g, b], index) => index > clip
    && op === 'setStrokeRgb' && r === 207 && g === 186 && b === 75);
  assert.ok(border > clip, 'cooldown sector precedes rarity border');
  const drag = new RecordingContext();
  drawHud(drag, { ...baseState, slots: [6], draggedSlot: 0, pointerX: 200, pointerY: 150, hoveredSlot: 0 });
  assert.equal(texts(drag).filter(text => text === 'Rose').length, 1, 'dragged icon moves instead of duplicating');
  assert.ok(!texts(drag).includes('Unusual'), 'drag suppresses tooltip');
});

test('storage drag uses the displayed storage type and CSS pointer coordinates at every DPR', () => {
  for (const pixelRatio of [1, 1.5, 2]) {
    const context = new RecordingContext();
    drawHud(context, { ...baseState, pixelRatio, slots: [1, 1, 1, 1, 1, 6],
      storageSlots: [5], draggedSlot: 5, pointerX: 200, pointerY: 150 });
    assert.equal(texts(context).filter(text => text === 'Square').length, 1);
    assert.ok(!texts(context).includes('Rose'), 'stale flattened slots cannot replace storage');
    const label = context.find('fillText', text => text === 'Square');
    close(label[2], 200 * pixelRatio, 'drag label backing X');
    close(label[3], (150 + 84 * 17 / 70 * getHudLayout().scale) * pixelRatio, 'drag label backing Y');
  }
  const empty = new RecordingContext();
  drawHud(empty, { ...baseState, slots: [1, 1, 1, 1, 1, 6], storageSlots: [] });
  assert.ok(!texts(empty).includes('Rose'), 'explicit empty storage is authoritative');
});

test('custom UI scale hit tests follow rendered slots and invalid scales use the source default', () => {
  for (const uiScale of [0.5, 1, 1.25]) {
    const layout = getHudLayout(1280, 720, 30, false, uiScale);
    for (let index = 0; index < layout.equippedCount; index++) {
      assert.equal(hotbarSlotAt((layout.equippedX + index * 90) * layout.scale,
        layout.equippedY * layout.scale, 1280, 720, 30, false, uiScale), index);
    }
    assert.equal(hotbarSlotAt(layout.storageX * layout.scale, layout.storageY * layout.scale,
      1280, 720, 30, false, uiScale), 7);
  }
  for (const uiScale of [0, -1, NaN, Infinity]) {
    assert.deepEqual(getHudLayout(1280, 720, 1, false, uiScale), getHudLayout());
  }
});

test('text cache retains native measurement precision until bitmap dimensions are truncated', async () => {
  // text.mjs func385 caches logical widths as f32; func444 instead uses the
  // native f64 measureText result when allocating the raster bitmap. A width
  // just below an integer distinguishes those two contracts.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let measured = 10.9999999;
  const painted = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement() {
      const context = { measureText: () => ({ width: measured }),
        fillText: (...args) => painted.push(args), strokeText() {} };
      return { width: 0, height: 0, getContext: () => context };
    },
  } });
  try {
    const { getLabel, measureLabel, clearLabelCache } = await import('../public/render/canvas2d/text-cache.js?hud-precision');
    const spec = { text: 'precision', font: 10, rasterScale: 1, outline: 0 };
    const label = getLabel(spec);
    assert.equal(measureLabel('precision', 10), Math.fround(measured));
    assert.equal(label.textWidth, 11);
    assert.equal(label.width, 10, 'raster allocation must not round the native width up to 11');
    assert.equal(label.height, 14);
    assert.deepEqual(painted, [['precision', 5, 7]], 'bitmap text is centered on integer coordinates');
    assert.equal(getLabel({ ...spec }), label, 'identical text/style reuses the bitmap');
    const slot0 = getLabel({ ...spec, cacheKey: 'hotbar:0' });
    const slot1 = getLabel({ ...spec, cacheKey: 'hotbar:1' });
    assert.notEqual(slot0.canvas, slot1.canvas, 'native slots own distinct canvases for identical labels');
    assert.notEqual(slot0.canvas, label.canvas, 'owned labels are distinct from the default cache');
    assert.equal(getLabel({ ...spec, cacheKey: 'hotbar:0' }).canvas, slot0.canvas,
      'same owner, text and style reuse the raster');
    const changed = getLabel({ ...spec, fill: '#FF0000' });
    assert.notEqual(changed.canvas, label.canvas, 'style changes invalidate the bitmap');
    measured = 20.9999999;
    clearLabelCache();
    assert.equal(getLabel(spec).width, 20, 'font reload invalidates measurements and bitmaps together');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
});

test('per-HUD XP presentation advances from the encoded target through all three original frames', async () => {
  const golden = JSON.parse(await readFile(new URL('../../tests/parity/golden/garden-idle/canvas.json', import.meta.url), 'utf8'));
  const hud = createHudState();
  const target = { ...baseState, levelProgress: 49151 / 65535, score: 3 };
  const originalFrames = new Map(golden.frames.map(frame => [frame.time, frame]));
  // Native metadata becomes visible at 2528 ms in this source fixture. Warm
  // every 16 ms frame, including the first; runtime code has no scene clock
  // or captured XP fraction. Compare each changing golden endpoint exactly.
  for (let now = 2528; now <= 2880; now += 16) {
    const state = hud.update(target, now, 16);
    assert.ok(state.levelProgress < target.levelProgress);
    const frame = originalFrames.get(now);
    if (!frame) continue;
    const xp = frame.ops.findIndex(([id, op, args]) => id === 16 && op === '=strokeStyle' && args[0] === '#F5FF65');
    assert.ok(xp > 0);
    const expected = frame.ops[xp - 1];
    assert.equal(expected[1], 'lineTo');
    const context = new RecordingContext();
    drawHud(context, state);
    close(context.find('lineTo', (_x, y) => y === 919 && _x !== 300)[1], expected[2][0], `XP at ${now}`);
    assert.ok(texts(context).includes('- 3'), 'fractional score uses native %.0f formatting');
  }
  assert.equal(target.levelProgress, 49151 / 65535, 'authoritative input remains unmodified');
});

test('HUD frame clocks, rank smoothing, reset and score field interpolation remain independent', () => {
  const hud = createHudState();
  const target = { ...baseState, levelProgress: 0.75,
    flowerEntries: [{ name: 'First', score: 100 }, { name: 'Local', score: 50, local: true }] };
  const amount = 1 - Math.pow(0.8, Math.fround(16) * 0.06);
  const first = hud.update(target, 100, 16);
  assert.equal(first.levelProgress, Math.fround(0.75 * amount));
  assert.equal(first.flowerEntries[0].displayedScore, Math.fround(100 * amount));
  assert.equal(first.flowerEntries[1].displayedScore, Math.fround(50 * amount));
  assert.deepEqual(hud.update(target, 100, 16), first, 'same frame cannot tick a second time');
  assert.deepEqual(hud.update(target, 90, 16), first, 'a stale clock cannot tick or rewind');
  const reordered = hud.update({ ...target, flowerEntries: [
    { name: 'Local', score: 200, local: true }, { name: 'First', score: 100 },
  ] }, 116);
  assert.equal(reordered.flowerEntries[0].name, 'Local');
  assert.equal(reordered.flowerEntries[0].displayedScore,
    Math.fround(first.flowerEntries[0].displayedScore + amount * (200 - first.flowerEntries[0].displayedScore)),
    'native score memory belongs to rank, even when names change');
  const independent = createHudState();
  assert.deepEqual(independent.update(target, 100, 16), first);
  hud.reset();
  assert.deepEqual(hud.update(target, 100, 16), first, 'reset clears progress, ranks and clock');
  const local = createHudState();
  const scored = { ...baseState, score: 10, scoreTransition: { previous: 0, receivedAt: 100 } };
  const quarter = local.update(scored, 130, 16);
  assert.equal(quarter.flowerEntries[0].score, 2.5, 'local score samples the native 120 ms field transition');
  assert.equal(quarter.flowerEntries[0].displayedScore, Math.fround(2 * amount), 'sample is uint32 before rank smoothing');
  const complete = local.update(scored, 220, 90);
  assert.equal(complete.flowerEntries[0].score, 10);
  assert.equal(complete.flowerEntries[0].displayedScore,
    Math.fround(quarter.flowerEntries[0].displayedScore + (1 - Math.pow(0.8, 90 * 0.06)) * (10 - quarter.flowerEntries[0].displayedScore)));
});

test('native scoreboard rounds scores, abbreviates thousands/millions and keeps zero-score bars empty', () => {
  // Original func412/1983 drops exact halves in %.0f, including odd halves.
  for (const [score, expected] of [[1.5, '- 1'], [2.5, '- 2'], [3.5, '- 3'], [1250, '- 1.2k'], [1350, '- 1.4k'],
    [2250, '- 2.2k'], [2450, '- 2.5k'], [2850, '- 2.9k'], [1250000, '- 1.2m']]) {
    const context = new RecordingContext();
    drawHud(context, { ...baseState, flowerEntries: [{ name: 'Player', score, displayedScore: score }] });
    assert.ok(texts(context).includes(expected), `${score}: ${expected}`);
  }
  const context = new RecordingContext();
  drawHud(context, { ...baseState, flowerEntries: [{ name: 'Leader', score: 1 }, { name: 'Zero', score: 0 }] });
  assert.ok(context.find('lineTo', (x, y) => x === 20 && y === 81), 'zero divided by a nonzero leader is zero');
});

test('scoreboard decimal rounding agrees with original WASM printf at true and rounded binary ties', async () => {
  const original = await loadOriginal('client', { functionIds: [368, 412] });
  const output = original.call(368, 128), args = original.call(368, 16);
  const view = new DataView(original.memory.buffer);
  const bytes = new Uint8Array(original.memory.buffer), decoder = new TextDecoder();
  for (const [format, multiplier, scores] of [
    [15745, 1, [0, 0.5, 1.5, 2.5, 3.5, 998.5, 999.5]],
    [14099, 0.001, [...Array.from({ length: 181 }, (_, index) => 1000 + index * 50), 999950]],
    [13648, 0.000001, [1000000, 1050000, 1250000, 1350000, 2250000, 2450000, 2850000, 4294967295]],
  ]) {
    for (const score of scores) {
      view.setFloat64(args, score * multiplier, true);
      original.call(412, output, 128, format, args);
      let end = output;
      while (bytes[end]) end++;
      const expected = `- ${decoder.decode(bytes.subarray(output, end))}`;
      const context = new RecordingContext();
      drawHud(context, { ...baseState, flowerEntries: [{ name: 'Player', score, displayedScore: score }] });
      assert.ok(texts(context).includes(expected), `${score}: original printf returns ${expected}`);
    }
  }
});

test('death event presentation is time-driven, repeatable, and removed on respawn', () => {
  for (const elapsedMilliseconds of [0, 120, 1000]) {
    const state = { ...baseState, deathState: { elapsedMilliseconds, killerName: 'Ladybug', respawnLevel: 12, keptSlots: [1, 6] } };
    const [context, repeat] = drawTwice(state);
    assert.deepEqual(context.ops, repeat.ops, 'rendering does not advance event time');
    assert.ok(texts(context).includes('You were destroyed by:'));
    assert.ok(texts(context).includes('Ladybug'));
    assert.ok(texts(context).includes('(press enter to continue)'));
    assert.ok(texts(context).includes('You will respawn at level 12 with:'));
    const amount = Math.fround(1 - Math.pow(0.95, elapsedMilliseconds * 0.06));
    assert.ok(context.find('setGlobalAlpha', alpha => Math.abs(alpha - amount * 0.25) < 1e-7));
  }
  const alive = new RecordingContext();
  drawHud(alive, baseState);
  assert.ok(!texts(alive).some(text => /destroyed|continue|respawn/.test(text)));
  const mobile = new RecordingContext();
  drawHud(mobile, { ...baseState, mobile: true, death: true });
  assert.ok(texts(mobile).includes('(tap to continue)'));
});

/** Compare every command, argument, style, bitmap kind/name/dimensions and
 * referenced Path2D command. Only allocation identities are canonicalized; the
 * production renderer never reads a trace. The 1e-4 tolerance is the strict
 * parity gate's existing float tolerance, not a geometry-only assertion. */
function canonical(value, trace) {
  if (Array.isArray(value)) return value.map(item => canonical(item, trace));
  if (!value || typeof value !== 'object') return value;
  if (value.kind === 'path') return { kind: 'path', ops: trace.paths.find(path => path.id === value.id)?.ops };
  if (value.kind === 'canvas') return { kind: 'canvas', name: value.name, width: value.width, height: value.height };
  return value;
}
function compareTrace(actual, expected, path = 'trace') {
  if (typeof actual === 'number' && typeof expected === 'number') { close(actual, expected, path); return; }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.equal(actual.length, expected.length, `${path} length`);
    expected.forEach((item, index) => compareTrace(actual[index], item, `${path}[${index}]`));
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) compareTrace(actual[key], expected[key], `${path}.${key}`);
  } else assert.equal(actual, expected, path);
}

/** Native func1132/819 oracle with prewarmed text caches. Browser measurements
 * are inputs; all placement/composition still executes original WASM. */
async function originalPanelText(widths) {
  let runtime, matrix;
  const blits = [];
  const host = (code, signature, pointer) => {
    const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer), args = [];
    let cursor = pointer >>> 2;
    for (let type; type = bytes[signature++]; cursor++) {
      const double = type < 105;
      if (double && cursor & 1) cursor++;
      args.push(double ? view.getFloat64((cursor++ >> 1) * 8, true) : view.getInt32(cursor * 4, true));
    }
    if (code === 136414 && args[0] === 7) matrix = args.slice(1);
    if (code === 138211 && args[0] === 7) blits.push(matrix.slice());
    return 0;
  };
  runtime = await loadOriginal('client', { functionIds: [368, 561, 818, 1132], imports: { a: { a: host, c: host } } });
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(runtime.memory.buffer);
  const put = (address, value) => view.setInt32(address, value, true);
  const float = (address, value) => view.setFloat32(address, value, true);
  const alloc = length => { const address = runtime.call(368, length); bytes.fill(0, address, address + length); return address; };
  const color = alloc(4), renderer = alloc(112), scope = alloc(4), height = alloc(4);
  put(color, -1); runtime.call(818, renderer, color); put(renderer + 96, 7);
  float(renderer, 0.77); float(renderer + 12, 0.77); float(renderer + 16, 7.7); float(renderer + 20, 7.7);
  put(scope, height); float(height, 276);
  bytes[7934624] = bytes[7936160] = 1;
  bytes.fill(0, 150700, 150744); bytes[150700] = 1; bytes[150718] = 1;
  float(150720, 1); bytes[150724] = 49;
  for (const [index, address, text] of [[0, 7933104, 'Unnamed Flower'], [1, 7934640, '- 1']]) {
    runtime.call(818, address + 8, color);
    const encoded = new TextEncoder().encode(text), source = alloc(encoded.length + 1);
    bytes.set(encoded, source); runtime.call(561, address + 124, source, encoded.length);
    bytes[address] = 0; bytes[address + 120] = 1;
    bytes.fill(255, address + 136, address + 139);
    float(address + 116, widths[index]); float(address + 144, 0.12); float(address + 148, 13);
    float(address + 112, Math.fround(0.77) * 2);
    put(address + 104, index + 2);
  }
  runtime.call(1132, scope, renderer);
  assert.equal(blits.length, 2, 'original panel submits both prewarmed label bitmaps');
  return blits;
}

test('native warm HUD matches all three complete original garden traces from encoded XP targets', async () => {
  const browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
  try {
    const page = await browser.newPage();
    // Transpile only the requested module in memory: no client build/output.
    await page.route('http://hud.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') { await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html></html>' }); return; }
      const module = pathname.endsWith('.js');
      const file = new URL(module ? `../src${pathname.replace(/\.js$/, '.ts')}` : `../..${pathname}`, import.meta.url);
      const contents = await readFile(file);
      await route.fulfill({ contentType: module ? 'text/javascript' : 'font/woff2', body: module
        ? ts.transpileModule(contents.toString(), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText : contents });
    });
    await page.goto('http://hud.test/');
    await page.evaluate(async () => {
      const font = new FontFace('Ubuntu', 'url(/source/assets/fonts/ubuntu-bold-latin.woff2)');
      await font.load(); document.fonts.add(font);
    });
    await page.evaluate(installCanvasTrace);
    const captures = await page.evaluate(async () => {
      const { drawHud, createHudState } = await import('/render/hud.js');
      const { wrapContext } = await import('/render/canvas2d/context.js');
      const { measureLabel } = await import('/render/canvas2d/text-cache.js');
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const native = canvas.getContext('2d');
      const context = wrapContext(native);
      const target = { health: 50.145, maxHealth: 100, level: 1, levelProgress: 49151 / 65535,
        score: 3, slots: [1, 1, 1, 1, 1] };
      const hud = createHudState(), frames = [];
      let cold;
      for (let now = 2528; now <= 2880; now += 16) {
        const state = hud.update(target, now, 16);
        // A real world pass leaves a nonidentity matrix on this context.
        // Exercise HUD compositing/restoration across that boundary; the
        // shared lazy context correctly omits a redundant identity flush
        // when an isolated test instead starts with an untouched canvas.
        context.setTransform(0.5, 0, 0, 0.5, 17, 23);
        context.clearRect(0, 0, 0, 0);
        if (now >= 2848) window.__canvasTrace.reset();
        drawHud(context, state);
        const matrix = native.getTransform();
        if (matrix.a !== 0.5 || matrix.d !== 0.5 || matrix.e !== 17 || matrix.f !== 23) {
          throw new Error('HUD did not restore the preceding world transform');
        }
        if (now === 2528) cold = window.__canvasTrace.state.ops.slice();
        if (now >= 2848) frames.push({ ops: window.__canvasTrace.state.ops.slice(), paths: window.__canvasTrace.export().paths });
      }
      const panelId = cold.find(([, op, args]) => op === 'drawImage'
        && args[0]?.width === 170 && args[0]?.height === 228)[2][0].id;
      const panelText = [];
      let matrix;
      for (const [id, op, args] of cold) {
        if (id !== panelId) continue;
        if (op === 'setTransform') matrix = args;
        if (op === 'drawImage') panelText.push({ matrix, resource: args[0] });
      }
      return { cold, frames, panelText, widths: [measureLabel('Unnamed Flower', 13), measureLabel('- 1', 13)] };
    });
    const golden = JSON.parse(await readFile(new URL('../../tests/parity/golden/garden-idle/canvas.json', import.meta.url), 'utf8'));
    assert.equal(captures.frames.length, golden.frames.length);
    assert.equal(captures.panelText.length, 2, 'default local entry rasterizes both labels inside the panel');
    const nativePanel = await originalPanelText(captures.widths);
    captures.panelText.forEach(({ matrix, resource }, index) => {
      assert.equal(resource.name, 'offscreen');
      compareTrace(matrix, nativePanel[index], `cached panel label ${index}`);
    });
    captures.frames.forEach((capture, index) => {
      const expected = golden.frames[index].ops;
      const hudId = capture.ops.find(([id, opcode]) => id !== 0 && opcode === 'clearRect')[0];
      const names = capture.ops.filter(([id, opcode, args]) => id === hudId && opcode === 'drawImage'
        && args[0]?.width === 60 && args[0]?.height === 29).map(([, , args]) => args[0].id);
      assert.equal(names.length, 5, `frame ${index} submits all five Basic slot labels`);
      assert.equal(new Set(names).size, 5, 'each native slot retains its own cached label canvas');
      if (index) {
        const previous = captures.frames[index - 1].ops.filter(([, opcode, args]) => opcode === 'drawImage'
          && args[0]?.width === 60 && args[0]?.height === 29).map(([, , args]) => args[0].id);
        assert.deepEqual(names, previous, 'warm frames retain the same per-slot resources');
      }
      compareTrace(capture.ops.filter(([id]) => id === hudId).map(op => canonical(op.slice(1), capture)),
        expected.filter(([id]) => id === 16).map(op => canonical(op.slice(1), golden)), `HUD[${index}]`);
      const main = capture.ops.filter(([id]) => id === 0).map(op => canonical(op.slice(1), capture));
      const originalMain = expected.filter(([id]) => id === 0);
      const compositeStart = originalMain.findLastIndex(([, opcode], index) => opcode === 'save'
        && originalMain[index + 1]?.[1] === 'save' && originalMain[index + 2]?.[1] === 'save');
      assert.ok(compositeStart >= 0, 'original HUD composite has its three nested saves');
      compareTrace(main, originalMain.slice(compositeStart).map(op => canonical(op.slice(1), golden)), `composite[${index}]`);
      assert.ok(!capture.ops.some(([, opcode]) => ['fillText', 'strokeText', 'measureText'].includes(opcode)), 'warm labels use their raster cache');
    });
    for (const label of ['florr.io', 'Lvl 1 Flower', 'Basic', 'Unnamed Flower', '1 Flower']) {
      assert.ok(captures.cold.some(([, opcode, args]) => opcode === 'fillText' && args[0] === label), `cold cache ${label}`);
    }
  } finally { await browser.close(); }
});
