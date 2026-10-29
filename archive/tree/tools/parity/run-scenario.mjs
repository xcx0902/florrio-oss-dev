#!/usr/bin/env node
/**
 * Deterministic browser replay for Canvas2D parity.
 *
 * Boots the archived game (or a rebuilt root) in Chrome with:
 *   - a virtual clock that only moves when this driver advances it;
 *   - the original sp_server.wasm running behind a Worker-compatible facade;
 *   - a Canvas2D command recorder.
 *
 * Usage:
 *   node tools/parity/run-scenario.mjs --scenario garden-idle --update
 *   node tools/parity/run-scenario.mjs --all --update
 *   node tools/parity/run-scenario.mjs --all
 *   node tools/parity/run-scenario.mjs --scenario garden-idle --repeat 2
 *
 * Options: --root web|dist  --out tests/parity/golden  --scenario NAME (repeatable)
 *          --all  --update  --repeat N  --tolerance 1e-4  --keep-current
 */
import { chromiumExecutable } from '../lib/chromium.mjs';
import http from 'node:http';
import path from 'node:path';
import { evidence } from '../verification-evidence.mjs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { scenarios, scenarioByName, BOOT_FRAMES } from './scenarios.mjs';
import { diffTraces } from './trace-diff.mjs';

// Snapshot key shared by the archived client/server (data address 4576).
const snapshotKey = Buffer.from(JSON.parse(await readFile(
  new URL('../../source/semantic/server-catalogs.json', import.meta.url), 'utf8')).packetXorKeyHex, 'hex');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const flag = name => args.includes(name);
const root = path.resolve(option('--root', 'web'));
const output = path.resolve(option('--out', 'tests/parity/golden'));
const currentRoot = path.resolve(option('--current', 'tests/parity/current'));
const update = flag('--update');
const dumpClientState = flag('--dump-client-state');
const keepCurrent = flag('--keep-current');
const repeat = Number(option('--repeat', 1));
const tolerance = Number(option('--tolerance', 1e-4));
const viewport = { width: 1280, height: 720 };
const deviceScaleFactor = 1;
const epoch = Date.UTC(2024, 0, 1, 0, 0, 0);
const frameMs = 16;

const selected = flag('--all')
  ? scenarios
  : args.filter((value, index) => index > 0 && args[index - 1] === '--scenario').flatMap(name => [scenarioByName(name)]);
if (!selected.length) throw new Error('choose --scenario NAME or --all');

