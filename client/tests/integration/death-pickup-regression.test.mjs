/** Run the delivered main frame loop with a clearly isolated pickup/death
 * fixture. The event goes through the production packet decoder, not a
 * replacement renderer or a directly constructed Event14Effect. */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { chromiumExecutable } from '../../../tools/lib/chromium.mjs';

test('settled pickup cards leave their old loadout positions after death in the delivered client', { timeout: 30000 }, async () => {
  const root = path.resolve(process.env.CLIENT_ROOT || 'client/public');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css' };
  const server = http.createServer(async (request, response) => {
    try {
      const filename = path.resolve(root, '.' + new URL(request.url, 'http://local.test').pathname);
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' })
        .end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__pickupBorders = [];
      for (const prototype of [CanvasRenderingContext2D.prototype, OffscreenCanvasRenderingContext2D.prototype]) {
        const begin = prototype.beginPath, rect = prototype.rect, stroke = prototype.stroke;
        const rectangles = new WeakSet();
        prototype.beginPath = function (...args) { rectangles.delete(this); return begin.apply(this, args); };
        prototype.rect = function (...args) { rectangles.add(this); return rect.apply(this, args); };
        prototype.stroke = function (...args) {
          if (rectangles.has(this) && this.strokeStyle.toLowerCase() === '#cfba4b') {
            const m = this.getTransform();
            window.__pickupBorders.push({ at: performance.now(), x: m.e, y: m.f, scale: m.a });
          }
          return stroke.apply(this, args);
        };
      }
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => window.__florr?.world);
    await page.locator('#player-name').waitFor({ state: 'visible' });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__florr.ui.started && window.__florr.world.playerEntity()?.health > 0);
    await page.evaluate(() => window.__florr.freeze());
    // Drain any request already in flight before installing the private fixture.
    await page.waitForTimeout(100);
    const fixture = await page.evaluate(async () => {
      const { getHudLayout } = await import('/render/hud.js');
      const layout = getHudLayout(1280, 720, 1);
      const body = { handle: 7001, typeId: 1, kind: 1, speciesId: 1, flags: 0,
        x: 0, y: 0, angle: 0, radius: 25, health: 100, maxHealth: 100, healthKnown: true, level: 1,
        byteArrayFields: { 60: [6, 1, 1, 1, 1].map((value, index) => ({ value, index })) } };
      const drop = { handle: 7002, typeId: 4, kind: 4, speciesId: 6, flags: 0,
        x: -100, y: -50, angle: 0, radius: 25, health: 0, maxHealth: 0, byteFields: { 22: 6 } };
      window.__florr.setSnapshot([body, drop]);
      const handle = drop.handle;
      const accepted = window.__florr.applyPacketAt([1, 1, 0, 0, 0, 1, 14,
        handle & 255, handle >>> 8 & 255, handle >>> 16 & 255, handle >>> 24, 0], performance.now());
      window.__pickupFixtureBody = body;
      return { accepted, x: Math.fround(layout.scale * layout.equippedX),
        y: Math.fround(layout.scale * layout.equippedY), height: 720 };
    });
    assert.equal(fixture.accepted, true, 'pickup event decoded by production applyPacket');
    await page.waitForFunction(({ x, y }) => window.__pickupBorders.some(row => Math.abs(row.x - x) < .1 && Math.abs(row.y - y) < .1), fixture);
    const deathAt = await page.evaluate(() => {
      const now = performance.now(); window.__pickupBorders.length = 0;
      window.__florr.setSnapshotAt([{ ...window.__pickupFixtureBody, health: 0 }], now);
      return now;
    });
    await page.waitForFunction(() => window.__florr.ui.dead);
    await page.waitForFunction(({ x, height }) => window.__pickupBorders.some(row => Math.abs(row.x - x) < .1 && row.y > height + 30), fixture);
    const rows = await page.evaluate(({ x, deathAt }) => window.__pickupBorders
      .filter(row => row.at >= deathAt && Math.abs(row.x - x) < .1), { x: fixture.x, deathAt });
    assert.ok(rows.length > 5, 'pickup border observed throughout the death transition');
    assert.ok(rows[0].y > fixture.y, 'pickup starts receding on the first death frame');
    assert.ok(rows.at(-1).y > fixture.height + 30, 'settled pickup leaves the visible loadout area');
    assert.ok(rows.every((row, index) => index === 0 || row.y >= rows[index - 1].y), 'pickup never returns to its old slot');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
});
