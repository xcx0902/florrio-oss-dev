#!/usr/bin/env node
/**
 * Archived original client + reconstructed C++ engine worker integration.
 *
 * Serves `web/` as the client root, but resolves `server-worker.js` and
 * `server.wasm` from the accepted `dist-next/`. An init script redirects the original
 * client's `new Worker("sp_server.js")` to `server-worker.js` and records the
 * worker envelope so protocol/decode failures are observable. The unchanged
 * client must receive world/controller metadata, render a bound avatar, move,
 * attack, defend, die and restart, including multi-byte snapshot sequences.
 * This integration evidence is separate from original pixel/Canvas parity.
 *
 * Usage:
 *   node tools/parity/run-original-engine.mjs --scenario garden-idle
 *   node tools/parity/run-original-engine.mjs --all
 */
import { chromiumExecutable } from '../lib/chromium.mjs';
import http from 'node:http';
import path from 'node:path';
import { evidence } from '../verification-evidence.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { scenarios, scenarioByName, BOOT_FRAMES } from './scenarios.mjs';
import { findOriginalClientState, readOriginalClientState } from './original-client-state.mjs';
import { originalClientChecks } from './original-client-checks.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.lastIndexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const flag = name => args.includes(name);
const root = path.resolve(option('--root', 'web'));
const engineRoot = path.resolve(option('--engine-root', 'dist-next'));
const output = path.resolve(option('--out', 'tests/parity/original-engine'));
const viewport = { width: 1280, height: 720 };
const startGame = flag('--start');
const minimal = process.env.MINIMAL === '1';
const frameMs = 16;
const selected = flag('--all')
  ? scenarios
  : args.filter((value, index) => index > 0 && args[index - 1] === '--scenario')
    .flatMap(name => [scenarioByName(name)]);
if (!selected.length) throw new Error('choose --scenario NAME or --all');

const reportFile = path.join(output, selected.length === scenarios.length ? 'report.json' : 'report-partial.json');
const report = { generatedAt: new Date().toISOString(), scenarios: [], passed: false, status: 'running',
  kind: 'original-client-integration', equivalence: false,
  engineRoot: path.relative(process.cwd(), engineRoot),
  reportOnly: minimal || startGame || process.env.POKE_CONNECTED === '1' };
await mkdir(output, { recursive: true });
await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
let server, browser;
try {
  Object.assign(report, { evidence: await evidence(),
    engineWasmSha256: createHash('sha256').update(await readFile(path.join(engineRoot, 'server.wasm'))).digest('hex') });
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};
server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
    let filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (pathname === '/server-worker.js') filename = path.join(engineRoot, 'server-worker.js');
    else if (pathname === '/server.wasm') filename = path.join(engineRoot, 'server.wasm');
    else if (pathname === '/minimal-worker.js') filename = path.join(path.dirname(new URL(import.meta.url).pathname), 'minimal-original-worker.js');
    const allowed = pathname === '/server-worker.js' || pathname === '/server.wasm'
      ? filename.startsWith(engineRoot + path.sep)
      : pathname === '/minimal-worker.js' || filename.startsWith(root + path.sep);
    if (!allowed) { response.writeHead(403).end(); return; }
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
  throw new Error('playwright-core is required');
}
const { chromium } = await import(pathToFileURL(await playwrightPath()).href);
const chromePath = chromiumExecutable();
const stripExports = source => source.replace(/^export function /gm, 'function ');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

