import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBrowser } from '../../../tools/lib/browser-harness.mjs';
import ts from 'typescript';
import { createEvent14Effect, updateEvent14Effect, drawEvent14Effect } from '../../../build/client/render/event-effects.js';
import { createHudState, drawHud, getHudLayout } from '../../../build/client/render/ui.js';
import { PetalMotionState } from '../../../build/client/render/petal-motion.js';
import { PETAL_INFO } from '../../../build/client/schema/petals.js';
import { RenderingCanvas } from '../helpers/recording-canvas.mjs';

const payload = { index: 2, type: 6, startScreenX: 150.125, startScreenY: 280.25, recharge: 32767 / 65535 };
const f = Math.fround;

/** Record the Canvas2D calls this test needs to compare cached and cold draws. */
function installCanvasTrace() {
  const state = { ops: [] };
  const canvasIds = new WeakMap();
  let nextCanvas = 0;
  const descriptor = canvas => {
    if (!canvas || (typeof canvas !== 'object')) return canvas;
    let id = canvasIds.get(canvas);
    if (id === undefined) { id = nextCanvas++; canvasIds.set(canvas, id); }
    const name = canvas.id || (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas ? 'offscreen' : 'canvas');
    return { kind: 'canvas', id, name, width: canvas.width, height: canvas.height };
  };
  window.__canvasTrace = { state, reset() { state.ops.length = 0; } };
  const prototypes = [CanvasRenderingContext2D.prototype];
  if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') prototypes.push(OffscreenCanvasRenderingContext2D.prototype);
  for (const prototype of prototypes) for (const op of ['fillText', 'strokeText', 'measureText', 'drawImage']) {
    const original = prototype[op];
    if (typeof original !== 'function') continue;
    prototype[op] = function (...args) {
      const recorded = op === 'drawImage' ? args.map(descriptor) : args;
      state.ops.push([0, op, recorded]);
      return original.apply(this, args);
    };
  }
}
const step = delta => 1 - Math.pow(0.8, f(delta) * 0.06);

class Context {
  constructor() { this.ops = []; this.alpha = 0.4; this.matrix = [2, 0, 0, 2, 10, 20]; this.stack = []; }
  save() { this.ops.push(['save']); this.stack.push({ alpha: this.alpha, matrix: this.matrix }); }
  restore() { this.ops.push(['restore']); Object.assign(this, this.stack.pop()); }
  setTransform(...args) { this.ops.push(['setTransform', ...args]); this.matrix = args; }
  setGlobalAlpha(alpha) { this.ops.push(['alpha', alpha]); this.alpha = alpha; }
  getGlobalAlpha() { return this.alpha; }
  beginPath() { this.ops.push(['beginPath']); }
  closePath() { this.ops.push(['closePath']); }
  rect(...args) { this.ops.push(['rect', ...args]); }
  fillRect(...args) { this.ops.push(['fillRect', ...args]); }
  strokeRect(...args) { this.ops.push(['strokeRect', ...args]); }
  clearRect(...args) { this.ops.push(['clearRect', ...args]); }
  moveTo(...args) { this.ops.push(['moveTo', ...args]); }
  lineTo(...args) { this.ops.push(['lineTo', ...args]); }
  quadraticCurveTo(...args) { this.ops.push(['quadraticCurveTo', ...args]); }
  bezierCurveTo(...args) { this.ops.push(['bezierCurveTo', ...args]); }
  arc(...args) { this.ops.push(['arc', ...args]); }
  ellipse(...args) { this.ops.push(['ellipse', ...args]); }
  clip() { this.ops.push(['clip']); }
  fill() { this.ops.push(['fill']); }
  stroke() { this.ops.push(['stroke']); }
  setFillRgb(...args) { this.ops.push(['fillRgb', ...args]); }
  setStrokeRgb(...args) { this.ops.push(['strokeRgb', ...args]); }
  setLineWidth(width) { this.ops.push(['lineWidth', width]); }
  setLineJoin(join) { this.ops.push(['lineJoin', join]); }
  setLineCap(cap) { this.ops.push(['lineCap', cap]); }
  setGlobalCompositeOperation(value) { this.ops.push(['composite', value]); }
  setFont(font) { this.ops.push(['font', font]); }
  measureText(text) { return { width: text.length * 7 }; }
  strokeText(...args) { this.ops.push(['strokeText', ...args]); }
  fillText(...args) { this.ops.push(['fillText', ...args]); }
  drawImage(...args) { this.ops.push(['drawImage', ...args]); }
}

