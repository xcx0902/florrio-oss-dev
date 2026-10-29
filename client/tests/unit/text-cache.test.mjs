/** Pure product tests for the outlined-text cache. No browser, WASM or archive. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'florr-text-cache-'));
after(() => rm(temporary, { recursive: true, force: true }));
const source = await import('node:fs/promises').then(fs => fs.readFile(
  new URL('../../src/render/canvas2d/text-cache.ts', import.meta.url), 'utf8'));
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const moduleFile = path.join(temporary, 'text-cache.mjs');
await writeFile(moduleFile, compiled.replaceAll("from './context.js'", "from './context.mjs'"));

let paints = 0;
class FakeContext {
  constructor(canvas) {
    this.canvas = canvas;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.lineWidth = 1;
    this.strokeStyle = '#000';
    this.fillStyle = '#fff';
    this.draws = [];
  }
  measureText(text) {
    const size = Number.parseFloat(this.font) || 10;
    return { width: text.length * size * 0.6 };
  }
  strokeText() { ++paints; }
  fillText() { ++paints; }
  setTransform(...args) { this.transform = args; }
  getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  save() { this.saved = true; }
  restore() { this.restored = true; }
  drawImage(image, ...args) { this.draws.push({ image, args }); }
}
class FakeCanvas {
  constructor(width, height) {
    this._width = width;
    this._height = height;
    this.resizes = 0;
    this.context = new FakeContext(this);
  }
  get width() { return this._width; }
  set width(value) { this._width = value; ++this.resizes; }
  get height() { return this._height; }
  set height(value) { this._height = value; ++this.resizes; }
  getContext(kind) { return kind === '2d' ? this.context : null; }
}
globalThis.OffscreenCanvas = FakeCanvas;
const cache = await import(pathToFileURL(moduleFile).href);
const base = { text: 'Unnamed Flower', font: 13, rasterScale: 1.848 };

test('owner identity isolates identical labels; non-owner labels share by signature', () => {
  cache.clearLabelCache();
  const left = cache.getLabel({ ...base, cacheKey: 'left' });
  const right = cache.getLabel({ ...base, cacheKey: 'right' });
  const rightAgain = cache.getLabel({ ...base, cacheKey: 'right' });
  assert.notEqual(left.canvas, right.canvas);
  assert.equal(right.canvas, rightAgain.canvas);
  const sharedA = cache.getLabel({ ...base, text: 'shared' });
  const sharedB = cache.getLabel({ ...base, text: 'shared' });
  assert.equal(sharedA.canvas, sharedB.canvas);
});

test('same owner and style reuses the bitmap without repainting; text/style changes dirty it', () => {
  cache.clearLabelCache();
  const owner = { ...base, cacheKey: 'leaderboard' };
  const first = cache.getLabel(owner);
  const paintsAfterFirst = paints;
  const reused = cache.getLabel(owner);
  assert.equal(paints, paintsAfterFirst, 'repeat request must not paint');
  assert.equal(reused.canvas, first.canvas);

  for (const patch of [{ text: 'Changed Flower' }, { font: 16 }, { outline: 0.2 },
    { fill: '#FF3366' }, { stroke: '#3366FF' }]) {
    const next = cache.getLabel({ ...owner, ...patch });
    assert.ok(paints > paintsAfterFirst, `repaint after ${JSON.stringify(patch)}`);
    assert.equal(next.canvas, first.canvas, 'owner swaps the bitmap on its retained canvas');
  }
});

test('owner scale hysteresis retains 0.4..1.0001 and rebuilds outside it', () => {
  cache.clearLabelCache();
  const owner = { ...base, cacheKey: 'panel' };
  const initial = { ...owner, rasterScale: 1, projectedScale: 1 };
  const first = cache.getLabel(initial);
  const paintCount = paints;
  const retained = cache.getLabel({ ...owner, rasterScale: 0.8, projectedScale: 0.8 });
  assert.equal(paints, paintCount, 'ratio 0.8 retains the bitmap');
  assert.equal(retained.canvas, first.canvas);
  cache.getLabel({ ...owner, rasterScale: 1.01, projectedScale: 1.01 });
  assert.equal(paints, paintCount + 2, 'ratio 1.01 rebuilds');
  cache.getLabel({ ...owner, rasterScale: 0.39, projectedScale: 0.39 });
  assert.equal(paints, paintCount + 4, 'ratio 0.39 rebuilds');
});

test('cache dimensions follow font, raster scale, outline and explicit cacheWidth', () => {
  cache.clearLabelCache();
  const spec = { text: 'XY', font: 20, rasterScale: 2, outline: 0.1, cacheWidth: 120 };
  const label = cache.getLabel(spec);
  assert.equal(label.width, 120);
  assert.equal(label.height, Math.trunc(Math.fround(40) * 1.4));
  assert.equal(label.margin, Math.trunc(Math.fround(Math.fround(20 * 0.1) * 2)));
  const natural = cache.getLabel({ ...spec, text: 'XY2', cacheWidth: undefined });
  assert.ok(natural.width > 0);
  assert.equal(natural.height, label.height);
});

test('releaseLabel and clearLabelCache drop owner bitmaps so the next request repaints', () => {
  cache.clearLabelCache();
  const owner = { ...base, cacheKey: 'released' };
  const first = cache.getLabel(owner);
  const before = paints;
  assert.equal(cache.releaseLabel('released'), true);
  const second = cache.getLabel(owner);
  assert.notEqual(second.canvas, first.canvas);
  assert.ok(paints > before);
  assert.equal(cache.releaseLabel('missing'), false);
  cache.clearLabelCache();
  const third = cache.getLabel(owner);
  assert.notEqual(third.canvas, second.canvas);
});

test('drawLabel composes a unit image instead of stretching the bitmap', () => {
  cache.clearLabelCache();
  const target = new FakeContext(new FakeCanvas(1, 1));
  const spec = { ...base, cacheKey: 'drawn' };
  const label = cache.getLabel(spec);
  cache.drawLabel(target, spec, 100, 200, 2, true);
  assert.equal(target.draws.length, 1);
  assert.equal(target.draws[0].image, label.canvas);
  assert.deepEqual(target.draws[0].args, [0, 0, 1, 1]);
  assert.equal(target.saved, true);
  assert.equal(target.restored, true);
  assert.equal(target.transform[0], Math.fround(label.boxWidth * 2));
  assert.equal(target.transform[3], Math.fround(Math.fround(spec.font * 1.4) * 2));
});

test('without a canvas implementation getLabel is a clean null, not a crash', () => {
  const script = `import('${pathToFileURL(moduleFile).href}').then(module => {
    const value = module.getLabel({ text: 'x', font: 12, rasterScale: 1 });
    if (value !== null) { console.error('expected null'); process.exit(1); }
  })`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});
