/** Real menu/HUD regressions against the HTTP-served client and C++ worker.
 * Build first with: node node_modules/typescript/bin/tsc -p client/tsconfig.json
 * Run with: node --test client/tests/menu-interactions.test.mjs
 * CLIENT_ROOT, PLAYWRIGHT_CORE, BROWSER and CHROME_PATH match worker-shim.
 * Only suicide is a fixture hook. Every start, return, swap and discard below
 * comes from Playwright pointer/keyboard input; no synthetic world/loadout.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromiumExecutable } from '../../tools/lib/chromium.mjs';

const root = path.resolve(process.env.CLIENT_ROOT || 'client/public');
const viewport = { width: 1280, height: 720 };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.css': 'text/css', '.map': 'application/json' };
let server;
let browser;
let origin;
let packetKey;

before(async () => {
  // Same HTTP + Playwright/Chromium setup as worker-shim.test.mjs, but with its
  // own ephemeral listener. Existing development servers are never touched.
  const local = ['node_modules/playwright-core/index.mjs',
    'node_modules/playwright/node_modules/playwright-core/index.mjs'].find(file => existsSync(file));
  const playwrightPath = process.env.PLAYWRIGHT_CORE || local;
  if (!playwrightPath) throw new Error('playwright-core is required for client tests');
  const playwright = await import(pathToFileURL(path.resolve(playwrightPath)).href);
  const engineName = process.env.BROWSER || 'chromium';
  const engine = playwright[engineName];
  if (!engine) throw new Error(`unknown Playwright engine ${engineName}`);
  ({ PACKET_XOR_KEY: packetKey } = await import(pathToFileURL(path.join(root, 'schema/packet-key.js')).href));
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
      const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const body = await readFile(filename);
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store' }).end(body);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await engine.launch({
    executablePath: engineName === 'chromium' ? chromiumExecutable() : undefined,
    headless: true, args: ['--no-first-run', '--disable-background-networking'],
  });
}, { timeout: 30000 });

after(async t => {
  if (process.env.UI_REGRESSION_TRACE) t.diagnostic('closing regression browser');
  try { await browser?.close(); }
  finally {
    if (process.env.UI_REGRESSION_TRACE) t.diagnostic('closing regression HTTP listener');
    if (server?.listening) await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections(); // Also drain Chromium's idle HTTP/preconnect sockets.
    });
  }
  if (process.env.UI_REGRESSION_TRACE) t.diagnostic('regression resources closed');
});

async function openClient(t, dimensions = viewport, deviceScaleFactor = 1, menuStorage) {
  // Each test has fresh storage and an independent worker/server world.
  const context = await browser.newContext({ viewport: dimensions, deviceScaleFactor });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    if (process.env.UI_REGRESSION_TRACE && !page.isClosed()) {
      const packets = await commands(page);
      t.diagnostic(JSON.stringify({ state: await readState(page),
        actions: packets.filter(packet => packet.opcode !== 12),
        inputs: packets.filter(packet => packet.opcode === 12).slice(-10),
        names: await page.evaluate(() => [...window.__florr.world.all()]
          .filter(entity => entity.stringFields?.[48] || entity.denseFields?.[48])
          .map(entity => ({ handle: entity.handle, kind: entity.kind,
            name: entity.stringFields?.[48] ?? entity.denseFields?.[48] }))),
      }));
    }
    await context.close();
    assert.deepEqual(errors, [], 'the interaction must not cause browser exceptions');
  });
  await page.addInitScript(menuStorage => {
    if (menuStorage) localStorage.setItem('florr-menu', JSON.stringify(menuStorage));
    window.__menuRegressionPackets = [];
    window.__menuRegressionPacketTicks = [];
    window.__menuRegressionThinkCount = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (...args) {
      const message = args[0];
      if (message?.funcName === 'sp_server_think') window.__menuRegressionThinkCount += 1;
      if (message?.funcName === 'sp_server_send' && message.data) {
        window.__menuRegressionPackets.push(Array.from(message.data));
        window.__menuRegressionPacketTicks.push(window.__menuRegressionThinkCount);
      }
      return Reflect.apply(post, this, args);
    };
  }, menuStorage);
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__florr?.world && !document.getElementById('status'));
  await page.locator('#player-name').waitFor({ state: 'visible' });
  return page;
}

async function frames(page) {
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

async function readState(page) {
  return page.evaluate(async () => {
    const { playerLoadoutSlots } = await import('/state/loadout.js');
    const players = [...window.__florr.world.all()].filter(entity => entity.kind === 1 && entity.health > 0);
    const player = players[0];
    return { ui: window.__florr.ui, playerCount: players.length, player: player ? {
      handle: player.handle, x: player.x, y: player.y, radius: player.radius ?? 25,
      health: player.health, level: player.level ?? 1,
      name: player.stringFields?.[48] ?? player.denseFields?.[48],
      slots: playerLoadoutSlots(player),
    } : null };
  });
}

async function waitForState(page, predicate, argument, description) {
  try { await page.waitForFunction(predicate, argument, { timeout: 8000 }); }
  catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    assert.fail(`${description}; last received state: ${JSON.stringify(await readState(page))}`);
  }
}

async function commands(page) {
  const packets = await page.evaluate(() => window.__menuRegressionPackets.slice());
  return packets.map(raw => {
    const bytes = Uint8Array.from(raw, (byte, index) => byte ^ packetKey[index % packetKey.length]);
    let offset = 0;
    const varint = () => {
      let value = 0;
      for (let shift = 0; shift < 35; shift += 7) {
        assert.ok(offset < bytes.length, 'outgoing varint is complete');
        const byte = bytes[offset++];
        value |= (byte & 0x7f) << shift;
        if (!(byte & 0x80)) return value >>> 0;
      }
      assert.fail('outgoing varint exceeds five bytes');
    };
    const sequence = varint(), opcode = varint();
    const result = { sequence, opcode, body: Array.from(bytes.slice(offset)) };
    if (opcode === 6) {
      const end = bytes.indexOf(0, offset);
      assert.notEqual(end, -1, 'spawn name is NUL terminated');
      result.name = new TextDecoder().decode(bytes.slice(offset, end));
    } else if (opcode === 12) {
      result.buttons = varint();
      assert.equal(bytes.length - offset, 8, 'movement carries two binary32 fields');
      result.angle = new DataView(bytes.buffer).getFloat32(offset, true);
      result.strength = new DataView(bytes.buffer).getFloat32(offset + 4, true);
    }
    return result;
  });
}

async function assertMenu(page, panel = undefined) {
  await frames(page);
  // Observe several 50ms server ticks: absence is not a one-frame assertion.
  await page.waitForTimeout(180);
  const state = await readState(page);
  assert.equal(state.ui.started, false, 'menu pointer/keyboard controls must not start the game');
  assert.equal(state.ui.menuPanel, panel);
  assert.equal(state.playerCount, 0, 'menu controls must not create a server player');
  assert.equal((await commands(page)).filter(packet => [4, 6].includes(packet.opcode)).length, 0,
    'menu controls must not send restart/spawn');
}

async function typeName(page, text) {
  await page.locator('#player-name').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

const MENU_TAB_X = { Settings: 42, Petals: 112, Mobs: 196, Changelog: 280 };
const MENU_CLOSE = { Settings: [145, 582], Petals: [226, 438], Mobs: [303, 438], Changelog: [439, 417] };
async function clickMenuTab(page, label) {
  await page.mouse.click(MENU_TAB_X[label], 701);
  await frames(page);
}
async function clickMenuClose(page, label) {
  await page.waitForTimeout(400); // The close button travels with the opening panel.
  const [x, y] = MENU_CLOSE[label];
  await page.mouse.click(x, y);
  await frames(page);
}
async function clickSetting(page, row) {
  await page.waitForTimeout(400); // Click the settled checkbox, not its former static position.
  await page.mouse.click(26, 617 + row * 31.5);
  await frames(page);
}

async function startWithEnter(page, name = 'UI regression') {
  await typeName(page, name);
  await page.keyboard.press('Enter');
  await waitForState(page, () => window.__florr.ui.started && !window.__florr.ui.dead
    && [...window.__florr.world.all()].some(entity => entity.kind === 1 && entity.health > 0),
  null, 'keyboard Enter must spawn a healthy server player');
  await frames(page);
  const state = await readState(page);
  assert.equal(state.playerCount, 1);
  assert.ok(Array.isArray(state.player.slots), 'loadout must come from server field60');
  return state.player;
}

async function hudPoints(page) {
  return page.evaluate(async () => {
    const { getHudLayout } = await import('/render/ui.js');
    const player = [...window.__florr.world.all()].find(entity => entity.kind === 1 && entity.health > 0);
    const canvas = document.querySelector('#canvas');
    const layout = getHudLayout(canvas.clientWidth, canvas.clientHeight, player.level ?? 1, false);
    const point = (x, y) => ({ x: x * layout.scale, y: y * layout.scale });
    return {
      equippedCount: layout.equippedCount,
      equipment: Array.from({ length: layout.equippedCount }, (_, i) =>
        point(layout.equippedX + i * 90, layout.equippedY)),
      reserves: Array.from({ length: 8 }, (_, i) => point(layout.storageX + i * 65, layout.storageY)),
      discard: point(layout.storageX + 8 * 65, layout.storageY),
      hint: point(Math.trunc(layout.logicalWidth / 2), layout.logicalHeight - 15),
    };
  });
}

async function drag(page, source, target) {
  // A real hold crosses multiple animation frames before the release edge.
  // Moving away between drags also avoids accidental browser double-clicks.
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  try {
    await frames(page);
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await frames(page);
  } finally { await page.mouse.up(); }
  await frames(page);
}

async function expectSlots(page, expected, description) {
  // Playwright 1.49 treats an async predicate's Promise as truthy. Keep this
  // polling predicate synchronous and read the actual field60 indices.
  await waitForState(page, expected => {
    const player = [...window.__florr.world.all()].find(entity => entity.kind === 1 && entity.health > 0);
    if (!player) return false;
    const sparse = player.byteArrayFields?.[60] ?? player.byteArrayField60;
    const dense = player.denseFields?.[60];
    if (!sparse && !Array.isArray(dense)) return false;
    const actual = Array.from({ length: 16 }, (_, i) => Number(dense?.[i] ?? 0));
    for (const { index, value } of sparse ?? []) if (index >= 0 && index < 16) actual[index] = value;
    return JSON.stringify(actual) === JSON.stringify(expected);
  }, expected, description);
  assert.deepEqual((await readState(page)).player.slots, expected, description);
  await frames(page); // Let main.ts consume the same authoritative slot update.
}

test('menu tabs follow the original bottom anchor and gaps after viewport and DPR changes',
  { timeout: 30000 }, async t => {
    const page = await openClient(t, { width: 1440, height: 900 }, 2);
    for (const dimensions of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 },
      { width: 1024, height: 768 }, { width: 360, height: 640 }]) {
      await page.setViewportSize(dimensions);
      await frames(page);
      // Frozen func1095: logical viewport=ceil(f32(css/scale)), tab y=h-45,
      // widths=100/100/100/120 and left edges=10/120/230/340.
      const scale = Math.fround(Math.max(0.7, Math.fround(Math.max(
        dimensions.width * 0.000521, dimensions.height * 0.000926))));
      const logicalHeight = Math.ceil(Math.fround(dimensions.height / scale));
      const y = (logicalHeight - 27.5) * scale;
      for (const [panel, right] of [['Settings', 110], ['Petals', 220], ['Mobs', 330], ['Changelog', 460]]) {
        // Right edges catch an incorrect contiguous strip hit test, while
        // genuine pointer events pass through main.ts and PointerInput.
        const x = (right - 2) * scale;
        await page.mouse.click(x, y);
        await frames(page);
        assert.equal((await readState(page)).ui.menuPanel, panel, `${panel} at ${JSON.stringify(dimensions)}`);
        await page.mouse.click(x, y);
        await frames(page);
        assert.equal((await readState(page)).ui.menuPanel, undefined, 'active tab toggles off');
      }
      for (const gap of [115, 225, 335]) {
        await page.mouse.click(gap * scale, y);
        await frames(page);
        assert.equal((await readState(page)).ui.menuPanel, undefined, 'ten-unit gaps do not open a tab');
      }
    }
    await assertMenu(page);
  });

test('menu tabs and equipped petals use a hand cursor while gallery petals retain the original default cursor',
  { timeout: 15000 }, async t => {
    const page = await openClient(t, viewport, 1, { petals: [1], mobs: [] });
    await page.mouse.move(112, 701);
    await frames(page);
    assert.equal(await page.locator('#canvas').evaluate(canvas => getComputedStyle(canvas).cursor), 'pointer');
    await clickMenuTab(page, 'Petals');
    await page.mouse.move(46, 488);
    await frames(page);
    assert.equal(await page.locator('#canvas').evaluate(canvas => getComputedStyle(canvas).cursor), 'default',
      'both live and frozen originals keep the default cursor over discovered gallery Basic');
    await page.mouse.move(95, 488);
    await frames(page);
    assert.equal(await page.locator('#canvas').evaluate(canvas => getComputedStyle(canvas).cursor), 'default',
      'undiscovered petals keep the default cursor');
    await assertMenu(page, 'Petals');
    await startWithEnter(page);
    const points = await hudPoints(page);
    await page.mouse.move(points.equipment[0].x, points.equipment[0].y);
    await frames(page);
    assert.equal(await page.locator('#canvas').evaluate(canvas => getComputedStyle(canvas).cursor), 'pointer',
      'the equipped Basic uses a hand cursor, as observed in the live original');
    await page.mouse.move(1000, 100);
    await frames(page);
    assert.equal(await page.locator('#canvas').evaluate(canvas => getComputedStyle(canvas).cursor), 'default',
      'leaving the slot restores the default cursor');
  });

test('menu: pointer clicks, name Backspace, four panel toggles and persisted settings',
  { timeout: 30000 }, async t => {
    const page = await openClient(t);
    await page.mouse.click(1100, 200); // Empty menu canvas is not a start button.
    await assertMenu(page);
    await typeName(page, 'Menu FlowerX');
    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('#player-name').inputValue(), 'Menu Flower');
    await assertMenu(page);

    for (const label of ['Settings', 'Petals', 'Mobs', 'Changelog']) {
      await clickMenuTab(page, label);
      await assertMenu(page, label);
      await clickMenuTab(page, label); // The active tab toggles its panel off.
      await assertMenu(page);
      await clickMenuTab(page, label);
      await clickMenuClose(page, label);
      await assertMenu(page);
    }
    // Switching directly between open panels must replace the previous panel.
    for (const label of ['Settings', 'Petals', 'Mobs', 'Changelog']) {
      await clickMenuTab(page, label);
      await assertMenu(page, label);
    }
    await clickMenuClose(page, 'Changelog');
    await clickMenuTab(page, 'Settings');
    assert.equal(await page.evaluate(() => window.__florr.ui.menuPanel), 'Settings');
    for (const row of [0, 1]) await clickSetting(page, row);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('florr-menu')));
    assert.equal(saved.name, 'Menu Flower');
    assert.equal(saved.keyboardMovement, true);
    assert.equal(saved.movementHelper, true);
    await page.reload({ waitUntil: 'load' });
    await page.locator('#player-name').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#player-name').inputValue(), 'Menu Flower');
    await clickMenuTab(page, 'Settings');
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('florr-menu')));
    assert.equal(settings.keyboardMovement, true);
    assert.equal(settings.movementHelper, true);
    await assertMenu(page, 'Settings');
  });

test('Enter starts the garden while a menu panel is open',
  { timeout: 20000 }, async t => {
    const page = await openClient(t);
    await clickMenuTab(page, 'Settings');
    assert.equal((await readState(page)).ui.menuPanel, 'Settings');
    await page.keyboard.press('Enter');
    await waitForState(page, () => window.__florr.ui.started, null,
      'Enter from an open panel must start the game');
    await waitForState(page, () => [...window.__florr.world.all()].some(entity => entity.kind === 1 && entity.health > 0),
      null, 'the garden player must spawn');
    assert.equal(await page.locator('#menu-controls').isVisible(), false);
  });

test('Movement helper setting draws the mouse guide and keyboard movement suppresses it',
  { timeout: 30000 }, async t => {
    for (const [helper, keyboard] of [[false, false], [true, false], [true, true]]) {
      const page = await openClient(t);
      await page.evaluate(() => {
        window.__helperStrokes = 0;
        const stroke = CanvasRenderingContext2D.prototype.stroke;
        CanvasRenderingContext2D.prototype.stroke = function (...args) {
          if (this.canvas.id === 'canvas' && this.lineWidth === 20
            && this.strokeStyle === '#333333' && this.globalAlpha > 0 && this.globalAlpha <= 0.2)
            window.__helperStrokes++;
          return Reflect.apply(stroke, this, args);
        };
      });
      await clickMenuTab(page, 'Settings');
      if (helper) await clickSetting(page, 1);
      if (keyboard) await clickSetting(page, 0);
      await clickMenuClose(page, 'Settings');
      await startWithEnter(page);
      await page.mouse.move(1100, 360);
      if (helper && !keyboard) {
        await page.waitForFunction(() => window.__helperStrokes > 0);
      } else {
        await page.waitForTimeout(350);
        assert.equal(await page.evaluate(() => window.__helperStrokes), 0);
      }
    }
  });

test('Enter from the name input sends the edited name to the server and spawns a player',
  { timeout: 20000 }, async t => {
    const page = await openClient(t);
    const name = 'Keyboard Flower';
    await typeName(page, name + 'X');
    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('#player-name').inputValue(), name);
    await page.keyboard.press('Enter');
    await waitForState(page, () => window.__florr.ui.started
      && [...window.__florr.world.all()].some(entity => entity.kind === 1 && entity.health > 0),
    null, 'Enter from the edited name input must spawn a server player');
    const state = await readState(page);
    assert.equal(state.playerCount, 1, 'the real server accepts the UI spawn');
    const spawns = (await commands(page)).filter(packet => packet.opcode === 6);
    assert.equal(spawns.length, 1, 'one Enter sends exactly one spawn');
    assert.equal(spawns[0].name, name);
    // The domain snapshot can omit names. Do not confuse the local control's
    // empty string4 with a player name: exact name-to-server coverage is the
    // real opcode6 sent above; when replicated, the name is string field48.
    await page.locator('#player-name').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#player-name').isVisible(), false, 'gameplay hides the menu input');
  });

test('bottom hint stops movement in the arena interior and leaving it resumes movement',
  { timeout: 25000 }, async t => {
    const page = await openClient(t);
    const initial = await startWithEnter(page);
    const points = await hudPoints(page);
    // Move upward first so even a low spawn has room below the hint. No
    // teleport, camera override, frozen tick or injected snapshot is used.
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.keyboard.down('KeyW');
    try {
      await waitForState(page, () => {
        const player = [...window.__florr.world.all()].find(entity => entity.kind === 1 && entity.health > 0);
        return player && player.y > -1200 && player.y < 1200;
      }, null, 'movement fixture must reach the vertical arena interior');
    } finally { await page.keyboard.up('KeyW'); }
    await page.mouse.move(viewport.width / 2, 180);
    await page.waitForTimeout(250);
    const movingFrom = (await readState(page)).player;
    await page.waitForTimeout(350);
    const movingTo = (await readState(page)).player;
    assert.equal(movingTo.handle, initial.handle, 'the same player survives the movement fixture');
    assert.ok(Math.hypot(movingTo.x - movingFrom.x, movingTo.y - movingFrom.y) > 1,
      'pointer movement works immediately before entering the hint');
    assert.ok(Math.abs(movingTo.y) < 1600 - movingTo.radius,
      `hint fixture must have free vertical movement, not sit on an arena boundary: ${JSON.stringify(movingTo)}`);
    assert.ok(Math.abs(movingTo.x) + movingTo.radius + 100 < 25000,
      'the fixture also has horizontal clearance from both arena boundaries');

    await page.mouse.move(points.hint.x, points.hint.y);
    await waitForState(page, () => window.__florr.ui.movementDisabled, null,
      'hovering the bottom hint must disable movement');
    const marker = (await commands(page)).length;
    // Zero acceleration preserves momentum briefly in the native simulation.
    // Wait for drag to settle before testing a stationary server position.
    let stoppedFrom = (await readState(page)).player;
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.waitForTimeout(200);
      const sample = (await readState(page)).player;
      assert.ok(sample, 'player must survive while movement settles');
      const distance = Math.hypot(sample.x - stoppedFrom.x, sample.y - stoppedFrom.y);
      stoppedFrom = sample;
      if (distance < 0.15) break;
    }
    await page.waitForTimeout(400);
    const stoppedTo = (await readState(page)).player;
    assert.equal(stoppedTo.handle, initial.handle);
    assert.ok(Math.abs(stoppedFrom.y) < 1600 - stoppedFrom.radius
      && Math.abs(stoppedTo.y) < 1600 - stoppedTo.radius, 'both stopped samples are away from the boundary');
    assert.ok(Math.abs(stoppedFrom.x) + stoppedFrom.radius + 100 < 25000
      && Math.abs(stoppedTo.x) + stoppedTo.radius + 100 < 25000,
    'both stopped samples also have horizontal boundary clearance');
    assert.ok(Math.hypot(stoppedTo.x - stoppedFrom.x, stoppedTo.y - stoppedFrom.y) < 0.5,
      `server player stays still over hint: ${JSON.stringify({ stoppedFrom, stoppedTo })}`);
    const paused = (await commands(page)).slice(marker).filter(packet => packet.opcode === 12);
    assert.ok(paused.length >= 3, 'the server keeps receiving input while the hint is hovered');
    assert.ok(paused.every(packet => packet.strength === 0), 'hint sends zero movement strength');

    await page.mouse.move(1000, 300); // Outside the expanded inventory safe area.
    await waitForState(page, () => !window.__florr.ui.movementDisabled, null,
      'leaving the hint/inventory safe area must restore movement');
    await waitForState(page, previous => {
      const player = window.__florr.world.get(previous.handle);
      return player && Math.hypot(player.x - previous.x, player.y - previous.y) > 1;
    }, stoppedTo, 'the real server player must move again after leaving the hint');
  });

test('pointer drag equipment 0 to reserve 5, then discard, changes real server slots',
  { timeout: 20000 }, async t => {
    const page = await openClient(t);
    const player = await startWithEnter(page);
    const points = await hudPoints(page);
    assert.equal(points.equippedCount, 5, 'level-one reserve starts at absolute slot 5');
    assert.ok(player.slots[0] > 0, 'equipment 0 is occupied');
    assert.equal(player.slots[5], 0, 'reserve 5 starts empty');
    const expected = player.slots.slice();
    [expected[0], expected[5]] = [expected[5], expected[0]];
    let marker = (await commands(page)).length;
    await drag(page, points.equipment[0], points.reserves[0]);
    await expectSlots(page, expected, 'drag 0 -> 5 must change authoritative field60');
    let actions = (await commands(page)).slice(marker).filter(packet => [8, 10, 13].includes(packet.opcode));
    assert.deepEqual(actions.map(packet => [packet.opcode, ...packet.body]),
      [[10, 0, player.slots[0], 5, 0]], 'drag sends precisely the requested source and destination');
    await page.waitForTimeout(320); // Do not turn the next drag into a double-click.
    marker = (await commands(page)).length;
    await drag(page, points.reserves[0], points.discard);
    expected[5] = 0;
    await expectSlots(page, expected, 'drag to discard must remove reserve 5 on the server');
    actions = (await commands(page)).slice(marker).filter(packet => [8, 10, 13].includes(packet.opcode));
    assert.deepEqual(actions.map(packet => [packet.opcode, ...packet.body]),
      [[8, 5, player.slots[0]]], 'discard targets reserve 5, not an equipment slot');
  });

test('swapping equipment re-cools the incoming petal and removes the outgoing child',
  { timeout: 20000 }, async t => {
    const page = await openClient(t);
    await startWithEnter(page);
    const points = await hudPoints(page);
    const livePetals = () => page.evaluate(() => [...window.__florr.world.all()]
      .filter(entity => entity.kind === 3 && entity.health > 0).length);
    assert.equal(await livePetals(), 5);
    await drag(page, points.equipment[0], points.reserves[0]);
    await page.waitForTimeout(300);
    assert.equal(await livePetals(), 4, 'a reserve petal is stored, not orbited');
    await drag(page, points.reserves[0], points.equipment[0]);
    await page.waitForTimeout(300);
    assert.equal(await livePetals(), 4, 'outgoing petal is gone; incoming is still cooling');
    await page.waitForTimeout(3000);
    assert.equal(await livePetals(), 5, 'incoming petal respawns after its recharge');
  });

test('Q/E select nonempty reserves; digits 1..8 swap the selected reserve with equipment',
  { timeout: 30000 }, async t => {
    const page = await openClient(t);
    const player = await startWithEnter(page);
    const points = await hudPoints(page);
    const expected = player.slots.slice();
    const emptyMarker = (await commands(page)).length;
    for (const key of ['KeyQ', 'KeyE']) { await page.keyboard.press(key); await frames(page); }
    await page.waitForTimeout(180);
    assert.deepEqual((await commands(page)).slice(emptyMarker).filter(packet => [8, 10, 13].includes(packet.opcode)), [],
      'Q/E with no occupied reserves must not discard or mutate equipment');
    assert.deepEqual((await readState(page)).player.slots, expected);
    // Native gameplay fixture: two occupied reserves separated by empty 6/7.
    // Both are populated by real drags so a fake local hotbar cannot pass.
    for (const [equipment, reserve] of [[0, 5], [1, 8]]) {
      await drag(page, points.equipment[equipment], points.reserves[reserve - 5]);
      [expected[equipment], expected[reserve]] = [expected[reserve], expected[equipment]];
      await expectSlots(page, expected, `fixture drag ${equipment} -> ${reserve}`);
    }
    await page.mouse.move(points.hint.x, points.hint.y); // Stay still while exercising keys.
    const press = async key => { await page.keyboard.press(key); await frames(page); };
    let marker = (await commands(page)).length;
    for (const key of ['KeyE', 'KeyE', 'KeyQ']) await press(key); // 5 -> 8 -> 5, skipping empties.
    assert.deepEqual((await commands(page)).slice(marker).filter(packet => [8, 10, 13].includes(packet.opcode)), [],
      'Q/E only select; neither discard, bench-cycle nor swap is allowed');
    assert.deepEqual((await readState(page)).player.slots, expected, 'selection leaves server slots unchanged');
    await press('Digit1');
    [expected[5], expected[0]] = [expected[0], expected[5]];
    await expectSlots(page, expected, 'E,E,Q,1 must swap reserve 5 with equipment 0');
    let swaps = (await commands(page)).slice(marker).filter(packet => packet.opcode === 10);
    assert.deepEqual(swaps.map(packet => packet.body), [[5, player.slots[0], 0, 0]],
      'digit 1 proves Q returned from reserve 8 to reserve 5');

    // Selected 5 is empty after that swap: E must skip it and choose 8.
    marker = (await commands(page)).length;
    await press('KeyE');
    // Keep the reserve occupied while checking the available equipment keys;
    // equipment 1 is empty, so digit 2 is deliberately exercised last.
    for (const digit of [3, 4, 5, 1, 2]) {
      const before = expected.slice();
      await press(`Digit${digit}`);
      [expected[8], expected[digit - 1]] = [expected[digit - 1], expected[8]];
      await expectSlots(page, expected, `digit ${digit} swaps selected reserve 8 with equipment ${digit - 1}`);
      const actions = (await commands(page)).slice(marker).filter(packet => packet.opcode === 10);
      if (before[8] === before[digit - 1]) assert.equal(actions.length, 0,
        'native622 ignores exchanges between identical petal types');
      else assert.deepEqual(actions.at(-1)?.body, [8, before[8], digit - 1, before[digit - 1]],
        `digit ${digit} must use the selected reserve, not select/discard a hotbar slot`);
      marker = (await commands(page)).length;
    }
    // Native level-one players have five equipment slots; 6..8 must not touch
    // reserves as if they were unlocked equipment. Test every digit key.
    marker = (await commands(page)).length;
    for (let digit = points.equippedCount + 1; digit <= 8; digit++) await press(`Digit${digit}`);
    await page.waitForTimeout(180);
    assert.deepEqual((await commands(page)).slice(marker).filter(packet => [8, 10, 13].includes(packet.opcode)), [],
      'locked equipment digits do not emit loadout mutations');
    assert.deepEqual((await readState(page)).player.slots, expected);
    assert.equal((await commands(page)).filter(packet => [8, 13].includes(packet.opcode)).length, 0,
      'Q/E and digits never discard or bench-cycle');
  });

test('T discards the keyboard-selected reserve without touching other slots',
  { timeout: 20000 }, async t => {
    const page = await openClient(t);
    const player = await startWithEnter(page);
    const points = await hudPoints(page);
    const expected = player.slots.slice();
    [expected[0], expected[5]] = [expected[5], expected[0]];
    await drag(page, points.equipment[0], points.reserves[0]);
    await expectSlots(page, expected, 'fixture drag 0 -> 5');
    [expected[1], expected[8]] = [expected[8], expected[1]];
    await drag(page, points.equipment[1], points.reserves[3]);
    await expectSlots(page, expected, 'fixture drag 1 -> 8');
    await page.keyboard.press('KeyQ'); await frames(page);
    const marker = (await commands(page)).length;
    await page.keyboard.press('KeyT'); await frames(page);
    expected[5] = 0;
    await expectSlots(page, expected, 'T removes the selected reserve on the server');
    const actions = (await commands(page)).slice(marker).filter(packet => [8, 10, 13].includes(packet.opcode));
    assert.deepEqual(actions.map(packet => [packet.opcode, ...packet.body]),
      [[8, 5, player.slots[0]]], 'T sends one discard for the selected reserve');
    assert.equal((await readState(page)).ui.keyboardSlot, 8, 'focus advances to the next occupied reserve');
    await page.keyboard.press('KeyT'); await frames(page);
    expected[8] = 0;
    await expectSlots(page, expected, 'a second T uses the advanced focus');
    assert.equal((await readState(page)).ui.keyboardSlot, undefined, 'focus clears when the last reserve is discarded');
  });

test('beforeunload warns only after the garden has started',
  { timeout: 15000 }, async t => {
    const page = await openClient(t);
    const dispatch = () => page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      return window.dispatchEvent(event);
    });
    assert.equal(await dispatch(), true, 'menu refresh is not blocked');
    await startWithEnter(page);
    assert.equal(await dispatch(), false, 'refresh during play is blocked by the native guard');
  });

test('death: protocol suicide, keyboard Enter to menu, then immediate Enter while the corpse remains',
  { timeout: 25000 }, async t => {
    const page = await openClient(t);
    const first = await startWithEnter(page, 'First Flower');
    const firstSpawnIndex = (await commands(page)).findIndex(packet => packet.opcode === 6);
    const firstSpawnTick = await page.evaluate(index => window.__menuRegressionPacketTicks[index], firstSpawnIndex);
    await page.evaluate(() => window.__florr.suicide()); // Real opcode 3; fixture only.
    await waitForState(page, () => window.__florr.ui.dead
      && ![...window.__florr.world.all()].some(entity => entity.kind === 1 && entity.health > 0),
    null, 'server suicide must produce the genuine death state');
    const marker = (await commands(page)).length;
    await page.keyboard.press('Enter');
    await waitForState(page, () => !window.__florr.ui.started && !window.__florr.ui.dead,
      null, 'the first Enter after death must return to the menu');
    await page.locator('#player-name').waitFor({ state: 'visible' });
    let state = await readState(page);
    assert.equal(state.playerCount, 0, 'returning to the menu must not respawn');
    assert.equal(await page.locator('#player-name').inputValue(), 'First Flower');
    assert.deepEqual((await commands(page)).slice(marker).filter(packet => [4, 6].includes(packet.opcode)), [],
      'return-to-menu Enter must not call restart or spawn');
    assert.equal(await page.evaluate(handle => [...window.__florr.world.all()]
      .some(entity => entity.kind === 1 && entity.handle === handle && entity.health <= 0), first.handle), true,
    'fast second Enter fixture must still contain the old server corpse');
    await page.keyboard.press('Enter'); // No delay, name edit, click, start() or restart().
    await waitForState(page, previous => window.__florr.ui.started && !window.__florr.ui.dead
      && [...window.__florr.world.all()].some(entity => entity.kind === 1
        && entity.handle !== previous && entity.health > 0),
    first.handle, 'immediate second Enter must eventually spawn after corpse deletion and the original cooldown');
    state = await readState(page);
    const second = state.player;
    assert.equal(state.ui.started, true);
    assert.equal(state.ui.dead, false);
    assert.notEqual(second.handle, first.handle, 'the next keyboard Enter creates a new server body');
    const actions = (await commands(page)).slice(marker).filter(packet => [4, 6].includes(packet.opcode));
    assert.equal(actions.length, 1, 'the second Enter sends exactly one spawn after the engine cooldown');
    assert.equal(actions[0].opcode, 6);
    assert.equal(actions[0].name, 'First Flower');
    const replayIndex = (await commands(page)).findIndex((packet, index) => index >= marker && packet.opcode === 6);
    const replayTick = await page.evaluate(index => window.__menuRegressionPacketTicks[index], replayIndex);
    assert.equal(replayTick - firstSpawnTick, 50,
      'queued respawn waits exactly fifty completed 50ms engine steps, independent of wall time');
  });