test('Delete uses native 11px text and fades below the dragged and retired petal cards', () => {
  const layout = getHudLayout(), motion = new PetalMotionState(), types = [1, 6];
  motion.update(layout, types, 0, 16, 0, 0); motion.begin(0);
  const slotMotions = motion.update(layout, types, 16, 16, 900, 600);
  const context = new Context();
  drawHud(context, { health: 100, maxHealth: 100, level: 1, slots: types, slotMotions,
    draggedSlot: 0, deleteAlpha: .25, keyboardSlot: 0, keyboardHighlightAlpha: 1,
    keyboardHighlightX: 900, keyboardHighlightY: 600, keyboardHighlightSize: 150 });
  const labels = context.ops.filter(([op]) => op === 'fillText').map(([, text]) => text);
  assert.ok(labels.indexOf('Delete') < labels.indexOf('Rose'));
  assert.ok(labels.indexOf('Rose') < labels.indexOf('Basic'), 'dragged source is painted above the later slot');
  const deletion = context.ops.findIndex(([op, text]) => op === 'fillText' && text === 'Delete');
  assert.ok(context.ops.slice(0, deletion).some(([op, font]) => op === 'font' && font === '11px Ubuntu'));
  assert.ok(context.ops.slice(0, deletion).some(([op, alpha]) => op === 'alpha' && alpha === .25));
  assert.ok(!context.ops.some(([op, r, g, b]) => op === 'strokeRgb' && r === 255 && g === 255 && b === 255),
    'keyboard selection has no white frame');
});

test('event 14 defaults preserve the decoded f32 position/recharge and start invisible at zero size', () => {
  const effect = createEvent14Effect(payload);
  assert.equal(effect.index, payload.index);
  assert.equal(effect.type, payload.type);
  assert.equal(effect.x, f(payload.startScreenX));
  assert.equal(effect.y, f(payload.startScreenY));
  assert.equal(effect.recharge, f(payload.recharge));
  assert.equal(effect.size, 0);
  assert.equal(effect.opacity, 0);
  assert.equal(effect.phase, 'arriving');
  const context = new Context();
  drawEvent14Effect(context, effect);
  assert.deepEqual(context.ops, []);
  assert.equal(createEvent14Effect({ ...payload, recharge: undefined }).recharge, 1);
  for (const bad of [{ index: -1 }, { index: 16 }, { index: 0.5 }, { type: 0 }, { type: 255 }, { startScreenX: NaN }]) {
    assert.throws(() => createEvent14Effect({ ...payload, ...bad }), RangeError);
  }
});

test('equipped/storage destinations follow current HUD layout, level thresholds, viewport and mobile scale', () => {
  for (const level of [1, 15, 30, 45]) for (const mobile of [false, true]) {
    const view = { width: 1537, height: 907, level, mobile, uiScale: 0.9 };
    const layout = getHudLayout(view.width, view.height, level, mobile, view.uiScale);
    for (const index of [0, layout.equippedCount - 1, layout.equippedCount, layout.equippedCount + 7]) {
      const effect = createEvent14Effect({ ...payload, index });
      assert.equal(updateEvent14Effect(effect, { ...view, nowMilliseconds: 16, deltaMilliseconds: 16 }), true);
      const equipped = index < layout.equippedCount;
      const x = f(equipped ? layout.equippedX + index * 90 : layout.storageX + (index - layout.equippedCount) * 65);
      const y = f(equipped ? layout.equippedY : layout.storageY);
      assert.equal(effect.x, f(f(payload.startScreenX) + (x - f(payload.startScreenX)) * step(16)));
      assert.equal(effect.y, f(f(payload.startScreenY) + (y - f(payload.startScreenY)) * step(16)));
      assert.equal(effect.size, f((equipped ? 70 : 50) * step(16)));
      assert.equal(effect.opacity, f(step(16)));
    }
  }
});

