/** Exercise the production main.js rAF ordering with an unchanged WASM oracle. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chromiumExecutable } from '../../tools/lib/chromium.mjs';
import { installVirtualClock } from '../../tools/parity/virtual-clock.js';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';

const root = process.env.CLIENT_ROOT ? path.resolve(process.env.CLIENT_ROOT)
  : path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const f = Math.fround;
const viewport = { width: 1280, height: 720 };
const factor = Math.max(f(viewport.height * f(1 / 1080)), f(viewport.width * f(1 / 1920)));
const zoom = scale => f(f(scale) * factor);
const player = { handle: 1, kind: 1, typeId: 1, x: 100, y: -50, angle: 0,
  radius: 25, health: 100, maxHealth: 100, level: 1 };
const initialView = { x: 80, y: -20, zoom: zoom(0.9) };
const initialPan = { x: 0.75, y: -0.5 };
const mouse = { x: 700, y: 300 };
let server, browser, origin, nativePan;

async function createNativePanOracle() {
  const stop = new Error('native input completed before rendering');
  const host = address => {
    if (address === 136300) throw stop; // First inner Canvas save in original763.
    return address === 141314 ? 2000 : 0;
  };
  // Only exports are added: the original queuePlayerInput instructions run.
  const native = await loadOriginal('client', { functionIds: [368, 763],
    imports: { a: { a: host, c: host } } });
  const bytes = new Uint8Array(native.memory.buffer), view = new DataView(bytes.buffer);
  const put = (at, value) => view.setInt32(at, value, true);
  const alloc = size => {
    const at = native.call(368, size);
    bytes.fill(0, at, at + size);
    return at;
  };
  const game = alloc(4096), state = game + 8, local = alloc(160),
    entity = alloc(448), transform = alloc(176), entries = alloc(4);
  put(state + 256, 1); put(state + 264, entries); put(entries, local);
  put(local + 144, entity); put(entity + 120, transform);
  bytes[state + 1] = 1;
  bytes[151560] |= 1; bytes[151516] = 0;
  bytes[7931360] |= 1; bytes[7931352] = 1; bytes[7931296] = 0;
  bytes[state + 896] = 1;
  return (previous, displayed, projection) => {
    const scale = f(projection.zoom / factor);
    assert.equal(f(scale * factor), projection.zoom, 'projection is representable by the native camera');
    view.setFloat32(state + 2048, previous.x, true);
    view.setFloat32(state + 2052, previous.y, true);
    bytes[transform + 144] = 1;
    view.setFloat64(transform + 152, displayed.x, true);
    view.setFloat64(transform + 160, displayed.y, true);
    view.setFloat32(state + 2148, projection.x, true);
    view.setFloat32(state + 2152, projection.y, true);
    view.setFloat32(state + 2156, scale, true);
    put(state + 2160, viewport.width); put(state + 2164, viewport.height);
    put(163824, mouse.x); put(163828, mouse.y);
    bytes[game + 2040] = 0;
    const stack = native.stackPointer.value;
    try {
      assert.throws(() => native.call(763, game, 0, 16, viewport.width, viewport.height),
        error => error === stop);
      return { x: view.getFloat32(state + 2048, true), y: view.getFloat32(state + 2052, true) };
    } finally {
      native.stackPointer.value = stack;
    }
  };
}

before(async () => {
  nativePan = await createNativePanOracle();
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
      const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store' }).end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true,
    args: ['--no-first-run', '--disable-background-networking'] });
});

after(async () => {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});

function observePlayerDrawing() {
  window.__renderCameraProbe = { draws: [], follows: [] };
  const arc = CanvasRenderingContext2D.prototype.arc;
  CanvasRenderingContext2D.prototype.arc = function (...args) {
    if (this.canvas.id === 'canvas' && args[0] === 0 && args[1] === 0 && args[2] === 25) {
      const m = this.getTransform();
      window.__renderCameraProbe.draws.push({ at: performance.now(),
        matrix: [m.a, m.b, m.c, m.d, m.e, m.f] });
    }
    return arc.apply(this, args);
  };
}

test('queued render cameras leave input untouched and apply after native-oracle pan/follow on rAF',
  { timeout: 30000 }, async () => {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try {
      await page.addInitScript({ content: `(${installVirtualClock.toString()})({frameMs:16});
        (${observePlayerDrawing.toString()})();` });
      await page.goto(origin + '/index.html', { waitUntil: 'load' });
      // Production boot waits for fonts. Escape the virtual timers while it
      // finishes, without advancing rAF or allowing worker ticks to run.
      await page.evaluate(() => new Promise((resolve, reject) => {
        let attempts = 0;
        const ready = () => {
          if (window.__florr && document.getElementById('status') === null) return resolve();
          if (++attempts > 200) return reject(new Error('production client boot timeout'));
          window.__realSetTimeout(ready, 20);
        };
        ready();
      }));
      await page.evaluate(({ player, initialView, initialPan, mouse }) => {
        const api = window.__florr;
        api.freeze();
        api.setSnapshot([player]);
        api.setCamera(initialView.x, initialView.y, initialView.zoom);
        api.clearCameraOverride(); // Exercise real follow before the draw override.
        api.camera.panX = initialPan.x; api.camera.panY = initialPan.y;
        document.getElementById('canvas').dispatchEvent(new PointerEvent('pointermove',
          { clientX: mouse.x, clientY: mouse.y, bubbles: true }));
        // Delegate to the actual method; observe its completion, do not stub it.
        const follow = api.camera.follow;
        api.camera.follow = function (...args) {
          const before = api.getCamera();
          follow.apply(this, args);
          window.__renderCameraProbe.follows.push({ before, after: api.getCamera() });
        };
      }, { player, initialView, initialPan, mouse });

      const targets = [
        { x: -180, y: 130, zoom: zoom(1.2), offsetX: 7.25, offsetY: -3.5 },
        { x: 220, y: -100, zoom: zoom(0.75), offsetX: -2.5, offsetY: 4.25 },
      ];
      let previousPan = initialPan, previousView = initialView;
      let displayed = { x: f(player.x + initialPan.x), y: f(player.y + initialPan.y) };
      for (const [index, target] of targets.entries()) {
        const expectedPan = nativePan(previousPan, displayed, previousView);
        const contaminatedPan = nativePan(previousPan, displayed, target);
        assert.ok(Math.hypot(expectedPan.x - contaminatedPan.x, expectedPan.y - contaminatedPan.y) > 0.01,
          'fixture distinguishes the old input view from an early draw override');
        const actual = await page.evaluate(async target => {
          const api = window.__florr, probe = window.__renderCameraProbe;
          const before = api.getCamera(), beforePan = { x: api.camera.panX, y: api.camera.panY };
          api.setRenderCamera(target.x, target.y, target.zoom, target.offsetX, target.offsetY);
          const pending = api.getCamera(), pendingPan = { x: api.camera.panX, y: api.camera.panY };
          const drawsBefore = probe.draws.length, followsBefore = probe.follows.length;
          await window.__virtualClock.advance(16);
          return { before, beforePan, pending, pendingPan, at: performance.now(),
            view: api.getCamera(), pan: { x: api.camera.panX, y: api.camera.panY },
            follows: probe.follows.slice(followsBefore), draws: probe.draws.slice(drawsBefore) };
        }, target);
        assert.deepEqual(actual.before, previousView);
        assert.deepEqual(actual.pending, previousView, 'queuing does not immediately change the input projection');
        assert.deepEqual(actual.beforePan, previousPan);
        assert.deepEqual(actual.pendingPan, previousPan, 'queuing does not advance pan');
        assert.equal(actual.at, (index + 1) * 16);
        assert.deepEqual(actual.pan, expectedPan, 'production rAF pan agrees exactly with original WASM');
        assert.equal(actual.follows.length, 1);
        assert.deepEqual(actual.follows[0].before, previousView, 'follow also precedes the draw override');
        if (index === 0) {
          assert.equal(actual.follows[0].after.x, f(player.x + expectedPan.x));
          assert.equal(actual.follows[0].after.y, f(player.y + expectedPan.y));
        }
        const { x, y, zoom: renderZoom } = target;
        assert.deepEqual(actual.view, { x, y, zoom: renderZoom }, 'next rAF installs the requested drawing view');
        displayed = { x: f(player.x + expectedPan.x), y: f(player.y + expectedPan.y) };
        const screenX = f(f(viewport.width * 0.5 - f(f(x) * renderZoom))
          + f(displayed.x * renderZoom)) + target.offsetX;
        const screenY = f(f(viewport.height * 0.5 - f(f(y) * renderZoom))
          + f(displayed.y * renderZoom)) + target.offsetY;
        assert.equal(actual.draws.length, 1, 'the actual main canvas draws one player body');
        assert.deepEqual(actual.draws[0], { at: actual.at,
          matrix: [renderZoom, 0, -0, renderZoom, screenX, screenY] },
        'real Canvas2D player drawing uses the new view with native-oracle pan');
        previousPan = expectedPan;
        previousView = { x, y, zoom: renderZoom };
      }
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });
