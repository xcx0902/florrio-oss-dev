import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { chromiumExecutable } from '../../tools/lib/chromium.mjs';
import { extractMenuContent, menuContentSource } from '../../tools/gen-menu-content.mjs';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';
import { MOB_GALLERY } from '../public/schema/mob-gallery.js';
import { formatDropChance } from '../public/render/menu-panels.js';
import { RARITY_NAMES } from '../public/schema/petals.js';

const root = new URL('../../', import.meta.url);
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
      await route.fulfill({ contentType: 'font/woff2', body: await readFile(new URL('source/assets/fonts/ubuntu-bold-latin.woff2', root)) });
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
    const { drawMenu } = await import('/render/menu.js');
    const { wrapContext } = await import('/render/canvas2d/context.js');
    const canvas = document.getElementById('background'), ratio = devicePixelRatio;
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const menu = new MenuControls(); menu.resize(width, height); menu.show(true);
    window.drawMenuCanvas = () => drawMenu(wrapContext(canvas.getContext('2d')), width, height, '', ratio,
      1000, 2432940084, undefined, undefined, true, menu.petalDiscoveryCount, menu.renderState(), menu.discoveredPetals);
    window.menu = menu;
    window.drawMenuCanvas();
  }, { stored, width, height });
  return page;
}

