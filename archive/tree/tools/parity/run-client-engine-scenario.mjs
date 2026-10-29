#!/usr/bin/env node
/**
 * Render the reconstructed client against the C++ engine's real state.
 *
 * `run-client-scenario.mjs` drives the client with small synthetic scenes. This
 * runner replays a golden scenario into `client/public/server.wasm`, dumps the
 * engine's encoded packets at their original flush times and feeds the entire
 * packet history through the production TypeScript decoder and receiver. The resulting canvas trace and screenshot are therefore
 * comparable with the archived client's golden for the same scenario.
 *
 * Usage:
 *   node tools/parity/run-client-engine-scenario.mjs --scenario garden-idle
 *   node tools/parity/run-client-engine-scenario.mjs --all --update
 *   node tools/parity/run-client-engine-scenario.mjs --all --no-camera
 *
 * If `tests/parity/golden/<scene>/camera.json` exists (written by
 * `derive-camera.mjs`), the archived camera recording is pinned before each
 * captured frame. `--no-camera` restores the old behaviour.
 */
import { chromiumExecutable } from '../lib/chromium.mjs';
import http from 'node:http';
import path from 'node:path';
import { evidence } from '../verification-evidence.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { recoverCameraProjection } from './camera-projection.mjs';
import { scenarioByName, BOOT_FRAMES } from './scenarios.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const flag = name => args.includes(name);
const repoRoot = path.resolve('.');
const root = path.resolve(option('--root', 'client/public'));
const output = path.resolve(option('--out', 'tests/parity/next-engine'));
const update = flag('--update');
// Same-camera injection is on by default when the optional golden
// `camera.json` exists (R19.1). `--no-camera` restores the old follow-only
// behaviour; `--camera` requires the recording and warns when it is absent.
const cameraMode = flag('--no-camera') ? 'off' : (flag('--camera') ? 'on' : 'auto');
const selectedNames = args.filter((value, index) => index > 0 && args[index - 1] === '--scenario');
const viewport = { width: 1280, height: 720 };
const scenarios = ['boot-menu', 'garden-idle', 'move', 'attack', 'equip', 'damage', 'death', 'spawn'];
const selected = selectedNames.length ? selectedNames : (flag('--all') ? scenarios : scenarios);

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2',
};
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(filename);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }).end(body);
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
  throw new Error('playwright-core is required for Canvas2D parity');
}
const { chromium } = await import(pathToFileURL(await playwrightPath()).href);
const chromePath = chromiumExecutable();
const stripExports = source => source.replace(/^export function /gm, 'function ');
const fromHex = text => Uint8Array.from(text.match(/../g) ?? [], pair => parseInt(pair, 16));

const engineBytes = await readFile(path.join(root, 'server.wasm'));
let memory = null;
const imports = {
  env: { emscripten_notify_memory_growth: () => {} },
  wasi_snapshot_preview1: {
    fd_close: () => 0,
    fd_write: (fd, iovs, iovsLength, writtenPointer) => {
      new DataView(memory.buffer).setUint32(writtenPointer >>> 0, 0, true);
      return 0;
    },
    fd_seek: () => 0,
  },
};
const { instance } = await WebAssembly.instantiate(engineBytes, imports);
memory = instance.exports.memory;
const exports = instance.exports;

/** Replay the same chronological sends, ticks and flushes as the archived
 * worker. Keep the encoded packets and their real delivery times; rendering
 * needs the complete smoothing history, profile fields and event stream. */