test('clock replay is idempotent; recharge resets down immediately and remembers subsequent targets', () => {
  const effect = createEvent14Effect(payload);
  updateEvent14Effect(effect, { nowMilliseconds: 100, deltaMilliseconds: 16 });
  const first = structuredClone(effect);
  updateEvent14Effect(effect, { nowMilliseconds: 100, deltaMilliseconds: 16 });
  updateEvent14Effect(effect, { nowMilliseconds: 90, deltaMilliseconds: 16 });
  assert.deepEqual(effect, first);
  updateEvent14Effect(effect, { nowMilliseconds: 116, recharge: 0.1 });
  assert.equal(effect.recharge, f(0.1));
  updateEvent14Effect(effect, { nowMilliseconds: 132, recharge: 1 });
  const previous = effect.recharge;
  updateEvent14Effect(effect, { nowMilliseconds: 148 });
  assert.equal(effect.recharge, f(previous + (1 - previous) * step(16)));
  const independent = createEvent14Effect(payload);
  assert.equal(independent.opacity, 0);
});

test('arrival settles without a TTL; retirement shrinks/fades and disappears after the native cutoff', () => {
  const effect = createEvent14Effect(payload);
  for (let now = 16; now <= 10000; now += 16) updateEvent14Effect(effect, { nowMilliseconds: now, deltaMilliseconds: 16 });
  assert.equal(effect.phase, 'settled');
  const size = effect.size, opacity = effect.opacity, slotX = effect.slotX, slotY = effect.slotY;
  updateEvent14Effect(effect, { nowMilliseconds: 10016, deltaMilliseconds: 16, active: false, width: 400, height: 300 });
  assert.equal(effect.phase, 'departing');
  assert.ok(effect.size < size && effect.opacity < opacity);
  assert.equal(effect.slotX, slotX); assert.equal(effect.slotY, slotY);
  for (let now = 10032; effect.phase !== 'done' && now < 12000; now += 16) {
    updateEvent14Effect(effect, { nowMilliseconds: now, deltaMilliseconds: 16, active: false });
  }
  assert.equal(effect.phase, 'done');
  const context = new Context(); drawEvent14Effect(context, effect);
  assert.deepEqual(context.ops, []);
  assert.equal(updateEvent14Effect(effect, { nowMilliseconds: 13000, deltaMilliseconds: 16 }), false);
  const empty = createEvent14Effect(payload);
  assert.equal(updateEvent14Effect(empty, { nowMilliseconds: 1, deltaMilliseconds: 0, active: false }), true);
  assert.equal(updateEvent14Effect(empty, { nowMilliseconds: 2, deltaMilliseconds: 0, active: false }), false);
});

test('drawing emits a petal rarity card, recharge sector and name, preserves context and never advances state', () => {
  const effect = createEvent14Effect(payload);
  updateEvent14Effect(effect, { nowMilliseconds: 16, deltaMilliseconds: 16 });
  const before = structuredClone(effect), context = new Context();
  const viewport = { pixelRatio: 2 };
  drawEvent14Effect(context, effect, viewport);
  assert.deepEqual(effect, before);
  assert.equal(context.alpha, 0.4);
  assert.deepEqual(context.matrix, [2, 0, 0, 2, 10, 20]);
  assert.equal(context.stack.length, 0);
  assert.ok(context.ops.some(([op, alpha]) => op === 'alpha' && alpha === 0.4 * effect.opacity));
  assert.ok(context.ops.some(([op]) => op === 'rect'));
  assert.ok(context.ops.some(([op, x, y, radius]) => op === 'arc' && x === 0 && y === 0 && radius === 10));
  const angle = f(effect.recharge * effect.recharge * 6.283185);
  assert.ok(context.ops.some(([op, x, y, radius, start, end]) => op === 'arc'
    && x === 0 && y === -5 && radius === 140 && start === angle * 5.7 && end === angle * 4.7 + 6.283185));
  assert.ok(context.ops.some(([op, text]) => op === 'fillText' && text === 'Rose'));
  const repeat = new Context(); drawEvent14Effect(repeat, effect, viewport);
  assert.deepEqual(repeat.ops, context.ops);
});