const workerBridge = `(() => {
  const NativeWorker = window.Worker;
  const log = { created: [], sent: [], received: [], errors: [], responses: 0, dataPackets: 0, packets: [], inputButtons: [] };
  const workers = [];
  window.__enginePending = 0;
  window.__engineWorkerLog = log;
  window.__engineWorkers = workers;
  window.Worker = class EngineWorker extends NativeWorker {
    constructor(url, options) {
      const original = String(url);
      const redirected = window.__engineMinimal
        ? 'minimal-worker.js'
        : (original.includes('sp_server') ? 'server-worker.js?manual=1&original=1' : original);
      super(redirected, options);
      workers.push(this);
      log.created.push({ original, redirected });
      this.addEventListener('message', event => {
        const data = event.data ?? {};
        log.received.push({ funcName: data.funcName, callbackId: data.callbackId,
          finalResponse: data.finalResponse, size: data.data?.byteLength ?? 0 });
        if (data.error) log.errors.push(String(data.error));
        if (data.finalResponse) { log.responses += 1; window.__enginePending--; } else log.dataPackets += 1;
        if (data.data && data.data.byteLength) {
          const bytes = new Uint8Array(data.data);
          log.packets.push({ size: bytes.length, head: Array.from(bytes.slice(0, 96), value => value.toString(16).padStart(2, '0')).join('') });
          if (!log.packetHexes) log.packetHexes = [];
          if (log.packetHexes.length < 4 && bytes.length <= 131072)
            log.packetHexes.push(Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''));
          if (log.packets.length > 12) log.packets.shift();
        }
        if (log.received.length > 2000) log.received.splice(0, log.received.length - 2000);
      });
      this.addEventListener('error', event => log.errors.push(event.message || 'worker error'));
    }
    postMessage(message, transfer) {
      if (message && typeof message === 'object') {
        log.sent.push({ funcName: message.funcName, callbackId: message.callbackId,
          size: message.data?.byteLength ?? 0 });
        if (log.sent.length > 2000) log.sent.splice(0, log.sent.length - 2000);
      }
      if (message?.funcName === 'sp_server_send' && message.data) {
        const packet = Array.from(new Uint8Array(message.data.buffer ?? message.data,
          message.data.byteOffset ?? 0, message.data.byteLength));
        const bytes = packet.map((byte, index) => byte ^ window.__enginePacketKey[index % 256]);
        let at = 0;
        const varint = () => { let value = 0, shift = 0; while (at < bytes.length && shift <= 28) {
          const byte = bytes[at++]; value |= (byte & 127) << shift;
          if (!(byte & 128)) return value >>> 0; shift += 7;
        } return null; };
        varint();
        if (varint() === 12) log.inputButtons.push({ at: performance.now(), buttons: varint() });
      }
      window.__enginePending++;
      return super.postMessage(message, transfer);
    }
  };
  window.Worker.prototype = NativeWorker.prototype;
})();
`;

browser = await chromium.launch({ executablePath: chromePath, headless: true,
  args: ['--no-first-run', '--disable-background-networking'] });

// The snapshot key is the 256-byte table the archived server keeps at data
// address 4576; source/semantic/server-catalogs.json records it verbatim.
const snapshotKey = Buffer.from(JSON.parse(await readFile(
  new URL('../../source/semantic/server-catalogs.json', import.meta.url), 'utf8')).packetXorKeyHex, 'hex');

/** Header-only observation; successful native WASM decode and gameplay are
 * required separately. This is not a reimplementation of its entity parser. */