function engineStateFor(scenario) {
  exports.sp_server_init();
  const golden = JSON.parse(requireRead(`tests/parity/golden/${scenario}/server.json`));
  const packets = [];
  let nextTick = 50;
  for (const message of golden.messages) {
    // At a shared timestamp the archived rAF flush/send runs before the
    // worker's 50 ms interval. A tick is observable only at a later flush.
    while (nextTick < message.at) {
      exports.sp_server_think();
      nextTick += 50;
    }
    if (message.funcName === 'sp_server_send' && message.dataHex) {
      const bytes = fromHex(message.dataHex);
      const pointer = exports.malloc(bytes.length);
      new Uint8Array(memory.buffer).set(bytes, pointer);
      exports.sp_server_send(pointer, bytes.length);
      exports.free(pointer);
    } else if (message.funcName === 'sp_server_flush') {
      exports.sp_server_flush();
      const count = exports.sp_server_output_count();
      for (let index = 0; index < count; index++) {
        const pointer = exports.sp_server_output_data(index);
        const length = exports.sp_server_output_size(index);
        if (length) packets.push({ at: message.at,
          bytes: Array.from(new Uint8Array(memory.buffer, pointer, length)) });
      }
    }
  }
  const canvas = JSON.parse(requireRead(`tests/parity/golden/${scenario}/canvas.json`));
  return { packets, ticks: (nextTick - 50) / 50,
    entities: exports.sp_server_state_count(),
    frames: canvas.frames.map(frame => frame.time) };
}
function requireRead(relative) { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

/** Optional same-camera recording: tests/parity/golden/<scene>/camera.json. */
function recordedCameraFor(scenario) {
  const filename = path.join(repoRoot, 'tests/parity/golden', scenario, 'camera.json');
  if (!existsSync(filename)) return null;
  const recording = JSON.parse(readFileSync(filename, 'utf8'));
  if (recording.apply === false) return null;
  const anchors = Array.isArray(recording.frames) ? recording.frames : [];
  if (anchors.length === 0) return null;
  const canvas = JSON.parse(requireRead(`tests/parity/golden/${scenario}/canvas.json`));
  const frames = canvas.frames.map((frame, index) => recoverCameraProjection(frame,
    anchors.find(anchor => anchor.captureTime === frame.time) ?? anchors[index]));
  if (frames.some(frame => frame === null)) throw new Error(`${scenario}: missing measured camera projection`);
  return { filename, frames };
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-first-run', '--disable-background-networking'],
});
const report = { evidence: await evidence(), generatedAt: new Date().toISOString(), scenarios: [], passed: true };
try {
  for (const scenario of selected) {
    const state = engineStateFor(scenario);
    console.log(`[render] ${scenario}: replaying ${state.packets.length} encoded snapshots`);
    const recordedCamera = cameraMode === 'off' ? null : recordedCameraFor(scenario);
    if (cameraMode === 'on' && recordedCamera === null) {
      console.error(`[parity] no usable camera.json for ${scenario}`);
    }
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // Match the archived page's entropy as well as the worker's fixed input.
    // Menu particles seed their own generator from crypto.getRandomValues.
    await page.addInitScript({
      content: stripExports(await readFile(new URL('./deterministic-entropy.js', import.meta.url), 'utf8'))
        + '\ninstallDeterministicEntropy();',
    });
    await page.addInitScript({
      content: stripExports(await readFile(new URL('./virtual-clock.js', import.meta.url), 'utf8'))
        + '\ninstallVirtualClock({ epoch: Date.UTC(2024, 0, 1, 0, 0, 0), frameMs: 16 });',
    });
    await page.addInitScript({
      content: stripExports(await readFile(new URL('./canvas-trace.js', import.meta.url), 'utf8'))
        + '\ninstallCanvasTrace({ captureFrames: 3 });',
    });
    await page.goto(origin + '/index.html', { waitUntil: 'load' });
    await page.evaluate(() => new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        if (window.__florr !== undefined && document.getElementById('status') === null) resolve(true);
        else if (++attempts > 200) reject(new Error('client boot timeout'));
        else window.__realSetTimeout(check, 50);
      };
      check();
    }));
    await page.evaluate(() => window.__florr.freeze());
    // Use the same bytes/decoder/receiver as the live game, including all
    // sparse fields and events. The isolated test pins only the camera; the
    // production runner separately checks real worker transport and follow.
    await page.evaluate(() => window.__florr.setSnapshot([]));
    const captures = state.frames;
    const captureStart = captures[0];
    await page.evaluate(({ packets, cameras, captureStart, steps, bootTime }) => {
      // The archived frame drains its incoming queue before drawing. A flush
      // response produced after rAF becomes visible on the next frame.
      for (const packet of packets) {
        const applyAt = packet.at + 16;
        setTimeout(() => {
          if (!window.__florr.applyPacketAt(packet.bytes, applyAt))
            throw new Error(`snapshot decode failed at ${applyAt}`);
        }, Math.max(0, applyAt - 0.001));
      }
      for (const camera of cameras) setTimeout(() =>
        window.__florr.setRenderCamera(camera.x, camera.y, camera.zoom,
          camera.entityOffsetX ?? 0, camera.entityOffsetY ?? 0),
        Math.max(0, camera.captureTime - 0.002));
      // Input is part of presentation state too: native mouse pan and UI
      // controls must see the scenario's real events, even with a pinned
      // camera and an isolated server-byte replay.
      let at = bootTime;
      let mouse = { x: 0, y: 0 };
      for (const step of steps) {
        if (step.advance) { at += step.advance * 16; continue; }
        if (step.mouseMove) {
          mouse = step.mouseMove;
          setTimeout(() => document.getElementById('canvas').dispatchEvent(
            new PointerEvent('pointermove', { clientX: step.mouseMove.x, clientY: step.mouseMove.y, bubbles: true })), at);
        }
        const coordinates = { clientX: mouse.x, clientY: mouse.y };
        if (step.mouseDown || step.mouseUp) setTimeout(() => {
          const down = !!step.mouseDown, button = (step.mouseDown ?? step.mouseUp) === 'right' ? 2 : 0;
          (down ? document.getElementById('canvas') : window).dispatchEvent(
            new PointerEvent(down ? 'pointerdown' : 'pointerup', { ...coordinates, button, bubbles: true }));
        }, at);
        if (step.key && step.key !== 'Enter') setTimeout(() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { code: step.key }));
          window.dispatchEvent(new KeyboardEvent('keyup', { code: step.key }));
        }, at);
      }
      setTimeout(() => window.__canvasTrace.reset({ captureFrames: 3 }), captureStart - 0.003);
    }, { packets: state.packets, cameras: recordedCamera?.frames ?? [], captureStart,
      steps: scenarioByName(scenario).steps, bootTime: BOOT_FRAMES * 16 });
    await page.evaluate(at => window.__virtualClock.advance(at), captures.at(-1));
    const appliedCamera = await page.evaluate(() => window.__florr.getCamera());
    const decoded = await page.evaluate(() => ({
      entities: window.__florr.world.count,
      pan: { x: window.__florr.camera.panX, y: window.__florr.camera.panY },
      players: Array.from(window.__florr.world.all()).filter(entity => entity.kind === 1)
        .map(({ handle, x, y, kind, speciesId, health, level, levelProgress }) =>
          ({ handle, x, y, kind, speciesId, health, level, levelProgress })),
    }));
    const canvas = await page.evaluate(name => window.__canvasTrace.export({
      scenario: name, viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3,
    }), scenario);
    const screenshot = await page.locator('#canvas').screenshot({ type: 'png' });
    const directory = path.join(output, scenario);
    const entry = {
      name: scenario,
      ticks: state.ticks,
      entities: state.entities,
      input: { kind: 'encoded-engine-snapshots', packets: state.packets.length },
      decoded,
      errors,
      canvas: { digest: canvas.digest, totalOps: canvas.totalOps },
      screenshot: { sha256: createHash('sha256').update(screenshot).digest('hex') },
      camera: recordedCamera === null
        ? { injected: false, mode: cameraMode }
        : { injected: true, mode: cameraMode, source: path.relative(repoRoot, recordedCamera.filename), frames: recordedCamera.frames.length, applied: appliedCamera },
    };
    // Screenshots and traces are always written: `parity:visual` diffs these
    // artifacts against the archived-client golden. `--update` now only marks
    // the entry as a deliberate re-record in the report.
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'canvas.json'), JSON.stringify(canvas) + '\n');
    if (flag('--dump-client-state')) {
      const clientState = await page.evaluate(() => ({ now: performance.now(),
        camera: window.__florr.getCamera(),
        entities: Array.from(window.__florr.world.all()) }));
      await writeFile(path.join(directory, 'client-state.json'), JSON.stringify(clientState) + '\n');
    }
    await writeFile(path.join(directory, 'screenshot.png'), screenshot);
    await writeFile(path.join(directory, 'meta.json'), JSON.stringify({
      scenario, ticks: state.ticks, entities: state.entities, viewport,
    }, null, 2) + '\n');
    if (update) entry.updated = true;
    if (errors.length || scenario !== 'boot-menu' && !decoded.players.length) report.passed = false;
    report.scenarios.push(entry);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
