import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { chromiumExecutable } from '../../tools/lib/chromium.mjs';
import { withAdditionalExports } from '../../tools/lib/wasm-binary.mjs';
import { installClientWasmProbe } from '../../tools/parity/client-wasm.js';
import { installVirtualClock } from '../../tools/parity/virtual-clock.js';
import { installDeterministicServer } from '../../tools/parity/deterministic-worker.js';
import { MenuInputAnimation } from '../public/render/menu-animation.js';
import { drawMenuInput } from '../public/render/menu.js';
import { RenderingCanvas } from './helpers/rendering-oracle.mjs';

test('name input boot, spawn and death return match every original frame', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
  try {
    // Export the original damage function for this isolated death fixture.
    // Only the in-memory export section changes; original instructions and
    // the frozen files on disk remain untouched.
    const serverWasm = withAdditionalExports(await readFile(new URL('../../web/sp_server.wasm', import.meta.url)),
      [{ name: '__damage', index: 43 }]);
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://original-menu.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      try {
        await route.fulfill({ body: path === '/sp_server.wasm' ? serverWasm
          : await readFile(new URL(`../../web${path === '/' ? '/index.html' : path}`, import.meta.url)),
          contentType: path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript'
            : path.endsWith('.woff2') ? 'font/woff2' : 'text/html' });
      } catch { await route.fulfill({ status: 404, body: '' }); }
    });
    await page.addInitScript(installClientWasmProbe);
    await page.addInitScript(installVirtualClock);
    await page.addInitScript(installDeterministicServer);
    await page.addInitScript(() => {
      window.__inputPaints = [];
      for (const proto of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype]) {
        const fill = proto.fillRect;
        proto.fillRect = function (...args) {
          const m = this.getTransform();
          if (this.fillStyle.toLowerCase() === '#eeeeee' && Math.abs(m.a - 280) < .001 && Math.abs(m.d - 35) < .001)
            window.__inputPaints.push({ matrix: [m.a, m.b, m.c, m.d, m.e, m.f], alpha: this.globalAlpha });
          return fill.apply(this, args);
        };
      }
    });
    await page.goto('http://original-menu.test/');
    await page.evaluate(() => document.fonts.ready);
    // Playwright's page polling uses the replaced timers/rAF. Poll from Node
    // instead, while draining zero-delay bootstrap work before the first RAF.
    let ready = false;
    for (let attempt = 0; attempt < 500; attempt++) {
      ready = await page.evaluate(async () => {
        await window.__virtualClock.advance(0);
        return Boolean(window.__parityServer?.ready);
      });
      if (ready) break;
      await delay(10);
    }
    assert.ok(ready, 'original server initialized before replay');
    const animation = new MenuInputAnimation(), rows = [];
    async function frames(count, stage) {
      for (let i = 0; i < count; i++) {
        const native = await page.evaluate(async () => {
          window.__inputPaints.length = 0;
          const p = window.__clientWasm;
          // Same branch inputs as client1095, sampled before the frame drains
          // new bodies or processes Enter. No animation globals are changed.
          const primary = p.u32(441664) ? p.u32(p.u32(441672)) : 0;
          const state = p.u32(7926872), count = p.u32(state + 256);
          const control = count ? p.u32(p.u32(state + 264)) : 0;
          const body = control ? p.u32(control + 144) : 0;
          const playing = primary && p.u32(primary + 144)
            || body && p.f32(p.u32(body + 116) + 8) > 0;
          const menu = !playing && (!count || !p.bytes(p.bytes(7931352, 1)[0] ? 7931344 : 4472, 1)[0]);
          await window.__virtualClock.advance(16);
          const now = window.__virtualClock.now;
          return { now, connecting: p.f32(7926820), withdrawn: p.f32(7926824),
            ready: Boolean(p.u32(441664) && p.u32(p.u32(441672))),
            menu, paint: window.__inputPaints.at(-1) };
        });
        const presentation = animation.advance(native.now, 16, native.ready, native.menu, 1029);
        assert.equal(presentation.active, !!native.paint, `${stage} ${native.now} menu pass active`);
        const hidden = Math.max(native.connecting, native.withdrawn);
        assert.equal(presentation.opacity, 1 - hidden, `${stage} ${native.now} opacity`);
        assert.equal(presentation.offsetY, Math.fround(-657 * hidden), `${stage} ${native.now} offset`);
        if (native.paint) {
          const actual = new RenderingCanvas(); drawMenuInput(actual, 1280, 720, '', 1, native.now, false, presentation);
          const paint = actual.paints.find(p => p.op === 'fill' && p.fill.every(c => c === 238));
          paint.matrix.forEach((value, j) => assert.ok(Math.abs(value - native.paint.matrix[j]) < .0001,
            `${stage} ${native.now} input matrix ${j}: ${value} != ${native.paint.matrix[j]}`));
          assert.equal(paint.alpha, native.paint.alpha);
        }
        rows.push({ ...native, stage });
      }
      t.diagnostic(`${stage}: ${count} original frames compared`);
    }
    await frames(200, 'boot');
    await page.keyboard.press('Enter'); animation.requestSpawn(); await frames(80, 'spawn');
    // Apply lethal damage through the original health/death callbacks. The
    // browser then receives the genuine corpse and removal snapshots.
    const deathFixture = await page.evaluate(() => {
      const worker = window.__parityServer.worker;
      const view = worker._view(), u32 = p => view.getUint32(p, true);
      const peer = u32(u32(24936) + 120), body = u32(peer + 100), health = body && u32(body + 164);
      const beforeHealth = health && view.getFloat32(health + 8, true);
      const options = worker._exports.q(4); worker._view().setUint32(options, 0, true);
      worker._exports.__damage(health, 0, beforeHealth, options); worker._exports.r(options);
      return { body, beforeHealth, afterHealth: view.getFloat32(health + 8, true) };
    });
    assert.ok(deathFixture.body && deathFixture.beforeHealth > 0, 'genuine living original player');
    assert.equal(deathFixture.afterHealth, 0, 'original damage callback killed the body');
    await frames(80, 'death'); await page.keyboard.press('Enter'); await frames(100, 'return');
    assert.ok(rows.some(row => row.stage === 'spawn' && !row.menu), 'original enters gameplay');
    assert.ok(rows.some(row => row.stage === 'return' && row.menu && row.withdrawn < .9), 'original returns to menu');
    assert.ok(rows.filter(row => row.paint).length > 100, 'original input geometry observed throughout transition');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
