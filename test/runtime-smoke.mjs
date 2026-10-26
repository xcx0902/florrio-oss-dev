#!/usr/bin/env node
/**
 * A bounded, offline browser smoke test for the archived game and rebuilt game.
 * Uses an owned temporary Chrome profile; never attaches to the user's browser.
 * Seeded entropy makes initial packets repeatable. Real clocks and independent
 * worker scheduling remain, so gameplay screenshots are evidence, not goldens.
 *
 * node test/runtime-smoke.mjs --root web --label baseline
 * node test/runtime-smoke.mjs --root dist --label rebuilt --compare reports/runtime/baseline.json --source source/javascript
 * Optional: PLAYWRIGHT_CORE=/absolute/path/to/playwright-core/index.mjs
 *           CHROME_PATH=/absolute/path/to/Chrome
 */
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { runtimeBootstrap } from '../tools/lib/readable-wasm.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const position = args.indexOf(name);
  return position < 0 ? fallback : args[position + 1];
};
const root = path.resolve(option('--root', 'dist'));
const highLevelBuild = args.includes('--readable');
const label = option('--label', path.basename(root));
if (!/^[\w-]+$/.test(label)) throw new Error('Use a label containing letters, digits, underscores, or hyphens.');
const output = path.resolve(option('--output', 'reports/runtime'));
const readableSource = option('--source', null);
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!existsSync(path.join(root, 'index.html'))) throw new Error(`Missing ${root}/index.html. Build the game first.`);

async function playwrightPath() {
  if (process.env.PLAYWRIGHT_CORE) return process.env.PLAYWRIGHT_CORE;
  for (const local of ['node_modules/playwright-core/index.mjs', 'node_modules/playwright/node_modules/playwright-core/index.mjs']) {
    if (existsSync(local)) return path.resolve(local);
  }
  const cache = path.join(os.homedir(), '.npm', '_npx');
  for (const entry of await readdir(cache).catch(() => [])) {
    const candidate = path.join(cache, entry, 'node_modules/playwright-core/index.mjs');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('playwright-core unavailable. Set PLAYWRIGHT_CORE to an existing installation. This test does not download software.');
}

// Applied only within the owned smoke-test processes, never to source assets.
function seedEntropy() {
  let seed = 0x6f6c6446;
  function next() {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return seed >>> 0;
  }
  Math.random = () => next() / 4294967296;
  Object.defineProperty(crypto, 'getRandomValues', {
    configurable: true,
    value(array) {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) bytes[i] = next() & 255;
      return array;
    },
  });
}