/** First entity header of an archived-client snapshot packet. */
function firstEntitySignature(hex) {
  if (!hex) return null;
  const raw = Buffer.from(hex, 'hex');
  const plain = Buffer.from(raw.slice(1));
  for (let index = 1; index < plain.length; index++) plain[index] ^= snapshotKey[(index - 1) & 255];
  let cursor = 1;
  const varint = () => {
    let value = 0, shift = 0, group;
    do { group = plain[cursor++]; value |= (group & 127) << shift; shift += 7; } while (group & 128);
    return value >>> 0;
  };
  const sequence = plain[0];
  varint(); varint();
  const removals = varint();
  cursor += 2 + removals * 4 + 2;
  if (cursor + 4 > plain.length) return null;
  const wire = plain.readUInt32LE(cursor);
  const handle = (((wire << 14) | (wire >>> 18)) >>> 0);
  return { sequence, handle, index: handle & 16383 };
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;

async function playwrightPath() {
  if (process.env.PLAYWRIGHT_CORE) return process.env.PLAYWRIGHT_CORE;
  for (const candidate of ['node_modules/playwright-core/index.mjs', 'node_modules/playwright/node_modules/playwright-core/index.mjs']) {
    if (existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error('playwright-core is required for browser parity. Run: npm install --save-dev playwright-core');
}
const { chromium } = await import(pathToFileURL(await playwrightPath()).href);
const chromePath = chromiumExecutable();

const stripExports = source => source.replace(/^export function /gm, 'function ');
const initScripts = [
  // R30: freeze navigator.userAgent so the handshake packet does not drift
  // with the locally installed Chrome build.
  stripExports(await readFile(new URL('./pinned-ua.js', import.meta.url), 'utf8')) + '\ninstallPinnedUserAgent({});',
  stripExports(await readFile(new URL('./client-wasm.js', import.meta.url), 'utf8')) + '\ninstallClientWasmProbe();',
  stripExports(await readFile(new URL('./virtual-clock.js', import.meta.url), 'utf8')) + '\ninstallVirtualClock({ epoch: ' + epoch + ', frameMs: ' + frameMs + ' });',
  stripExports(await readFile(new URL('./deterministic-worker.js', import.meta.url), 'utf8')) + '\ninstallDeterministicServer({});',
  stripExports(await readFile(new URL('./canvas-trace.js', import.meta.url), 'utf8')) + '\ninstallCanvasTrace({ captureFrames: 3 });',
];

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
const realWait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function artifactHashes() {
  const names = ['index.html', 'client.js', 'client.wasm', 'sp_server.js', 'sp_server.wasm'];
  const entries = [];
  for (const name of names) {
    const filename = path.join(root, name);
    if (!existsSync(filename)) continue;
    const bytes = await readFile(filename);
    entries.push([name, { bytes: bytes.length, sha256: hash(bytes) }]);
  }
  return Object.fromEntries(entries);
}

async function advance(page, frames) {
  if (frames <= 0) return;
  await page.evaluate(ms => window.__virtualClock.advance(ms), frames * frameMs);
}

async function pixelDiff(page, expectedBase64, actualBase64) {
  return page.evaluate(async ([left, right]) => {
    async function load(base64) {
      const image = new Image();
      image.src = 'data:image/png;base64,' + base64;
      await image.decode();
      return image;
    }
    const a = await load(left), b = await load(right);
    if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: true, a: [a.width, a.height], b: [b.width, b.height] };
    const canvas = document.createElement('canvas');
    canvas.width = a.width; canvas.height = a.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(a, 0, 0);
    const first = context.getImageData(0, 0, a.width, a.height).data;
    context.clearRect(0, 0, a.width, a.height);
    context.drawImage(b, 0, 0);
    const second = context.getImageData(0, 0, a.width, a.height).data;
    let changed = 0, max = 0, sum = 0;
    for (let i = 0; i < first.length; i += 4) {
      let delta = 0;
      for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(first[i + c] - second[i + c]));
      if (delta > 0) changed++;
      if (delta > max) max = delta;
      sum += delta;
    }
    return { width: a.width, height: a.height, changed, pixels: a.width * a.height, ratio: changed / (a.width * a.height), max, mean: sum / (a.width * a.height) };
  }, [expectedBase64, actualBase64]);
}

async function boot(page) {
  const logs = [];
  page.on('console', message => { if (message.type() === 'error') logs.push(message.text()); });
  page.on('pageerror', error => logs.push(String(error)));
  await page.goto(origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await page.evaluate(() => window.__parityServer?.ready === true)) break;
    await realWait(25);
  }
  await advance(page, BOOT_FRAMES);
  const summary = await page.evaluate(() => ({
    ready: window.__parityServer?.ready === true,
    canvas: window.__canvasTrace.summary(),
    clock: window.__virtualClock.now,
    loading: document.getElementById('loading')?.checkVisibility?.() ?? null,
  }));
  return { logs, summary };
}

async function execute(page, scenario) {
  for (const step of scenario.steps) {
    if (step.advance) await advance(page, step.advance);
    else if (step.key) await page.keyboard.press(step.key);
    else if (step.mouseMove) await page.mouse.move(step.mouseMove.x, step.mouseMove.y, { steps: 1 });
    else if (step.mouseDown) await page.mouse.down({ button: step.mouseDown });
    else if (step.mouseUp) await page.mouse.up({ button: step.mouseUp });
    else if (step.wheel) await page.mouse.wheel(step.wheel.dx ?? 0, step.wheel.dy ?? 0);
    else if (step.reset) await page.evaluate(frames => window.__canvasTrace.reset({ captureFrames: frames }), scenario.captureFrames ?? 3);
    else throw new Error(`unknown scenario step ${JSON.stringify(step)}`);
  }
}

