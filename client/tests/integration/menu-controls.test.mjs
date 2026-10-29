import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { chromiumExecutable } from '../../../tools/lib/chromium.mjs';

const root = new URL('../../../', import.meta.url);
let browser;
test.after(async () => { await browser?.close(); });

async function menuPage(t, { width = 1280, height = 720, deviceScaleFactor = 1, stored } = {}) {
  browser ??= await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
  t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'no browser errors'));
  await page.route('http://menu-controls.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;overflow:hidden;background:#1ea761"><canvas id="background" style="position:absolute;inset:0"></canvas></body></html>' });
      return;
    }
    if (pathname.endsWith('.js')) {
      const source = await readFile(new URL(`client/src${pathname.replace(/\.js$/, '.ts')}`, root), 'utf8');
      await route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText });
      return;
    }
    if (pathname === '/ubuntu.woff2') {
      await route.fulfill({ contentType: 'font/woff2', body: await readFile(new URL('client/public/fonts/ubuntu-bold-latin.woff2', root)) });
      return;
    }
    await route.abort();
  });
  await page.goto('http://menu-controls.test/');
  await page.evaluate(async ({ stored, width, height }) => {
    if (stored !== undefined) localStorage.setItem('florr-menu', stored);
    const font = new FontFace('Ubuntu', 'url(/ubuntu.woff2)');
    await font.load(); document.fonts.add(font);
    const { MenuControls } = await import('/input/menu.js');
    const { drawMenu, drawMenuRespawnTooltips } = await import('/render/menu.js');
    const { wrapContext } = await import('/render/canvas2d/context.js');
    const canvas = document.getElementById('background'), ratio = devicePixelRatio;
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const menu = new MenuControls(); menu.resize(width, height); menu.show(true);
    const context = wrapContext(canvas.getContext('2d'));
    window.menuRespawn = undefined;
    window.drawMenuCanvas = () => drawMenu(context, width, height, '', ratio,
      1000, 2432940084, undefined, undefined, true, menu.petalDiscoveryCount, menu.renderState(),
      menu.discoveredPetals, window.menuRespawn);
    window.drawMenuTooltips = () => drawMenuRespawnTooltips(context, width, height, ratio,
      window.menuRespawn, menu.renderState());
    window.menu = menu;
    window.drawMenuCanvas();
  }, { stored, width, height });
  return page;
}

test('tabs, settings and canvases are rendered without DOM menu panels', async t => {
  const page = await menuPage(t);
  assert.equal(await page.locator('#menu-panel').count(), 0);
  assert.equal(await page.locator('#menu-controls button').count(), 0);
  for (const [panel, x] of [['Settings', 60], ['Petals', 170], ['Mobs', 280], ['Changelog', 400]]) {
    await page.evaluate(x => window.menu.pointerDown(x * 0.7, 701), x);
    assert.equal(await page.evaluate(() => window.menu.panel), panel);
    await page.evaluate(() => window.drawMenuCanvas());
    await page.evaluate(x => window.menu.pointerDown(x * 0.7, 701), x);
    assert.equal(await page.evaluate(() => window.menu.panel), undefined);
  }
  await page.evaluate(() => window.menu.pointerDown(60 * 0.7, 701));
  await page.evaluate(() => window.menu.advance(1600));
  await page.evaluate(() => window.menu.pointerDown(26, 617));
  await page.evaluate(() => window.menu.pointerDown(26, 648));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('florr-menu')));
  assert.equal(saved.keyboardMovement, true);
  assert.equal(saved.movementHelper, true);
  assert.equal(await page.evaluate(() => localStorage.getItem('florrio_keyboard_control')), '1');
  assert.equal(await page.evaluate(() => localStorage.getItem('florrio_movement_helper')), '1');
});

