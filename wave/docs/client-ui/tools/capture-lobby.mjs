import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { defaultNative, startHost } from '../../../tools/w2/host.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const resolve = (...parts) => path.resolve(root, ...parts);
const snapshot = resolve('wave-reference/20221030');
const archive = process.env.WAVE_ARCHIVE ?? resolve('reports/wave/W0/wiki');
const nativeDir = process.env.WAVE_NATIVE ?? defaultNative;
const executablePath = process.env.CHROMIUM_PATH;
const output = process.argv[2] ?? (await mkdtemp(path.join(tmpdir(), 'wave-ui-lobby-')));
const manifest = JSON.parse(await readFile(resolve('wave/web/resources-20221030.json'), 'utf8'));
const resources = new Map();

assert(executablePath, 'Set CHROMIUM_PATH to the local Chromium executable');
await mkdir(output, { recursive: true });
for (const [dir, entries] of [
  [snapshot, manifest.snapshot],
  [archive, manifest.archive.filter(({ role }) => role !== 'archived-optional')],
]) {
  for (const { file, sha256, url, contentType } of entries) {
    const body = await readFile(path.join(dir, file));
    assert.equal(createHash('sha256').update(body).digest('hex'), sha256, file);
    resources.set(url, { body, contentType });
  }
}

function installTrace() {
  const surfaces = new WeakMap();
  const labels = new WeakMap();
  const paths = new WeakMap();
  let nextId = 1;
  let active = false;
  let frame = [];
  let last = [];
  const describe = (canvas) => {
    if (!surfaces.has(canvas)) {
      surfaces.set(canvas, canvas.id || nextId++);
    }
    return { id: surfaces.get(canvas), width: canvas.width, height: canvas.height };
  };
  const pathOps = ['moveTo', 'lineTo', 'arc', 'quadraticCurveTo', 'bezierCurveTo', 'closePath'];
  for (const key of pathOps) {
    const original = Path2D.prototype[key];
    Path2D.prototype[key] = function (...args) {
      if (!paths.has(this)) {
        paths.set(this, []);
      }
      paths.get(this).push([key, args]);
      return original.apply(this, args);
    };
  }
  const methods = [
    ...pathOps,
    'beginPath',
    'clearRect',
    'arcTo',
    'ellipse',
    'rect',
    'fill',
    'stroke',
    'fillRect',
    'strokeRect',
    'setTransform',
    'resetTransform',
    'translate',
    'scale',
    'rotate',
    'transform',
    'save',
    'restore',
    'clip',
    'fillText',
    'strokeText',
    'drawImage',
  ];
  const paint = new Set([
    'drawImage',
    'fillRect',
    'strokeRect',
    'fill',
    'stroke',
    'fillText',
    'strokeText',
  ]);
  for (const type of [CanvasRenderingContext2D, globalThis.OffscreenCanvasRenderingContext2D]) {
    if (!type) {
      continue;
    }
    for (const op of methods) {
      const original = type.prototype[op];
      if (typeof original !== 'function') {
        continue;
      }
      type.prototype[op] = function (...args) {
        const canvas = describe(this.canvas);
        if (op === 'fillText') {
          labels.set(this.canvas, String(args[0]));
        }
        if (active) {
          let inputs = args.map((v) => (v instanceof Path2D ? { path: paths.get(v) ?? [] } : v));
          if (op === 'drawImage') {
            const [source, ...rest] = args;
            inputs = [{ ...describe(source), text: labels.get(source) }, ...rest];
          }
          const record = { canvas: canvas.id, op, args: inputs };
          if (paint.has(op)) {
            const { a, b, c, d, e, f } = this.getTransform();
            Object.assign(record, {
              matrix: [a, b, c, d, e, f],
              alpha: this.globalAlpha,
              fill: this.fillStyle,
              stroke: this.strokeStyle,
              width: this.lineWidth,
              join: this.lineJoin,
              cap: this.lineCap,
              font: this.font,
              textAlign: this.textAlign,
              textBaseline: this.textBaseline,
            });
          }
          frame.push(record);
        }
        return original.apply(this, args);
      };
    }
  }
  const raf = requestAnimationFrame;
  window.requestAnimationFrame = (fn) =>
    raf.call(window, (t) => {
      if (active) {
        frame = [];
      }
      try {
        return fn(t);
      } finally {
        if (active && frame.length > 0) {
          last = frame;
        }
      }
    });
  window.waveUiStart = () => {
    active = true;
    last = [];
  };
  window.waveUiFrame = () => last;
  window.waveUiStop = () => {
    active = false;
  };
}

