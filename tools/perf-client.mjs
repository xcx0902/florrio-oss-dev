#!/usr/bin/env node
import { startTestServer } from './lib/test-server.mjs';
import { launchBrowser } from './lib/browser-harness.mjs';
/**
 * R31: measure the reconstructed client's frame budget.
 *
 * Loads the actual `dist-next` delivery in Chromium, freezes the worker/input path, injects a
 * full 872-entity garden snapshot and measures rAF frame intervals plus long
 * tasks for `--frames` frames while the camera moves every frame (so the
 * renderer cannot skip work). Results go to reports/perf.json.
 *
 * Usage: node tools/perf-client.mjs [--frames 600] [--root dist-next] [--out reports/perf.json]
 */
import path from 'node:path';
import { evidence, newRunId, sameEvidence, sha256, treeIdentity } from './verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from './verification/io.mjs';
import { readFile, mkdir, open, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  if (position >= 0 && (!args[position + 1] || args[position + 1].startsWith('--'))) throw new Error(`${name} requires a value`);
  return position < 0 ? fallback : args[position + 1];
};
const root = path.resolve(option('--root', 'dist-next'));
const output = path.resolve(option('--out', 'reports/perf.json'));
const frames = Number(option('--frames', 600));
if (!Number.isSafeInteger(frames) || frames < 60) throw new Error('--frames must be an integer >= 60');
await assertVerificationOwner();
await mkdir(path.dirname(output), { recursive: true });
let browser;
const runId = process.env.VERIFY_RUN_ID ?? newRunId();
const before = { ...await evidence(), runId };
const target = await treeIdentity('.', [path.relative(process.cwd(), root)]);
const rootWasmSha256 = sha256(await readFile(path.join(root, 'server.wasm')));
const manifestPath = path.join(root, 'build-manifest.json');
const rootManifestSha256 = existsSync(manifestPath) ? sha256(await readFile(manifestPath)) : null;
const sourceMatchesDelivery = !rootManifestSha256 || JSON.parse(await readFile(manifestPath, 'utf8')).inputs?.sha256 === before.source.sha256;
const lock = await open(output + '.lock', 'wx');

const fixture = await startTestServer(root, { diagnostics: true });
const server = fixture.server;
try {
await atomicJson(output, { runId, evidence: before, generatedAt: new Date().toISOString(), passed: false, status: 'running' });
const origin = fixture.origin;
browser = await launchBrowser({ args: ['--no-first-run', '--disable-background-networking', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  window.__perfDraws = 0;
  const clear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...args) {
    if (this.canvas.id === 'canvas') window.__perfDraws++;
    return clear.apply(this, args);
  };
});
await page.goto(origin + '/index.html?test=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__florr && document.getElementById('canvas'), null, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);

const result = await page.evaluate(async frameCount => {
  const florr = window.__florr;
  florr.freeze();
  const entities = [];
  const mobTypes = [4, 6, 12, 14, 22, 1, 2, 3];
  for (let index = 0; index < 866; index++) {
    const typeId = mobTypes[index % mobTypes.length];
    entities.push({ handle: 0x3e858000 + (index + 1) * 16384, typeId, kind: 2,
      speciesId: index % 5, x: (index % 40) * 900 - 18000, y: Math.floor(index / 40) * 700 - 7000,
      angle: (index % 7) * 0.9, health: 25, maxHealth: 25, healthKnown: true, maxHealthKnown: true,
      level: 1, flags: 0 });
  }
  entities.unshift({ handle: 0x3e858000, typeId: 1, kind: 1, speciesId: 0, x: 0, y: 0, angle: 0,
    health: 100, maxHealth: 100, healthKnown: true, maxHealthKnown: true, level: 1, flags: 1 });
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal / 5 * Math.PI * 2;
    entities.push({ handle: 0x3e858000 + (900 + petal) * 16384, typeId: 1, kind: 3, speciesId: 1,
      x: Math.cos(angle) * 40, y: Math.sin(angle) * 40, angle, health: 10, maxHealth: 10,
      healthKnown: true, maxHealthKnown: true, level: 1, flags: 0 });
  }
  florr.setSnapshot(entities);
  const longTasks = [];
  try {
    new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); })
      .observe({ entryTypes: ['longtask'] });
  } catch {}
  const heapStart = performance.memory ? performance.memory.usedJSHeapSize : null;
  let drawsStart = window.__perfDraws;
  const intervals = [];
  const warmup = 60;
  let previous = performance.now();
  for (let frame = 0; frame < frameCount + warmup; frame++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const now = performance.now();
    // The first frames include font/canvas warmup and the initial snapshot
    // upload; the steady-state budget starts after them.
    if (frame >= warmup) intervals.push(now - previous);
    if (frame === warmup - 1) drawsStart = window.__perfDraws;
    previous = now;
    const angle = frame / 60;
    florr.setCamera(Math.cos(angle) * 300, Math.sin(angle) * 200);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 640 + Math.cos(angle) * 300, clientY: 360 + Math.sin(angle) * 200 }));
  }
  const heapEnd = performance.memory ? performance.memory.usedJSHeapSize : null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return {
    frames: frameCount, intervals,
    p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1],
    mean: intervals.reduce((sum, value) => sum + value, 0) / intervals.length,
    longTasks: longTasks.length, longTaskMax: longTasks.length ? Math.max(...longTasks) : 0,
    longTaskTotal: longTasks.reduce((sum, value) => sum + value, 0),
    heapStart, heapEnd, drawFrames: window.__perfDraws - drawsStart, entities: florr.world.count,
  };
}, frames);

const stable = sourceMatchesDelivery && sameEvidence(before, await evidence()) && target.sha256 === (await treeIdentity('.', [path.relative(process.cwd(), root)])).sha256;
const report = { evidence: before, runId, stable, sourceMatchesDelivery, root: path.relative(process.cwd(), root), rootWasmSha256, rootManifestSha256,
  kind: 'renderer-performance', workload: '872 synthetic entities, moving camera, 60 warmup frames; independent of production integration',
  target: { sha256: target.sha256, files: Object.keys(target.files).length }, browser: browser.version(), errors,
  drawFrames: result.drawFrames, entities: result.entities,
  schema: 2,
  generatedAt: new Date().toISOString(),
  frames: result.frames,
  fps: 1000 / result.mean,
  frameMs: { mean: result.mean, p50: result.p50, p95: result.p95, p99: result.p99, max: result.max },
  longTasks: { count: result.longTasks, maxMs: result.longTaskMax, totalMs: result.longTaskTotal },
  heap: { start: result.heapStart, end: result.heapEnd, delta: result.heapStart === null || result.heapEnd === null ? null : result.heapEnd - result.heapStart },
  budget: { frameMs60: 16.67, p95Limit: 20, maxLimit: 50, minFps: 55,
    p95Pass: result.p95 <= 20, maxPass: result.max <= 50, fpsPass: 1000 / result.mean >= 55 },
  passed: stable && errors.length === 0 && result.entities === 872 && result.drawFrames >= frames
    && result.intervals.length === frames && result.p95 <= 20 && result.max <= 50 && 1000 / result.mean >= 55,
};
await atomicJson(output, { ...report, intervals: result.intervals });
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await lock.close(); await rm(output + '.lock', { force: true });
}