test('all 35 archived changelog records retain 73 notes, duplicate dates and multiline notes', async () => {
  const recovered = await extractMenuContent();
  assert.equal(recovered.sha256, 'c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1');
  assert.equal(recovered.entries.length, 35);
  assert.equal(recovered.entries.reduce((sum, entry) => sum + entry.notes.length, 0), 73);
  assert.equal(recovered.entries[0].date, 'November 2nd 2020');
  assert.equal(recovered.entries.at(-1).date, 'February 1st 2020');
  assert.equal(recovered.entries.at(-1).notes.length, 8);
  assert.equal(recovered.entries.filter(entry => entry.date === 'February 27th 2020').length, 2);
  assert.equal(recovered.entries.filter(entry => entry.date === 'February 24th 2020').length, 2);
  assert.equal(recovered.entries[2].notes.length, 6);
  assert.match(recovered.entries[2].notes[1], /first time\.\nEffect still applies if they're reloading/);
  assert.equal(await readFile(new URL('client/src/schema/menu-content.ts', root), 'utf8'), menuContentSource(recovered));
});

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

test('complete gallery catalogues, drop labels and every discovered row match the original client', async t => {
  const fixture = JSON.parse(await readFile(new URL('client/tests/fixtures/menu-details-native.json', root), 'utf8'));
  const original = await loadOriginal('client', { functionIds: [391] }); original.call(391, 1);
  const bytes = new Uint8Array(original.memory.buffer), view = new DataView(bytes.buffer);
  assert.deepEqual(RARITY_NAMES.slice(0, 6), [13126,13973,16248,19249,5496,15898].map(pointer =>
    new TextDecoder().decode(bytes.subarray(pointer, bytes.indexOf(0, pointer)))), 'native rarity names including Unique');
  for (const [type, mob] of Object.entries(MOB_GALLERY)) {
    // Segment aliases are populated later by the running client and never have
    // their own gallery row. The initialized runtime fixture checks visible rows.
    if ([16, 18].includes(Number(type))) continue;
    const p = 384096 + Number(type) * 116;
    const drops = Array.from({ length: bytes[p + 32] }, (_, i) => bytes[p + 36 + i * 8]).sort((a, b) => a - b);
    assert.equal(mob.rarity, view.getUint32(p + 24, true));
    assert.deepEqual(mob.drops.map(drop => drop.petalTypeId).sort((a, b) => a - b), drops, `native catalogue ${type}`);
  }
  for (const row of fixture.mobs) assert.deepEqual(MOB_GALLERY[row.type].drops.map(drop => ({
    type: drop.petalTypeId, label: formatDropChance(drop.chance),
  })), row.drops, `native sorted drop labels for ${row.type}`);
  const page = await menuPage(t);
  const actual = await page.evaluate(async () => {
    const layout = await import('/render/menu-layout.js');
    return { types: layout.MOB_GALLERY_TYPES, heights: layout.MOB_GALLERY_TYPES.map(type => layout.mobRowHeight(type, true)),
      descriptions: layout.MOB_GALLERY_TYPES.map(type => layout.mobDescriptionLines(type)),
      changelog: layout.changelogEntries().map(entry => entry.notes.map(lines => lines.length)),
      changelogText: layout.changelogEntries().map(entry => entry.notes),
      scrollHeights: Object.fromEntries(['Petals','Mobs','Changelog'].map(panel => [panel,
        layout.menuScrollMax(panel, 1029, layout.MOB_GALLERY_TYPES) + layout.menuContentRect(panel, 1029).height])),
      petals: layout.PETAL_GALLERY_TYPES };
  });
  await writeFile('/tmp/florr-menu-layout-current.json', JSON.stringify(actual, null, 2));
  assert.deepEqual(actual.types, fixture.mobs.map(row => row.type));
  actual.heights.forEach((height, i) => assert.ok(Math.abs(height - fixture.mobs[i].height) < .0001, `row ${i}`));
  assert.deepEqual(actual.descriptions, fixture.mobs.map(row => row.description), 'every native mob description line');
  assert.deepEqual(actual.changelog, fixture.changelog.map(entry => entry.lines), 'all wrapped changelog notes');
  assert.deepEqual(actual.changelogText, fixture.changelog.map(entry => entry.text), 'every wrapped line retains native punctuation and spacing');
  for (const panel of Object.keys(fixture.scrollHeights)) assert.ok(Math.abs(actual.scrollHeights[panel] - fixture.scrollHeights[panel]) < .001,
    `${panel} scroll extent: ${actual.scrollHeights[panel]} != ${fixture.scrollHeights[panel]}`);
  assert.deepEqual(actual.petals.slice(0, 16), [1, 2, 3, 8, 32, 6, 7, 16, 18, 13, 20, 14, 31, 10, 11, 4]);
  assert.equal(actual.petals.length, 38);
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

test('gallery wheel distance and every following frame match original func626', async t => {
  const original = await loadOriginal('client', { functionIds: [626] });
  const view = new DataView(original.memory.buffer);
  const scroll = 5000000, rect = 5002000, config = 5002100, viewport = 5002200;
  const page = await menuPage(t);
  for (const panel of ['Petals', 'Mobs', 'Changelog']) {
    const geometry = await page.evaluate(async panel => {
      const layout = await import('/render/menu-layout.js');
      window.menu.open(panel); window.menu.advance(1600);
      const content = layout.menuContentRect(panel, window.menu.height);
      window.menu.pointerMove((content.x + 20) * window.menu.scale,
        (content.y + 20) * window.menu.scale);
      return { width: content.width, height: content.height,
        max: layout.menuScrollMax(panel, window.menu.height, window.menu.discoveredMobs) };
    }, panel);
    new Uint8Array(original.memory.buffer, scroll, 1024).fill(0);
    view.setUint32(7908828, scroll, true); view.setUint32(7908840, 1, true);
    view.setUint32(scroll + 36, 1, true);
    view.setFloat32(scroll + 232, -1, true); view.setFloat32(scroll + 236, -1, true);
    view.setFloat32(scroll + 304, 1, true);
    [1, 0, 0, geometry.width, geometry.height].forEach((value, index) =>
      view.setFloat32(rect + index * 4, value, true));
    view.setFloat32(viewport + 12, geometry.width, true);
    view.setFloat32(viewport + 16, geometry.height, true);
    for (const [delta, elapsed] of [[1, 16], [0, 16], [0, 33], [0.5, 16], [-0.25, 8], [100, 16], [-100, 16], [0, 16]]) {
      view.setFloat64(163840, delta, true);
      original.call(626, scroll, elapsed, rect, geometry.width,
        geometry.height + geometry.max, viewport, config);
      const expected = view.getFloat32(scroll + 292, true);
      const actual = await page.evaluate(({ panel, delta, elapsed }) => {
        if (delta) window.menu.wheel(delta);
        window.menu.advance(elapsed);
        return window.menu.renderState().scroll[panel];
      }, { panel, delta, elapsed });
      assert.ok(Math.abs(actual - expected) < 0.0002,
        `${panel}: wheel ${delta}, ${elapsed} ms: ${actual} != original ${expected}`);
    }
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

test('all four opening and switching sequences retain every frozen WASM alpha sample', async t => {
  const fixture = JSON.parse(await readFile(new URL('client/tests/fixtures/menu-details-native.json', root), 'utf8'));
  const page = await menuPage(t);
  for (const sequence of fixture.panelAnimations) {
    assert.deepEqual(await page.evaluate(() => window.menu.renderState().panelAlphas), sequence.initial.alphas);
    await page.evaluate(panel => window.menu.open(panel), sequence.panel);
    for (const sample of sequence.samples) {
      await page.evaluate(() => window.menu.advance(16));
      assert.deepEqual(await page.evaluate(() => window.menu.renderState().panelAlphas), sample.alphas);
    }
    // The oracle settles for 100 frames and moves to the next tab for two.
    await page.evaluate(() => { for (let frame = 0; frame < 102; frame++) window.menu.advance(16); });
  }
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