test('gallery hit tests only expose discovered petals and mobs for tooltips', async t => {
  const page = await menuPage(t, { stored: JSON.stringify({ name: 'Probe', petals: [1, 2], mobs: [4] }) });
  await page.evaluate(() => window.menu.open('Petals'));
  await page.evaluate(() => window.menu.advance(1600));
  await page.evaluate(() => window.menu.pointerMove(46, 488));
  assert.equal(await page.evaluate(() => window.menu.renderState().hoveredPetal), 1);
  await page.evaluate(() => window.menu.pointerMove(95, 488));
  assert.equal(await page.evaluate(() => window.menu.renderState().hoveredPetal), 2);
  await page.evaluate(() => window.menu.pointerMove(144, 488));
  assert.equal(await page.evaluate(() => window.menu.renderState().hoveredPetal), undefined,
    'undiscovered cells do not reveal a tooltip');
  await page.evaluate(() => window.menu.open('Mobs'));
  await page.evaluate(() => { window.menu.advance(1600); window.menu.pointerMove(150, 604); });
  assert.equal(await page.evaluate(() => window.menu.renderState().hoveredMob), 4);
  await page.evaluate(() => window.drawMenuCanvas());
});

test('the editable name follows the canvas presentation while entering and leaving the menu', async t => {
  const page = await menuPage(t);
  const sample = async (offsetY, opacity, interactive) => page.evaluate(({ offsetY, opacity, interactive }) => {
    window.menu.presentInput({ inputY: 457, offsetY, opacity }, interactive);
    const input = document.getElementById('player-name'), root = document.getElementById('menu-controls');
    return { top: parseFloat(input.style.top), opacity: Number(root.style.opacity), hidden: root.hidden,
      events: input.style.pointerEvents, focused: document.activeElement === input };
  }, { offsetY, opacity, interactive });
  const dropping = await sample(-200, .5, true);
  assert.ok(Math.abs(dropping.top - (457 - 200 + 5) * Math.fround(.7)) < .0001);
  assert.equal(dropping.opacity, .5); assert.equal(dropping.events, 'auto');
  const leaving = await sample(-300, .3, false);
  assert.equal(leaving.hidden, false, 'name remains drawn during ascent');
  assert.equal(leaving.events, 'none'); assert.equal(leaving.focused, false);
  assert.equal((await sample(-657, 0, false)).hidden, true);
  const returning = await sample(-100, .8, true);
  assert.equal(returning.hidden, false); assert.equal(returning.focused, true);
});

test('gallery scrollbars follow the pointer while dragged', async t => {
  const page = await menuPage(t);
  const result = await page.evaluate(async () => {
    const layout = await import('/render/menu-layout.js');
    const samples = [];
    for (const panel of ['Petals', 'Mobs', 'Changelog']) {
      window.menu.open(panel);
      window.menu.advance(1600);
      const content = layout.menuContentRect(panel, window.menu.height, window.menu.panelAlphas[panel]);
      const max = layout.menuScrollMax(panel, window.menu.height, window.menu.discoveredMobs);
      const track = Math.fround(content.height - 8);
      const thumb = Math.fround(track * Math.fround(content.height / (content.height + max)));
      const x = content.x + content.width - 7;
      const top = content.y + 4 + thumb / 2;
      const scale = window.menu.scale;
      window.menu.pointerDown(x * scale, top * scale);
      window.menu.pointerDrag(x * scale, (content.y + content.height - 4) * scale, true);
      const bottom = window.menu.scroll[panel];
      window.menu.pointerDrag(x * scale, content.y * scale, true);
      window.menu.pointerDrag(x * scale, content.y * scale, false);
      samples.push({ panel, max, bottom, top: window.menu.scroll[panel] });
    }
    return samples;
  });
  for (const sample of result) {
    assert.ok(sample.max > 0, `${sample.panel} has a scrollbar`);
    assert.ok(sample.bottom > sample.max * 0.9, `${sample.panel} thumb drags to the bottom: ${sample.bottom}/${sample.max}`);
    assert.equal(sample.top, 0, `${sample.panel} thumb drags back to the top`);
  }
});