test('pickup slot names use catalogue font sizes during arrival, settlement and retirement', () => {
  for (const type of [6, 20, 25, 26, 28]) for (const index of [0, getHudLayout().equippedCount]) {
    const effect = createEvent14Effect({ ...payload, type, index });
    for (const frame of [
      { nowMilliseconds: 16, deltaMilliseconds: 16 },
      { nowMilliseconds: 10000, deltaMilliseconds: 9984 },
      { nowMilliseconds: 10016, deltaMilliseconds: 16 },
      { nowMilliseconds: 10032, deltaMilliseconds: 16, active: false },
    ]) {
      updateEvent14Effect(effect, frame);
      const context = new Context();
      drawEvent14Effect(context, effect);
      assert.deepEqual(context.ops.filter(([op]) => op === 'font'),
        [['font', `${PETAL_INFO[type].labelSize}px Ubuntu`]],
        `${PETAL_INFO[type].name}, slot ${index}, ${effect.phase}`);
    }
  }
});

test('HUD slot pass replaces static contents, preserves backgrounds, draws retirement and applies DPR once', () => {
  const state = { health: 100, maxHealth: 100, level: 1, slots: [1, 5, 0, 0, 0], storageSlots: [] };
  const labels = context => context.ops.filter(([op]) => op === 'fillText').map(([, text]) => text);
  for (const pixelRatio of [1, 2]) {
    const effect = createEvent14Effect({ ...payload, index: 0 });
    const initial = new Context();
    drawHud(initial, { ...state, pixelRatio, slotEffects: [effect] });
    assert.ok(!labels(initial).includes('Basic'), 'invisible arrival still owns its slot');
    updateEvent14Effect(effect, { nowMilliseconds: 16, deltaMilliseconds: 16 });
    const before = structuredClone(effect), context = new Context();
    drawHud(context, { ...state, pixelRatio, slotEffects: [effect] });
    assert.deepEqual(effect, before, 'HUD does not advance controller state');
    assert.equal(labels(context).filter(text => text === 'Rose').length, 1);
    assert.equal(labels(context).filter(text => text === 'Square').length, 1, 'unaffected slot remains');
    assert.ok(!labels(context).includes('Basic'), 'static content cannot duplicate the transfer');
    assert.equal(context.ops.filter(([op, alpha]) => op === 'alpha' && alpha === 0.8).length, 14,
      'all five equipped and nine storage/discard backgrounds survive');
    const scale = f(getHudLayout().scale * pixelRatio);
    assert.ok(context.ops.some(([op, a, b, c, d, x, y]) => op === 'setTransform'
      && a === f(scale * f(effect.size / 70)) && a === d && b === 0 && c === 0
      && x === f(scale * effect.x) && y === f(scale * effect.y)), 'screen position uses DPR once');
    updateEvent14Effect(effect, { nowMilliseconds: 32, deltaMilliseconds: 16, active: false });
    const departing = new Context();
    drawHud(departing, { ...state, pixelRatio, slotEffects: [effect] });
    assert.equal(labels(departing).filter(text => text === 'Rose').length, 1);
    assert.equal(labels(departing).filter(text => text === 'Basic').length, 1, 'retirement no longer owns slot');
    for (let now = 48; effect.phase !== 'done' && now < 2048; now += 16) {
      updateEvent14Effect(effect, { nowMilliseconds: now, deltaMilliseconds: 16, active: false });
    }
    const done = new Context(); drawHud(done, { ...state, pixelRatio, slotEffects: [effect] });
    assert.ok(!labels(done).includes('Rose'), 'retired visual disappears from the actual HUD pass');
    assert.equal(done.stack.length, 0);
  }
});