function observePage(options = {}) {
  const probe = window.__runtimeSmoke = {
    workers: [], packets: [], packetCount: { toWorker: 0, fromWorker: 0 },
    errors: [], inputs: [], drawCalls: 0, externalSockets: [],
    stage: 'startup', packetPayloads: [],
  };
  const capturedPerStage = {};
  function packet(direction, worker, value) {
    probe.packetCount[direction]++;
    if (probe.packets.length >= 2000) return;
    let bytes = null;
    if (value && value.data) {
      const data = value.data;
      if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (Array.isArray(data)) bytes = new Uint8Array(data);
    }
    let hash = 2166136261;
    if (bytes) for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    probe.packets.push({
      direction, worker, funcName: value?.funcName ?? null,
      callbackId: value?.callbackId ?? null, finalResponse: value?.finalResponse ?? null,
      length: bytes?.length ?? 0, fnv1a32: hash.toString(16).padStart(8, '0'),
      prefix: bytes ? Array.from(bytes.subarray(0, 12)) : [],
    });
    const captureKey = `${probe.stage}:${direction}`;
    if (options.capturePackets && bytes?.length && bytes.length <= 262144 && (capturedPerStage[captureKey] ?? 0) < 3) {
      capturedPerStage[captureKey] = (capturedPerStage[captureKey] ?? 0) + 1;
      probe.packetPayloads.push({ stage: probe.stage, direction, worker,
        funcName: value?.funcName ?? null, callbackId: value?.callbackId ?? null,
        finalResponse: value?.finalResponse ?? null, bytes: Array.from(bytes) });
    }
  }
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      this.__smokeIndex = probe.workers.length;
      probe.workers.push(String(url));
      this.addEventListener('message', event => packet('fromWorker', this.__smokeIndex, event.data));
      this.addEventListener('error', event => probe.errors.push(`worker: ${event.message}`));
    }
    postMessage(value, ...rest) {
      packet('toWorker', this.__smokeIndex, value);
      return super.postMessage(value, ...rest);
    }
  };
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(url, ...rest) {
      probe.externalSockets.push(String(url));
      super(url, ...rest);
    }
  };
  addEventListener('error', event => probe.errors.push(String(event.message)));
  addEventListener('unhandledrejection', event => probe.errors.push(String(event.reason)));
  for (const type of ['keydown', 'keyup', 'mousemove', 'mousedown', 'mouseup', 'wheel']) {
    addEventListener(type, event => {
      if (probe.inputs.length < 100) probe.inputs.push({
        type, key: event.key ?? null, button: event.button ?? null,
        x: event.clientX ?? null, y: event.clientY ?? null, trusted: event.isTrusted,
      });
    }, true);
  }
  for (const type of ['CanvasRenderingContext2D', 'WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const prototype = window[type]?.prototype;
    for (const method of ['fill', 'stroke', 'fillRect', 'fillText', 'drawImage', 'drawArrays', 'drawElements']) {
      if (!prototype || typeof prototype[method] !== 'function') continue;
      const original = prototype[method];
      prototype[method] = function (...values) {
        probe.drawCalls++;
        return Reflect.apply(original, this, values);
      };
    }
  }
}

const mime = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    let body = await readFile(filename);
    if (path.basename(filename) === 'sp_server.js') body = Buffer.concat([Buffer.from(`;(${seedEntropy})();\n`), body]);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end('Not found'); }
});

