import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { browser, origin, start, stop } from '../support/worker-fixture.mjs';
before(start); after(stop);
test('repeated app boot/dispose removes input, timers, worker requests, cheat panel and render resources', { timeout: 30000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.route('**/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/?cheat=1');
    const results = await page.evaluate(async () => {
      const { GameApp } = await import('/app/game-app.js');
      const canvas = document.querySelector('canvas'), results = [];
      for (let index = 0; index < 3; index++) {
        const app = new GameApp(canvas);
        const first = app.start(), second = app.start();
        await first;
        await new Promise(resolve => setTimeout(resolve, 200));
        const menuCount = document.querySelectorAll('#menu-controls').length;
        const cheatCount = document.querySelectorAll('#florr-cheat-panel').length;
        app.dispose(); app.dispose();
        const ticks = app.simulation.completedServerTicks;
        await new Promise(resolve => setTimeout(resolve, 120));
        results.push({ sameStart: first === second, menuCount, cheatCount, stopped: ticks === app.simulation.completedServerTicks,
          menusAfter: document.querySelectorAll('#menu-controls').length, cheatsAfter: document.querySelectorAll('#florr-cheat-panel').length,
          labels: app.renderer.resources.labels.size, surface: app.renderer.resources.hudSurface === undefined });
      }
      return results;
    });
    assert.deepEqual(errors, []);
    for (const result of results) assert.deepEqual(result, { sameStart: true, menuCount: 1, cheatCount: 1, stopped: true, menusAfter: 0, cheatsAfter: 0, labels: 0, surface: true });
  } finally { await page.close(); }
});
test('late initialization after returning to menu or disposing cannot schedule another spawn', async () => {
  const page = await browser.newPage();
  try {
    await page.route('**/main.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      const { GameApp } = await import('/app/game-app.js');
      const results = [];
      for (const disposal of [false, true]) {
        const app = new GameApp(document.querySelector('canvas'));
        app.server.terminate();
        let resolveReady;
        app.server = { init: () => new Promise(resolve => resolveReady = resolve), terminate() {} };
        const spawn = app.session.startGame();
        if (disposal) app.dispose(); else app.session.continueToMenu();
        resolveReady(null); await spawn;
        results.push({ phase: app.session.phase, pending: app.session.pendingSpawn ?? null }); app.dispose();
      }
      return results;
    });
    assert.equal(result[0].phase, 'returning');
    assert.equal(result[0].pending, null); assert.equal(result[1].pending, null);
  } finally { await page.close(); }
});