const host = await startHost({ snapshot, nativeDir, port: 0, fixture: true });
let browser;
try {
  browser = await chromium.launch({ executablePath, args: ['--disable-gpu'] });
  async function open({
    kind = 'connected',
    viewport = { width: 1024, height: 768 },
    deviceScaleFactor = 1,
    hash = '',
    phone = false,
  } = {}) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor,
      locale: 'en-US',
      serviceWorkers: 'block',
      ...(phone
        ? {
            isMobile: true,
            hasTouch: true,
            userAgent:
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 Version/16.2 Mobile/15E148 Safari/604.1',
          }
        : {}),
    });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (resources.has(url)) {
        if (kind === 'html' && url.endsWith('/client.js')) {
          return route.abort();
        }
        return route.fulfill({
          status: 200,
          ...resources.get(url),
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      if (
        url === 'https://api.n.m28.io/endpoint/florrio-waves-0/findEach/' ||
        url === 'https://api.n.m28.io/server/wavelocal'
      ) {
        const server = { id: 'wavelocal', ipv4: '127.0.0.1' };
        return route.fulfill({
          status: 200,
          json: url.includes('/server/') ? server : { servers: { us: server } },
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      return route.abort();
    });
    await context.routeWebSocket(/.*/, (route) => {
      if (route.url() !== 'wss://wavelocal.s.m28n.net/' || kind !== 'connected') {
        return;
      }
      const origin = new URL(host.url).origin;
      const socket = new WebSocket(origin.replace(/^http:/, 'ws:') + '/wave/socket', {
        headers: { Origin: origin },
      });
      const pending = [];
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        for (const bytes of pending.splice(0)) {
          socket.send(bytes);
        }
      };
      socket.onmessage = (message) => route.send(Buffer.from(message.data));
      socket.onclose = (event) => {
        if (event.code !== 1006) {
          route.close({ code: event.code, reason: event.reason });
        }
      };
      route.onMessage((bytes) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(bytes);
        } else if (socket.readyState === WebSocket.CONNECTING) {
          pending.push(bytes);
        }
      });
      route.onClose(() => socket.close());
    });
    await context.addInitScript(installTrace);
    const page = await context.newPage();
    await page.goto('https://florr.io/' + hash, { waitUntil: 'domcontentloaded' });
    return { page, context };
  }
  async function capture(page, tag, label) {
    await page.evaluate(() => window.waveUiStart());
    if (label) {
      await page.waitForFunction(
        (wanted) =>
          window
            .waveUiFrame()
            .some(
              ({ canvas, op, args }) =>
                canvas === 'canvas' && op === 'fillText' && args[0] === wanted,
            ),
        label,
        { timeout: 8000 },
      );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
    }
    // Freeze the sampled trace before the next browser task. A screenshot is a
    // nearby presentation frame; particle positions are not synchronized to it.
    const frame = await page.evaluate(() => {
      const trace = window.waveUiFrame();
      window.waveUiStop();
      const c = document.getElementById('canvas');
      return { width: c.width, height: c.height, dpr: devicePixelRatio, trace };
    });
    await writeFile(path.join(output, tag + '.json'), JSON.stringify(frame));
    await page.screenshot({ path: path.join(output, tag + '.png') });
  }

  const loading = await open({ kind: 'html' });
  // Capture before the HTML loader's 500 ms script-error reload.
  await capture(loading.page, 'html-loading');
  await loading.context.close();
  const connecting = await open({ kind: 'silent' });
  await capture(connecting.page, 'connecting', 'Connecting...');
  await connecting.context.close();

  const a = await open();
  await capture(a.page, 'menu', 'This pretty little flower is called...');
  await a.page.mouse.click(420, 371);
  await a.page.keyboard.type('Wave Alpha');
  await a.page.mouse.click(670, 409);
  await a.page.waitForFunction(() => location.hash.startsWith('#wavelocal-'));
  const b = await open({ hash: await a.page.evaluate(() => location.hash) });
  await capture(b.page, 'invited', 'Wave Alpha');
  await capture(a.page, 'squad-private', 'Private squad');
  await a.page.mouse.move(382, 514);
  await capture(a.page, 'squad-code-hover', 'Click to copy');
  await a.page.mouse.click(337, 326);
  await capture(a.page, 'squad-public', 'Waiting for players...');
  await a.page.mouse.click(660, 255);
  await a.page.evaluate(() => window.waveUiStart());
  await a.page.waitForFunction(
    () =>
      window
        .waveUiFrame()
        .some(
          ({ op, args, fill }) => op === 'fillText' && args[0] === 'Ready' && fill === '#66ff66',
        ),
    null,
    { timeout: 8000 },
  );
  await capture(a.page, 'squad-ready', 'Ready');
  await a.page.mouse.click(660, 255);
  await a.page.mouse.click(696, 296);
  await a.page.waitForFunction(() => !location.hash);
  await a.page.evaluate(() => window.waveUiStart());
  await a.page.waitForFunction(
    () =>
      window.waveUiFrame().some(({ op, args }) => op === 'fillText' && args[0] === 'Garden') &&
      !window.waveUiFrame().some(({ op, args }) => op === 'fillText' && args[0] === 'Public'),
    null,
    { timeout: 8000 },
  );
  await capture(a.page, 'squad-closed', 'How to play');
  await a.context.close();
  await b.context.close();

  for (const [width, height, deviceScaleFactor, phone] of [
    [1280, 720, 1, false],
    [800, 600, 2, false],
    [480, 854, 1, false],
    [390, 844, 2, true],
  ]) {
    const sample = await open({ viewport: { width, height }, deviceScaleFactor, phone });
    await capture(
      sample.page,
      `menu-${width}x${height}-dpr${deviceScaleFactor}`,
      'This pretty little flower is called...',
    );
    await sample.context.close();
  }
  process.stdout.write(`Chromium ${await browser.version()}: ${output}\n`);
} finally {
  await browser?.close();
  await host.stop();
}