await mkdir(output, { recursive: true });
const { chromium } = await import(pathToFileURL(await playwrightPath()).href);
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const result = {
  label, root, createdAt: new Date().toISOString(),
  coverage: 'Bounded startup and synthetic browser-input smoke test; no assertion of complete gameplay coverage or pixel-identical behavior.',
  instrumentation: 'Seeded Math.random and crypto entropy in main page and local server worker; real browser clocks and independent scheduling.',
  requests: [], failedRequests: [], console: [], pageErrors: [], checkpoints: [], checks: {},
};
result.sourceArtifacts = Object.fromEntries(await Promise.all(
  ['index.html', 'client.js', 'client.wasm', 'sp_server.js', 'sp_server.wasm'].map(async name => {
    const bytes = await readFile(path.join(root, name));
    return [name, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }];
  }),
));
if (readableSource) {
  result.readableSourceArtifacts = Object.fromEntries(await Promise.all(
    ['client.js', 'sp_server.js'].map(async name => {
      const bytes = await readFile(path.resolve(readableSource, name));
      return [name, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }];
    }),
  ));
}
try {
  browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--no-first-run', '--disable-background-networking', '--disable-component-update'] });
  result.browser = await browser.version();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
  await context.route('**/*', route => {
    const url = route.request().url();
    result.requests.push(url.replace(origin, '<origin>'));
    return url.startsWith(origin + '/') || url.startsWith('data:') || url.startsWith('blob:') ? route.continue() : route.abort('blockedbyclient');
  });
  await context.addInitScript(seedEntropy);
  await context.addInitScript(observePage, { capturePackets: Boolean(option('--capture-packets', null)) });
  const page = await context.newPage();
  page.on('console', message => result.console.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', error => result.pageErrors.push(String(error)));
  page.on('requestfailed', request => result.failedRequests.push({ url: request.url().replace(origin, '<origin>'), error: request.failure()?.errorText }));
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForFunction(() => window.__runtimeSmoke.drawCalls > 100 && window.Module?.HEAPU8?.length > 0, undefined, { timeout: 45000 });
  await page.waitForTimeout(1000);
  async function checkpoint(name) {
    const snapshot = await page.evaluate(() => ({
      ...window.__runtimeSmoke,
      canvas: { width: document.querySelector('#canvas')?.width, height: document.querySelector('#canvas')?.height, visible: getComputedStyle(document.querySelector('#canvas')).display !== 'none' },
      loadingVisible: document.querySelector('#loading').checkVisibility(),
      errorVisible: document.querySelector('#errorDialog').checkVisibility(),
      heapBytes: window.Module?.HEAPU8?.length ?? 0,
      storageKeys: Object.keys(localStorage).sort(),
    }));
    // Avoid duplicating the whole packet trace at every checkpoint.
    const { packets, inputs, packetPayloads, ...state } = snapshot;
    const image = await page.screenshot({ path: path.join(output, `${label}-${name}.png`) });
    result.checkpoints.push({ name, ...state, inputCount: inputs.length, screenshotSha256: createHash('sha256').update(image).digest('hex') });
    return snapshot;
  }
  await checkpoint('menu');
  await page.evaluate(() => { window.__runtimeSmoke.stage = 'spawn'; });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__runtimeSmoke.workers.length > 0 && window.__runtimeSmoke.packetCount.fromWorker > 5, undefined, { timeout: 45000 });
  await page.waitForTimeout(1000);
  await checkpoint('spawn');
  await page.mouse.move(1040, 260, { steps: 8 });
  await page.waitForTimeout(350);
  await page.evaluate(() => { window.__runtimeSmoke.stage = 'attack'; });
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(500);
  await checkpoint('attack');
  await page.mouse.up({ button: 'left' });
  await page.evaluate(() => { window.__runtimeSmoke.stage = 'defend'; });
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(500);
  await checkpoint('defend');
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => { window.__runtimeSmoke.stage = 'inventory-key'; });
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(250);
  await checkpoint('inventory-key');
  await page.keyboard.press('Digit1');
  await page.keyboard.press('KeyI');
  await page.evaluate(() => { window.__runtimeSmoke.stage = 'wheel'; });
  await page.mouse.wheel(0, 175);
  await page.waitForTimeout(150);
  await checkpoint('wheel');
  await page.mouse.move(640, 400, { steps: 8 });
  await page.waitForTimeout(500);
  const final = await checkpoint('final');
  if (option('--capture-packets', null)) await writeFile(path.resolve(option('--capture-packets')),
    JSON.stringify({ sourceArtifacts: result.sourceArtifacts, instrumentation: result.instrumentation,
      packets: final.packetPayloads }, null, 2) + '\n');
  result.packets = final.packets;
  result.inputs = final.inputs;
  result.packetCount = final.packetCount;
  result.workerFunctions = [...new Set(final.packets.filter(event => event.funcName).map(event => event.funcName))].sort();
  result.checks = {
    canvasVisible: final.canvas.visible,
    runtimeStarted: final.heapBytes > 0 && final.drawCalls > 100,
    serverWorkerSpawned: final.workers.some(url => url.includes('sp_server.js')),
    bidirectionalWorkerPackets: final.packetCount.toWorker > 5 && final.packetCount.fromWorker > 5,
    continuedRendering: result.checkpoints.at(-1).drawCalls > result.checkpoints[1].drawCalls,
    noPageOrWorkerErrors: result.pageErrors.length === 0 && final.errors.length === 0 && !final.errorVisible,
    noExternalRequests: result.requests.every(url => url.startsWith('<origin>/') || url.startsWith('data:') || url.startsWith('blob:')) && final.externalSockets.length === 0,
    noFailedRequests: result.failedRequests.length === 0,
    trustedMovement: final.inputs.some(event => event.type === 'mousemove' && event.trusted),
    trustedAttack: final.inputs.some(event => event.type === 'mousedown' && event.button === 0 && event.trusted),
    trustedDefense: final.inputs.some(event => event.type === 'mousedown' && event.button === 2 && event.trusted),
    trustedInventoryKey: final.inputs.some(event => event.type === 'keydown' && event.key.toLowerCase() === 'i' && event.trusted),
    trustedWheel: final.inputs.some(event => event.type === 'wheel' && event.trusted),
  };
  if (readableSource) {
    result.checks.deployedJavaScriptMatchesReadableSource = (await Promise.all(['client', 'sp_server'].map(async name => {
      const source = await readFile(path.resolve(readableSource, name + '.js'), 'utf8');
      const expected = (highLevelBuild ? runtimeBootstrap(name) : '') + source;
      return result.sourceArtifacts[name + '.js'].sha256 === createHash('sha256').update(expected).digest('hex');
    }))).every(Boolean);
  }
  if (highLevelBuild) {
    const client = await page.evaluate(() => globalThis.__florrReadable ?? null);
    const workers = await Promise.all(page.workers().map(worker => worker.evaluate(() => globalThis.__florrReadable ?? null)));
    result.highLevelExecution = { client, workers };
    result.checks.highLevelClientFunctionsExecuted = (client?.calls?.[1096] ?? 0) > 0 && (client?.calls?.[3310] ?? 0) > 0;
    result.checks.highLevelServerFunctionsExecuted = workers.some(worker =>
      Object.keys(worker?.calls ?? {}).length > 2 && Object.values(worker.calls).reduce((sum, value) => sum + value, 0) > 50);
    const modulePaths = [...new Set(result.requests.filter(url => url.endsWith('.mjs')).map(url => url.replace(/^<origin>\//, '')))];
    result.highLevelSourceArtifacts = {};
    for (const filename of modulePaths) {
      const deployed = await readFile(path.join(root, filename));
      const source = await readFile(path.resolve(readableSource || 'source/javascript', '..', filename));
      result.highLevelSourceArtifacts[filename] = {
        deployedSha256: createHash('sha256').update(deployed).digest('hex'),
        sourceSha256: createHash('sha256').update(source).digest('hex'),
      };
    }
    result.checks.highLevelModulesMatchSource = modulePaths.length > 0 && Object.values(result.highLevelSourceArtifacts).every(item => item.deployedSha256 === item.sourceSha256);
  }
  if (option('--compare', null)) {
    const previous = JSON.parse(await readFile(path.resolve(option('--compare')), 'utf8'));
    result.comparison = {
      baseline: previous.label,
      sameWorkerFunctions: JSON.stringify(result.workerFunctions) === JSON.stringify(previous.workerFunctions),
      sameRequestedResources: JSON.stringify([...new Set(result.requests.filter(url => !highLevelBuild ||
        !Object.hasOwn(result.highLevelSourceArtifacts, url.replace(/^<origin>\//, ''))))].sort()) === JSON.stringify([...new Set(previous.requests)].sort()),
      allBaselineChecksStillPass: Object.keys(previous.checks).every(key => result.checks[key] === true),
      sameFirstOutboundPacket: JSON.stringify(result.packets.find(event => event.direction === 'toWorker')) === JSON.stringify(previous.packets.find(event => event.direction === 'toWorker')),
      sameInitialHandshakeData: JSON.stringify(result.packets.find(event => event.direction === 'toWorker' && event.length > 0)) === JSON.stringify(previous.packets.find(event => event.direction === 'toWorker' && event.length > 0)),
      limitation: 'Real clocks and cross-thread ordering prevent treating packet counts, later payload hashes, or screenshot hashes as deterministic equality checks.',
    };
    result.checks.baselineContract = Object.entries(result.comparison).filter(([, value]) => typeof value === 'boolean').every(([, value]) => value);
  }
  result.passed = Object.values(result.checks).every(Boolean);
} catch (error) {
  result.passed = false;
  result.failure = String(error.stack || error);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(output, `${label}.json`), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify({ passed: result.passed, checks: result.checks, comparison: result.comparison, failure: result.failure, report: path.join(output, `${label}.json`) }, null, 2));
if (!result.passed) process.exitCode = 1;