async function capture(page, scenario, metaBase) {
  const canvas = await page.evaluate(options => window.__canvasTrace.export(options), {
    scenario: scenario.name, viewport: { ...viewport, dpr: deviceScaleFactor }, epoch, frameMs, frames: scenario.captureFrames ?? 3,
  });
  const serverTrace = await page.evaluate(() => window.__parityServer.exportTrace());
  // Client-side world state (same probe as the original-engine spike): lets the
  // driver diff how many entities the archived client decoded.
  const clientWorld = await page.evaluate(({ signature, includeVisual }) => {
    const probe = window.__clientWasm;
    if (!probe || !probe.memory) return null;
    const state = probe.findState(signature);
    if (!state) return { found: false, memoryBytes: probe.memory.buffer.byteLength, signature,
      handleAddresses: signature ? probe.findValue(signature.handle).map(address =>
        ({ address, ...probe.inspectAddress(address, signature.index) })) : [],
      alternateState: probe.stateHeader(probe.u32(7931292)),
      globalState: probe.stateHeader(probe.u32(4420)) };
    const dump = probe.dumpState(state);
    return { found: true, state, sequence: dump.sequence, activeCount: dump.activeCount,
      connectedFlag: dump.connectedFlag, playerFlagged: dump.playerFlagged,
      entityCount: dump.entities.length, entities: dump.entities.slice(0, 6),
      header: probe.dumpHeader(state, 620),
      ...(includeVisual ? { visual: probe.dumpVisualState(state, Date.now()) } : {}) };
  }, { signature: firstEntitySignature(serverTrace.firstDataHex || null), includeVisual: dumpClientState });
  const summary = await page.evaluate(() => ({
    canvas: window.__canvasTrace.summary(),
    clock: window.__virtualClock.now,
    loading: document.getElementById('loading')?.checkVisibility?.() ?? null,
    error: document.getElementById('errorDialog')?.checkVisibility?.() ?? null,
    canvasSize: (() => { const c = document.getElementById('canvas'); return c ? [c.width, c.height] : null; })(),
  }));
  const screenshot = await page.screenshot({ type: 'png' });
  return {
    canvas,
    server: serverTrace,
    clientWorld,
    meta: {
      ...metaBase,
      scenario: scenario.name,
      description: scenario.description,
      steps: scenario.steps,
      expect: scenario.expect,
      summary,
      screenshot: { bytes: screenshot.length, sha256: hash(screenshot) },
    },
    screenshot,
  };
}

async function runOnce(scenario) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: 'en-US', timezoneId: 'UTC' });
  const requests = [];
  const blocked = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    requests.push(url.replace(origin, '<origin>'));
    if (url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blocked.push(url);
    return route.abort('blockedbyclient');
  });
  for (const content of initScripts) await context.addInitScript({ content });
  const page = await context.newPage();
  const { logs, summary: bootSummary } = await boot(page);
  await execute(page, scenario);
  const result = await capture(page, scenario, {
    root, origin: '<origin>', browser: browser.version(), createdAt: new Date().toISOString(),
    bootSummary, logs, requests: [...new Set(requests)], blocked,
    artifacts: await artifactHashes(),
  });
  await context.close();
  return result;
}