test('panels independently fade and slide while opening, switching and closing', async t => {
  const page = await menuPage(t);
  const samples = await page.evaluate(async () => {
    const { menuPanelRect } = await import('/render/menu-layout.js');
    const samples = []; let now = 0;
    for (const panel of ['Settings', 'Petals', undefined]) {
      window.menu.open(panel);
      for (const delta of [16, 8, 24, 0, 33.333, 4.5, 50]) {
        window.menu.advance(delta); now += delta;
        const alphas = window.menu.renderState().panelAlphas;
        samples.push({ delta, panel, alphas, y: menuPanelRect('Settings', 1029, alphas.Settings).y });
      }
    }
    return samples;
  });
  const expected = { Settings: 0, Petals: 0, Mobs: 0, Changelog: 0 };
  for (const sample of samples) {
    const step = 1 - Math.pow(.7, Math.fround(sample.delta) * .06);
    for (const panel of Object.keys(expected)) expected[panel] = Math.fround(expected[panel] + (+(sample.panel === panel) - expected[panel]) * step);
    assert.deepEqual(sample.alphas, expected);
    assert.equal(sample.y, Math.fround(1079 - (110 + 163.600006) * expected.Settings));
  }
  assert.ok(samples[7].alphas.Settings > 0 && samples[7].alphas.Petals > 0, 'closing panel is retained during the crossfade');
});

test('retained-petal cards reveal their tooltip only while hovered', async t => {
  const page = await menuPage(t);
  const hovered = await page.evaluate(() => {
    window.menuRespawn = { level: 45, items: [6, 7, 8] };
    window.menu.setRespawn(window.menuRespawn.items);
    // 3-card row at 1280x720: 49 CSS px pitch, first centre at 590.8/440.3.
    window.menu.pointerMove(590.8, 440.3);
    window.menu.advance(16);
    const firstAlpha = window.menu.renderState().respawnTooltips[0]?.alpha;
    for (let frame = 0; frame < 29; frame++) window.menu.advance(16);
    window.drawMenuCanvas();
    const canvas = document.getElementById('background');
    const context = canvas.getContext('2d');
    const before = Array.from(context.getImageData(440, 410, 1, 1).data);
    window.drawMenuTooltips();
    const after = Array.from(context.getImageData(440, 410, 1, 1).data);
    return { state: window.menu.renderState(), firstAlpha, before, after };
  });
  assert.equal(hovered.firstAlpha, 0.2899415194988251, 'first frame matches native f32 easing');
  assert.equal(hovered.state.respawnTooltips.length, 1);
  assert.equal(hovered.state.respawnTooltips[0].index, 0);
  assert.equal(hovered.state.respawnTooltips[0].type, 6);
  assert.ok(hovered.state.respawnTooltips[0].alpha > 0.999, 'alpha eases to the native target');
  assert.ok(hovered.after[0] < hovered.before[0] * 0.75,
    `native tooltip panel is painted above the menu: ${JSON.stringify(hovered)}`);

  const left = await page.evaluate(() => {
    window.menu.pointerMove(100, 100);
    for (let frame = 0; frame < 60; frame++) window.menu.advance(16);
    window.drawMenuCanvas();
    const canvas = document.getElementById('background');
    const context = canvas.getContext('2d');
    const before = Array.from(context.getImageData(440, 410, 1, 1).data);
    window.drawMenuTooltips();
    const after = Array.from(context.getImageData(440, 410, 1, 1).data);
    return { state: window.menu.renderState(), before, after };
  });
  assert.equal(left.state.respawnTooltips.length, 0);
  assert.deepEqual(left.after, left.before, 'no tooltip once the pointer leaves the card');
});

test('name typing, IME and persistence work without leaking game keys', async t => {
  const page = await menuPage(t);
  await page.evaluate(() => {
    window.gameKeys = [];
    window.addEventListener('keydown', event => window.gameKeys.push(event.code));
  });
  await page.locator('#player-name').fill('花朵 🐝');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('florr-menu')).name), '花朵 🐝');
  await page.locator('#player-name').dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  assert.deepEqual(await page.evaluate(() => window.gameKeys), []);
  await page.locator('#player-name').press('Enter');
  assert.deepEqual(await page.evaluate(() => window.gameKeys), ['Enter']);
  await page.evaluate(() => window.menu.show(false));
  assert.equal(await page.locator('#menu-controls').isVisible(), false);
  await page.evaluate(() => window.menu.show(true));
  assert.equal(await page.locator('#player-name').isVisible(), true);
  await page.evaluate(() => { window.menu.root.remove(); window.menu = new window.menu.constructor(); });
  assert.equal(await page.locator('#player-name').inputValue(), '花朵 🐝');
});