test('native browser reuses petal artwork and label bitmaps while preserving resource dimensions', async () => {
  const browser = await launchBrowser();
  try {
    const browserContext = await browser.newContext();
    const page = await browserContext.newPage();
    await page.context().route('http://event.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') { await route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }); return; }
      const file = new URL(`../../src${pathname.replace(/\.js$/, '.ts')}`, import.meta.url);
      const source = await readFile(file, 'utf8');
      await route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText });
    });
    await page.goto('http://event.test/');
    await page.evaluate(installCanvasTrace);
    const result = await page.evaluate(async () => {
      const { createEvent14Effect, updateEvent14Effect, drawEvent14Effect } = await import('/render/event-effects.js');
      const { wrapContext } = await import('/render/canvas2d/context.js');
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const context = wrapContext(canvas.getContext('2d'));
      const effect = createEvent14Effect({ index: 0, type: 6, startScreenX: 100, startScreenY: 200, recharge: 0.5 });
      updateEvent14Effect(effect, { nowMilliseconds: 16, deltaMilliseconds: 16 });
      drawEvent14Effect(context, effect);
      const cold = window.__canvasTrace.state.ops.slice();
      window.__canvasTrace.reset();
      drawEvent14Effect(context, effect);
      const warm = window.__canvasTrace.state.ops.slice();
      const replacement = createEvent14Effect({ index: 0, type: 6, startScreenX: 100, startScreenY: 200, recharge: 0.5 });
      updateEvent14Effect(replacement, { nowMilliseconds: 16, deltaMilliseconds: 16 });
      window.__canvasTrace.reset(); drawEvent14Effect(context, replacement);
      return { cold, warm, replacement: window.__canvasTrace.state.ops.slice() };
    });
    assert.ok(result.cold.some(([, op]) => op === 'fillText'));
    assert.ok(!result.warm.some(([, op]) => ['fillText', 'strokeText', 'measureText'].includes(op)));
    const bitmaps = result.warm.filter(([id, op]) => id === 0 && op === 'drawImage').map(([, , args]) => args[0]);
    assert.equal(bitmaps.length, 2, 'cached petal artwork and cached name');
    for (const bitmap of bitmaps) {
      assert.equal(bitmap.kind, 'canvas');
      assert.equal(bitmap.name, 'offscreen');
      assert.ok(Number.isInteger(bitmap.width) && bitmap.width > 0);
      assert.ok(Number.isInteger(bitmap.height) && bitmap.height > 0);
    }
    assert.equal(bitmaps[0].width, Math.ceil(24 * Math.fround(Math.fround(0.7) * 2.4)));
    assert.equal(bitmaps[0].height, bitmaps[0].width);
    const replacement = result.replacement.filter(([id, op]) => id === 0 && op === 'drawImage').map(([, , args]) => args[0]);
    assert.equal(replacement[0].id, bitmaps[0].id, 'identical species share immutable artwork');
    assert.notEqual(replacement[1].id, bitmaps[1].id, 'replacement and retired effects own separate name canvases');
    const names = await page.evaluate(async () => {
      const { createEvent14Effect, updateEvent14Effect, drawEvent14Effect } = await import('/render/event-effects.js');
      const { wrapContext } = await import('/render/canvas2d/context.js');
      const { getHudLayout } = await import('/render/hud.js');
      const { PETAL_INFO } = await import('/schema/petals.js');
      const results = [], f = Math.fround;
      for (const type of [6, 20, 25, 26, 28]) for (const index of [0, getHudLayout().equippedCount]) {
        for (const pixelRatio of [1, 2]) {
          const context = wrapContext(document.createElement('canvas').getContext('2d'));
          const drawImage = context.drawImage;
          let bitmap, matrix;
          context.drawImage = (image, ...args) => {
            bitmap = image; matrix = context.getTransform(); drawImage(image, ...args);
          };
          const effect = createEvent14Effect({ index, type, startScreenX: 100, startScreenY: 200 });
          for (const frame of [
            { nowMilliseconds: 16, deltaMilliseconds: 16 },
            { nowMilliseconds: 10000, deltaMilliseconds: 9984 },
            { nowMilliseconds: 10016, deltaMilliseconds: 16 },
            { nowMilliseconds: 10032, deltaMilliseconds: 16, active: false },
          ]) {
            updateEvent14Effect(effect, frame);
            drawEvent14Effect(context, effect, { pixelRatio });
            const first = bitmap, firstMatrix = matrix;
            window.__canvasTrace.reset();
            drawEvent14Effect(context, effect, { pixelRatio });
            const font = PETAL_INFO[type].labelSize, scale = f(getHudLayout().scale * pixelRatio);
            const raster = f(scale * 2.4), projected = f(scale * f(effect.size / 70));
            results.push({ name: PETAL_INFO[type].name, index, pixelRatio, phase: effect.phase,
              height: matrix[3], expectedHeight: f(projected * f(font * 1.4)),
              bitmapHeight: bitmap.height, expectedBitmapHeight: Math.trunc(f(f(font) * raster) * 1.4),
              reused: first === bitmap && firstMatrix.every((value, i) => value === matrix[i]),
              repainted: window.__canvasTrace.state.ops.some(([, op]) => ['fillText', 'strokeText', 'measureText'].includes(op)) });
          }
        }
      }
      return results;
    });
    for (const name of names) {
      const message = `${name.name}, slot ${name.index}, DPR ${name.pixelRatio}, ${name.phase}`;
      assert.equal(name.height, name.expectedHeight, `${message}: displayed font height`);
      assert.equal(name.bitmapHeight, name.expectedBitmapHeight, `${message}: raster font height`);
      assert.equal(name.reused, true, `${message}: cached bitmap and transform`);
      assert.equal(name.repainted, false, `${message}: warm draw`);
    }
    const fallbackPage = await page.context().newPage();
    await fallbackPage.goto('http://event.test/');
    const fallback = await fallbackPage.evaluate(async () => {
      Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: undefined });
      const { createRasterCanvas, getLabel } = await import('/render/canvas2d/text-cache.js');
      const { drawHud } = await import('/render/hud.js');
      const { wrapContext } = await import('/render/canvas2d/context.js');
      const { createEvent14Effect, updateEvent14Effect } = await import('/render/event-effects.js');
      const allocations = [], create = document.createElement.bind(document);
      document.createElement = (...args) => { const element = create(...args); if (args[0] === 'canvas') allocations.push(element); return element; };
      const canvas = createRasterCanvas(1280, 720), label = getLabel({ text: 'fallback', font: 13, rasterScale: 2 });
      const effect = createEvent14Effect({ index: 0, type: 6, startScreenX: 100, startScreenY: 200 });
      updateEvent14Effect(effect, { nowMilliseconds: 16, deltaMilliseconds: 16 });
      drawHud(wrapContext(canvas.getContext('2d')), { health: 100, maxHealth: 100, level: 1,
        slots: [6, 0, 0, 0, 0], slotEffects: [effect] });
      return { main: canvas instanceof HTMLCanvasElement, label: label.canvas instanceof HTMLCanvasElement,
        allDom: allocations.every(value => value instanceof HTMLCanvasElement), count: allocations.length,
        painted: canvas.getContext('2d').getImageData(0, 0, 1280, 720).data.some(value => value !== 0) };
    });
    assert.equal(fallback.main, true); assert.equal(fallback.label, true);
    assert.equal(fallback.allDom, true); assert.ok(fallback.count > 10);
    assert.equal(fallback.painted, true, 'DOM fallback renders HUD and event artwork');
  } finally { await browser.close(); }
});