async function compareScreenshot(page, expectedBuffer, actualBuffer) {
  if (hash(expectedBuffer) === hash(actualBuffer)) return { equal: true, exact: true, changed: 0, pixels: 0, ratio: 0, max: 0 };
  const diff = await pixelDiff(page, expectedBuffer.toString('base64'), actualBuffer.toString('base64'));
  if (diff.sizeMismatch) return { equal: false, ...diff };
  const maxRatio = Number(option('--max-pixel-ratio', 0.001));
  const maxDelta = Number(option('--max-pixel-delta', 8));
  return { equal: diff.ratio <= maxRatio && diff.max <= maxDelta, exact: false, ...diff };
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-first-run', '--disable-background-networking', '--disable-component-update', '--hide-scrollbars'],
});
const report = { generatedAt: new Date().toISOString(), evidence: await evidence(), root, output, update, repeat, tolerance, browser: browser.version(), scenarios: [], passed: true };
try {
  for (const scenario of selected) {
    const runs = [];
    for (let iteration = 0; iteration < Math.max(1, repeat); iteration++) runs.push(await runOnce(scenario));
    const first = runs[0];
    const deterministic = runs.every(run => run.canvas.digest === first.canvas.digest
      && run.meta.screenshot.sha256 === first.meta.screenshot.sha256
      && JSON.stringify(run.server) === JSON.stringify(first.server));
    const directory = path.join(output, scenario.name);
    const currentDirectory = path.join(currentRoot, scenario.name);
    const entry = { name: scenario.name, deterministic, checks: {}, issues: [] };
    entry.checks.workerReady = first.meta.bootSummary.ready === true;
    entry.checks.menuRendered = first.meta.bootSummary.canvas.frames > 0 && first.meta.bootSummary.canvas.ops > 0;
    entry.checks.noConsoleErrors = first.meta.logs.length === 0;
    entry.checks.noExternalRequests = first.meta.blocked.length === 0;
    for (const [key, value] of Object.entries(entry.checks)) if (!value) entry.issues.push({ path: key, message: 'check failed' });
    if (!deterministic) {
      entry.passed = false;
      entry.issues.push({ path: 'determinism', message: 'repeated runs produced different canvas/server/screenshot results' });
    }
    if (dumpClientState && first.clientWorld) {
      await mkdir(path.join('tests/parity/client-state'), { recursive: true });
      await writeFile(path.join('tests/parity/client-state', `${scenario.name}.json`),
        JSON.stringify(first.clientWorld) + '\n');
    }
    if (update) {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'canvas.json'), JSON.stringify(first.canvas) + '\n');
      await writeFile(path.join(directory, 'server.json'), JSON.stringify(first.server) + '\n');
      await writeFile(path.join(directory, 'screenshot.png'), first.screenshot);
      await writeFile(path.join(directory, 'meta.json'), JSON.stringify(first.meta, null, 2) + '\n');
      await writeFile(path.join(directory, 'client-state.json'), JSON.stringify(first.clientWorld) + '\n');
      entry.updated = true;
    } else {
      let expectedCanvas, expectedServer, expectedScreenshot, expectedMeta;
      try {
        expectedCanvas = JSON.parse(await readFile(path.join(directory, 'canvas.json'), 'utf8'));
        expectedServer = JSON.parse(await readFile(path.join(directory, 'server.json'), 'utf8'));
        expectedScreenshot = await readFile(path.join(directory, 'screenshot.png'));
        expectedMeta = JSON.parse(await readFile(path.join(directory, 'meta.json'), 'utf8'));
      } catch (error) {
        entry.passed = false;
        entry.issues.push({ path: 'golden', message: `missing golden (${error.message}); run with --update` });
      }
      if (expectedCanvas) {
        const canvasDiff = diffTraces(expectedCanvas, first.canvas, { tolerance });
        entry.checks.canvas = canvasDiff.equal;
        if (!canvasDiff.equal) entry.issues.push({ path: 'canvas', message: canvasDiff.issues });
        const serverEqual = JSON.stringify(expectedServer) === JSON.stringify(first.server);
        entry.checks.server = serverEqual;
        if (!serverEqual) entry.issues.push({ path: 'server', message: 'server trace differs' });
        const page = await browser.newPage();
        const shot = await compareScreenshot(page, expectedScreenshot, first.screenshot);
        await page.close();
        entry.checks.screenshot = shot.equal;
        entry.screenshot = shot;
        if (!shot.equal) entry.issues.push({ path: 'screenshot', message: shot });
        entry.checks.metadata = expectedMeta.scenario === first.meta.scenario;
        entry.artifactChanges = Object.keys({ ...expectedMeta.artifacts, ...first.meta.artifacts }).filter(name =>
          JSON.stringify(expectedMeta.artifacts?.[name]) !== JSON.stringify(first.meta.artifacts?.[name]));
        if (!entry.checks.metadata) entry.issues.push({ path: 'metadata', message: 'scenario metadata differs' });
      }
      entry.passed = entry.issues.length === 0;
      if (!entry.passed || keepCurrent) {
        await mkdir(currentDirectory, { recursive: true });
        await writeFile(path.join(currentDirectory, 'canvas.json'), JSON.stringify(first.canvas) + '\n');
        await writeFile(path.join(currentDirectory, 'server.json'), JSON.stringify(first.server) + '\n');
        await writeFile(path.join(currentDirectory, 'screenshot.png'), first.screenshot);
        await writeFile(path.join(currentDirectory, 'meta.json'), JSON.stringify(first.meta, null, 2) + '\n');
        await writeFile(path.join(currentDirectory, 'client-state.json'), JSON.stringify(first.clientWorld) + '\n');
        entry.currentDirectory = currentDirectory;
      }
    }
    entry.passed = entry.passed !== false && (update || entry.issues.length === 0);
    if (!entry.passed) report.passed = false;
    entry.canvas = { digest: first.canvas.digest, totalOps: first.canvas.totalOps, frames: first.canvas.frameDigests.length };
    entry.server = { messages: first.server.messages.length, responses: first.server.responses.length, ticks: first.server.ticks.length };
    report.scenarios.push(entry);
    console.log(JSON.stringify({ scenario: scenario.name, ...entry }, null, 2));
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
await mkdir(output, { recursive: true });
const reportName = selected.length === scenarios.length ? 'report.json' : 'report-partial.json';
await writeFile(path.join(output, reportName), JSON.stringify({ ...report, reportName }, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.map(item => ({ name: item.name, passed: item.passed, deterministic: item.deterministic, canvas: item.canvas, server: item.server })) }, null, 2));
if (!report.passed) process.exitCode = 1;