function decodeSnapshotPacket(hex) {
  try {
    const bytes = Buffer.from(hex, 'hex');
    if (bytes[0] !== 1) throw new Error('snapshot type');
    let offset = 1, sequence = 0, shift = 0, byte;
    do {
      if (offset >= bytes.length || shift > 28) throw new Error('snapshot sequence');
      byte = bytes[offset++]; sequence |= (byte & 127) << shift; shift += 7;
    } while (byte & 128);
    if (offset >= bytes.length) throw new Error('empty snapshot payload');
    return { ok: true, sequence: sequence >>> 0, packetBytes: bytes.length,
      scope: 'header; entity decode is verified in the unchanged original client WASM' };
  } catch (error) { return { ok: false, error: String(error) }; }
}

  for (const scenario of selected) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
    const consoleErrors = [], samples = [], lifecycle = {}, deviations = [];
    let gameFrames = 0, gamePaint = null;
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(String(error)));
    await page.addInitScript({
      content: stripExports(await readFile(new URL('./client-wasm.js', import.meta.url), 'utf8'))
        + '\ninstallClientWasmProbe();',
    });
    await page.addInitScript({
      content: stripExports(await readFile(new URL('./pinned-ua.js', import.meta.url), 'utf8'))
        + '\ninstallPinnedUserAgent({});',
    });
    await page.addInitScript({
      content: stripExports(await readFile(new URL('./virtual-clock.js', import.meta.url), 'utf8'))
        + '\ninstallVirtualClock({ epoch: Date.UTC(2024, 0, 1, 0, 0, 0), frameMs: 16 });',
    });
    await page.addInitScript(key => { window.__enginePacketKey = key; }, Array.from(snapshotKey));
    await page.addInitScript({ content: workerBridge });
    if (startGame) await page.addInitScript({ content: `window.__engineStart = true;` });
    if (minimal) await page.addInitScript({ content: 'window.__engineMinimal = true;' });
    await page.addInitScript({
      content: stripExports(await readFile(new URL('./canvas-trace.js', import.meta.url), 'utf8'))
        + `\ninstallCanvasTrace({ captureFrames: 3 });
          const tracedAnimationFrame = window.requestAnimationFrame;
          window.requestAnimationFrame = callback => tracedAnimationFrame(timestamp => {
            try { callback(timestamp); } finally {
              const probe = window.__clientWasm;
              if (!window.__originalState && probe?.memory && window.__engineWorkerLog?.dataPackets)
                window.__originalState = window.__findOriginalState?.(probe);
              const state = window.__readOriginalState?.(probe, window.__originalState);
              // This runs synchronously inside this RAF, before any worker
              // response can mutate the state. The outer tracer then finalizes
              // this exact frame's commands and digest.
              window.__originalPaintState = { frame: window.__canvasTrace.state.frame, time: timestamp, state };
            }
          });`,
    });
    await page.goto(origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.evaluate(([find, read]) => {
      window.__findOriginalState = (0, eval)(`(${find})`);
      window.__readOriginalState = (0, eval)(`(${read})`);
    }, [findOriginalClientState.toString(), readOriginalClientState.toString()]);
    const readState = () => page.evaluate(() => {
      const probe = window.__clientWasm;
      if (!window.__originalState && probe?.memory && window.__engineWorkerLog.dataPackets)
        window.__originalState = window.__findOriginalState(probe);
      const state = window.__readOriginalState(probe, window.__originalState);
      return state ? { ...state, inputButtons: window.__engineWorkerLog.inputButtons.at(-1)?.buttons ?? null } : null;
    });
    const advance = async frames => {
      for (let frame = 0; frame < frames; frame++) {
        await page.evaluate(ms => window.__virtualClock.advance(ms), frameMs);
        await page.evaluate(() => new Promise((resolve, reject) => {
          let attempts = 0;
          const poll = () => {
            if (window.__enginePending === 0) return resolve();
            if (++attempts > 3000) return reject(new Error(`Worker drain timeout (${window.__enginePending})`));
            window.__realSetTimeout(poll, 1);
          };
          poll();
        }));
        const state = await readState();
        if (state) {
          samples.push(state);
          if (state.worldReady && state.controlledBodyValid) gameFrames++;
          if (!gamePaint) {
            const paint = await page.evaluate(() => {
              const capture = window.__originalPaintState;
              const trace = window.__canvasTrace.export({ frames: 1 });
              const frame = trace.frames.at(-1), digest = trace.frameDigests.at(-1);
              if (!capture?.state?.controlLinkValid || !(capture.state.player?.health > 0)
                || !(capture.state.mainWorldAlpha >= 0.0001) || !frame || !digest
                || capture.frame !== frame.frame || capture.time !== frame.time
                || digest.frame !== frame.frame || digest.time !== frame.time) return null;
              const ops = frame.ops;
              return { frame: frame.frame, time: frame.time, stateFrame: capture.frame, stateTime: capture.time,
                state: capture.state, ops: ops.length, paintOps: ops.filter(op => op[0] === 0
                && ['fill', 'stroke', 'drawImage', 'fillRect'].includes(op[1])).length,
                digest: digest.digest };
            });
            if (paint?.paintOps > 0) gamePaint = paint;
          }
        }
      }
    };
    // Quiet-window verification supplements the per-frame callback drain.
    const drain = async (quietMs = 300, capMs = 20000) => {
      const start = Date.now();
      let last = -1, stable = 0;
      while (Date.now() - start < capMs) {
        const count = await page.evaluate(() => window.__engineWorkerLog.received.length);
        if (count === last) { stable += 100; if (stable >= quietMs) return count; }
        else { last = count; stable = 0; }
        await page.waitForTimeout(100);
      }
      return last;
    };
    // Give the real worker time to instantiate the wasm module before the
    // virtual clock starts driving client frames.
    await page.waitForFunction(() => window.__engineWorkerLog?.created.length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    if (startGame) await page.keyboard.press('Enter');
    // Drive the engine tick from the virtual clock: one think every 50 ms. The
    // worker was loaded with ?manual=1 so it does not also run a real timer.
    await page.evaluate(() => {
      window.setInterval(() => {
        for (const worker of window.__engineWorkers) {
          worker.postMessage({ funcName: 'sp_server_think', callbackId: -1, data: 0 });
        }
      }, 50);
    });
    await advance(BOOT_FRAMES);
    await drain();
    for (const step of scenario.steps) {
      if (step.advance) { await advance(step.advance); await drain(); }
      if (step.key) await page.keyboard.press(step.key);
      if (step.mouseMove) await page.mouse.move(step.mouseMove.x, step.mouseMove.y);
      if (step.mouseDown) await page.mouse.down({ button: step.mouseDown });
      if (step.mouseUp) await page.mouse.up({ button: step.mouseUp });
      if (step.reset) await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
    }
    await page.waitForTimeout(200);
    const log = await page.evaluate(() => window.__engineWorkerLog);
    if (scenario.name === 'death') {
      // Add a real lifecycle after the unchanged golden input sequence. Death
      // uses a disclosed opcode-3 command only when needed; no memory/world poke.
      if (!(await readState())?.player) { await page.keyboard.press('Enter'); await advance(30); }
      lifecycle.beforeMove = await readState();
      await page.mouse.move(1100, 360); await advance(30);
      lifecycle.afterMove = await readState();
      await page.mouse.down({ button: 'left' }); await advance(20);
      lifecycle.attacking = await readState(); await page.mouse.up({ button: 'left' });
      await page.mouse.down({ button: 'right' }); await advance(20);
      lifecycle.defending = await readState(); await page.mouse.up({ button: 'right' });
      lifecycle.beforeDeath = await readState();
      if (lifecycle.beforeDeath?.player?.health > 0) {
        deviations.push('After the original scenario and trusted movement/attack/defend input, opcode-3 suicide drives the real server death/removal path; this does not claim natural mob death.');
        const packet = Uint8Array.from([0, 3, 0], (byte, index) => byte ^ snapshotKey[index]);
        await page.evaluate(bytes => window.__engineWorkers[0].postMessage({
          funcName: 'sp_server_send', callbackId: -2, data: Uint8Array.from(bytes) }), Array.from(packet));
      }
      const deathStart = samples.length;
      await advance(90); lifecycle.dead = await readState();
      lifecycle.corpse = samples.slice(deathStart).find(state => state.player?.handle === lifecycle.beforeDeath?.player?.handle
        && state.player?.health <= 0 && (state.player?.visualFlags & 1) !== 0) ?? null;
      await page.screenshot({ path: path.join(output, 'death-observed.png') });
      await page.keyboard.press('Enter'); await advance(30);
      lifecycle.restarted = await readState();
    }
    const finalLog = await page.evaluate(() => window.__engineWorkerLog);
    Object.assign(log, finalLog);
    const snapshotHex = (log.packetHexes || [])[0] || '';
    const decode = decodeSnapshotPacket(snapshotHex);
    const clientState = await readState();
    // The original client draws "Connecting..." on the canvas rather than in
    // the DOM. The name-input field is a white box at (640, 335); use its pixel
    // as the connected/menu probe.
    const menuPixel = await page.evaluate(() => {
      const canvas = document.querySelector('#canvas');
      const context = canvas.getContext('2d');
      return [...context.getImageData(640, 335, 1, 1).data];
    });
    const connected = menuPixel[0] > 200 && menuPixel[1] > 200 && menuPixel[2] > 200;
    const canvas = await page.evaluate(([name, size, ms]) => window.__canvasTrace.export({
      scenario: name, viewport: size, frameMs: ms, frames: 3,
    }), [scenario.name, viewport, frameMs]);
    const screenshot = await page.screenshot({ type: 'png' });
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, `${scenario.name}.png`), screenshot);
    const sent = log.sent;
    const byFunction = {};
    for (const entry of sent) byFunction[entry.funcName] = (byFunction[entry.funcName] ?? 0) + 1;
    const receivedByFunction = {};
    for (const entry of log.received) receivedByFunction[entry.funcName] = (receivedByFunction[entry.funcName] ?? 0) + 1;
    const probe = { found: clientState !== null && samples.length > 0 };
    const entry = {
      scenario: scenario.name,
      description: scenario.description,
      worker: { created: log.created, sent: byFunction, received: receivedByFunction,
        responses: log.responses, dataPackets: log.dataPackets, errors: log.errors },
      decode, probe, clientState, samples, lifecycle, deviations,
      canvas: { digest: canvas.digest, totalOps: canvas.totalOps, frames: canvas.frameDigests.length, gameFrames, gamePaint },
      screenshot: { sha256: hash(screenshot), bytes: screenshot.length },
      connected,
      menuPixel,
      consoleErrors,
      packetSizes: log.packets.map(packet => packet.size),

    };
    entry.checks = originalClientChecks(entry);
    entry.issues = Object.entries(entry.checks).filter(([, value]) => !value).map(([key]) => key);
    entry.passed = entry.issues.length === 0;
    if (!entry.passed) report.passed = false;
    report.scenarios.push(entry);
    console.log(JSON.stringify({ scenario: entry.scenario, checks: entry.checks, passed: entry.passed, clientState: entry.clientState, deviations }));
    await page.close();
  }
  report.passed = report.scenarios.length === selected.length && report.scenarios.every(row => row.passed);
} catch (error) {
  report.passed = false; report.error = String(error.stack || error);
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch (error) { report.passed = false; report.cleanupError = String(error); }
  if (server?.listening) await new Promise(resolve => server.close(resolve));
}
report.status = report.passed ? 'pass' : 'fail';
report.finishedAt = new Date().toISOString();
if (report.error) console.error(report.error);
await mkdir(output, { recursive: true });
await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, scenarios: report.scenarios.length }, null, 2));
if (!report.passed) process.exitCode = 1;
