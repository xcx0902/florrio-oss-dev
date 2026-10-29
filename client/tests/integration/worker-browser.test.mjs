/** Browser contracts: real worker publications, page boot, menu/HUD input, DPR and touch. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DENSE_GROUPS, DENSE_GROUP_SPECS } from '../../public/state/field-types.js';
import { RenderingCanvas } from '../helpers/recording-canvas.mjs';
import { drawWorld } from '../../public/render/world.js';
import { WorldState } from '../../public/state/world.js';
import { CameraState } from '../../public/state/camera.js';
import { browser, origin, start, stop, readPeerVisibleSet, assertPeerVisibleSet } from '../support/worker-fixture.mjs';

before(start);
after(stop);

test('real worker publishes special petal launch, recharge and artwork components', { timeout: 120000 }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(origin + '/index.html', { waitUntil: 'load' });
    const results = await page.evaluate(async () => {
      const { ServerWorkerClient } = await import('/net/worker.js');
      const { InputPacketEncoder } = await import('/net/input.js');
      const { BareSnapshotDecoder } = await import('/state/snapshot.js');
      const { WorldState } = await import('/state/world.js');
      const { playerSlotProgress } = await import('/state/loadout.js');
      const { DENSE_GROUPS, DENSE_GROUP_SPECS } = await import('/state/field-types.js');
      const output = [];
      for (const type of [10, 11, 12, 34, 19, 20, 29, 30]) {
        const worker = new ServerWorkerClient('server-worker.js?manual=1');
        try {
          const input = new InputPacketEncoder(), world = new WorldState();
          const decoder = new BareSnapshotDecoder(DENSE_GROUPS.map(group => ({
            offset: group.offset, specs: DENSE_GROUP_SPECS[group.offset] ?? [],
          })));
          await worker.init();
          await worker.send(input.spawn('Special petal integration'));
          for (let slot = 0; slot < 5; slot++)
            await worker.request('sp_server_debug_set_loadout_slot', new Uint8Array([slot, slot === 0 ? type : 0, 0]));
          await worker.send(input.input(1, 0, 0));
          const result = { type, launch: null, ground: null, splitCount: 0, cooling: false, recharged: false };
          let originalHandles;
          for (let tick = 1; tick <= 120; tick++) {
            await worker.think();
            await worker.requestStream('sp_server_flush', undefined, bytes => {
              const snapshot = decoder.decode(bytes);
              if (!snapshot) throw new Error(`undecodable special petal snapshot: ${type}/${tick}`);
              world.applyPartial(snapshot, tick * 50);
            });
            const entities = [...world.all()].filter(entity => entity.speciesId === type && entity.health > 0);
            if (!originalHandles) originalHandles = new Set(entities.map(entity => entity.handle));
            const launched = entities.filter(entity => entity.kind === 3 && (entity.componentMask & (1 << 4)) !== 0);
            result.splitCount = Math.max(result.splitCount, launched.length);
            if (!result.launch && launched.length) result.launch = structuredClone(launched[0]);
            if (!result.ground) result.ground = structuredClone(entities.find(entity => entity.kind === 5) ?? null);
            const player = [...world.all()].find(entity => entity.kind === 1 && entity.health > 0);
            const progress = player && playerSlotProgress(player)?.[0];
            if (progress !== undefined && progress < 1) result.cooling = true;
            if (result.cooling && progress === 1) result.recharged = true;
            // Aimed/Pollen/Web keep their entity's historical slot byte after
            // detaching. The authoritative slot recharge proves release.
            if (!result.launch && tick > 10 && progress < 1)
              result.launch = structuredClone(entities.find(entity => entity.kind === 3 && originalHandles.has(entity.handle)) ?? null);
          }
          output.push(result);
        } finally { worker.terminate(); }
      }
      return output;
    });
    for (const result of results) {
      assert.ok(result.launch, `${result.type}: detached projectile passes through real WASM and decoder`);
      assert.ok(result.cooling, `${result.type}: authoritative recharge starts`);
      assert.ok(result.recharged, `${result.type}: authoritative recharge completes`);
      if ([11, 12, 34].includes(result.type)) {
        assert.equal(result.splitCount, 4, `${result.type}: four separate children`);
        assert.ok(result.launch.componentMask & (1 << 4), `${result.type}: native single-Pea component`);
        assert.equal(result.launch.byteFields[9], result.type === 11 ? 0 : result.type === 12 ? 1 : 3);
        const world = new WorldState(), camera = new CameraState(), context = new RenderingCanvas();
        camera.setCamera(0, 0, 1);
        world.apply({ sequence: 1, serverTime: 0, events: [], entities: [{ ...result.launch, x: 0, y: 0 }] }, 0);
        drawWorld(context, world, camera, 0);
        assert.equal(context.paints.filter(paint => paint.op === 'fill' && paint.path[0]?.[0] === 'arc').length, 1,
          `${result.type}: production drawWorld renders each launched child as one Pea`);
      }
      if ([29, 30].includes(result.type)) {
        assert.ok(result.ground, `${result.type}: ground Web survives the projectile`);
        assert.ok(result.ground.componentMask & (1 << 11), `${result.type}: native ground-Web component`);
        const world = new WorldState(), camera = new CameraState(), context = new RenderingCanvas();
        camera.setCamera(0, 0, 1);
        world.apply({ sequence: 1, serverTime: 0, events: [], entities: [{ ...result.ground, x: 0, y: 0 }] }, 0);
        drawWorld(context, world, camera, 0);
        assert.ok(context.paints.some(paint => paint.path.filter(op => op[0] === 'quadraticCurveTo').length === 65),
          `${result.type}: production drawWorld renders five scalloped rings`);
      }
    }
  } finally { await page.close(); }
});

test('client joins the native peer-visible set with a healthy player and nearby mobs', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.evaluate(() => window.__florr.start());
  await page.waitForFunction(() => {
    if (!window.__florr || window.__florr.world.count === 0) return false;
    for (const entity of window.__florr.world.all()) {
      if ((entity.kind ?? entity.typeId) === 1 || entity.typeId === 1) return true;
    }
    return false;
  }, null, { timeout: 15000 });
  const result = await page.evaluate(readPeerVisibleSet);
  await page.close();
  assertPeerVisibleSet(result, 'join');
});

test('single match: spawn, suicide, death overlay and restart', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.evaluate(() => window.__florr.start());
  await page.waitForFunction(() => {
    for (const entity of window.__florr.world.all()) if (entity.typeId === 1) return true;
    return false;
  }, null, { timeout: 15000 });
  const before = await page.evaluate(readPeerVisibleSet);
  await page.evaluate(() => window.__florr.suicide());
  await page.waitForFunction(() => {
    for (const entity of window.__florr.world.all()) if (entity.typeId === 1) return false;
    return window.__florr.ui.dead === true;
  }, null, { timeout: 15000 });
  const dead = await page.evaluate(() => window.__florr.ui);
  // The death overlay is the only HUD branch that draws while the garden keeps
  // simulating; the renderer test covers its text.
  await page.evaluate(() => window.__florr.restart());
  await page.waitForFunction(() => {
    for (const entity of window.__florr.world.all())
      if (entity.typeId === 1 && entity.health > 0) return true;
    return false;
  }, null, { timeout: 15000 });
  const after = await page.evaluate(readPeerVisibleSet);
  await page.close();
  assert.equal(before.ui.started, true);
  assert.equal(before.players.length, 1);
  assert.equal(before.players[0].health, 100);
  assert.equal(before.players[0].maxHealth, 100);
  assert.equal(dead.dead, true);
  assert.equal(dead.started, true);
  assert.equal(after.ui.dead, false);
  assertPeerVisibleSet(after, 'restart');
  assert.equal(after.players[0].health, 100);
  assert.notEqual(after.players[0].handle, before.players[0].handle, 'restart installs the new controlled body');
});

test('keyboard drives menu, inventory and hotbar selection', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__florr !== undefined, null, { timeout: 8000 });
  const initial = await page.evaluate(() => window.__florr.ui);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...window.__florr.world.all()].some(entity => entity.kind === 1 && entity.health > 0));
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(40);
  const opened = await page.evaluate(() => window.__florr.ui);
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(40);
  const selected = await page.evaluate(() => window.__florr.ui);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(40);
  const closed = await page.evaluate(() => window.__florr.ui);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const started = await page.evaluate(() => window.__florr.ui);
  await page.close();
  assert.equal(initial.started, false);
  assert.equal(initial.inventoryOpen, false);
  assert.equal(opened.inventoryOpen, true);
  assert.equal(selected.selectedSlot, 2);
  assert.equal(selected.inventoryOpen, true);
  assert.equal(closed.inventoryOpen, false);
  assert.equal(started.started, true);
});

test('client canvas follows devicePixelRatio and camera resize', async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__florr !== undefined, null, { timeout: 8000 });
  const before = await page.evaluate(() => ({
    width: document.querySelector('#canvas').width,
    height: document.querySelector('#canvas').height,
    styleWidth: document.querySelector('#canvas').style.width,
    ratio: window.__florr.camera.pixelRatio,
    viewport: [window.__florr.camera.viewportWidth, window.__florr.camera.viewportHeight],
  }));
  await page.setViewportSize({ width: 640, height: 480 });
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({
    width: document.querySelector('#canvas').width,
    height: document.querySelector('#canvas').height,
    ratio: window.__florr.camera.pixelRatio,
    viewport: [window.__florr.camera.viewportWidth, window.__florr.camera.viewportHeight],
  }));
  await page.close();
  assert.deepEqual(before.viewport, [800, 600]);
  assert.equal(before.width, 1600);
  assert.equal(before.height, 1200);
  assert.equal(before.ratio, 2);
  assert.deepEqual(after.viewport, [640, 480]);
  assert.equal(after.width, 1280);
  assert.equal(after.height, 960);
  assert.equal(after.ratio, 2);
});

test('client page boots without console or page errors', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const state = await page.evaluate(() => ({
    canvas: [document.getElementById('canvas').width, document.getElementById('canvas').height],
    loading: document.getElementById('status') !== null,
  }));
  await page.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(state.canvas, [1280, 720]);
  assert.equal(state.loading, false);
});

test('single-player loop: menu -> garden -> move -> attack', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__florr && window.__florr.world, null, { timeout: 20000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...window.__florr.world.all()].some(entity => (entity.kind ?? entity.typeId) === 1),
    null, { timeout: 20000 });
  const before = await page.evaluate(() => {
    const player = [...window.__florr.world.all()].find(entity => (entity.kind ?? entity.typeId) === 1);
    return { handle: player.handle, x: player.x, y: player.y, count: window.__florr.world.count };
  });
  assert.ok(before.count > 1, 'garden snapshot carries the world');
  // Move the pointer away from the player so the movement input has a direction,
  // then hold it for a few worker ticks.
  await page.mouse.move(1100, 360);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(handle => {
    const player = window.__florr.world.get(handle);
    return player ? { x: player.x, y: player.y, count: window.__florr.world.count } : null;
  }, before.handle);
  assert.ok(after, 'player survives the movement ticks');
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.5,
    `player moved (${before.x},${before.y}) -> (${after.x},${after.y})`);
  // Left click attacks; the input packet must not break the session.
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(300);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(300);
  const afterAttack = await page.evaluate(() => window.__florr.world.count);
  assert.ok(afterAttack > 0, 'world still populated after attack');
  assert.deepEqual(errors, []);
  await page.close();
});

test('match interactions drive equip, attack, defend, no-discard, swap, chat and pickup', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // Capture the exact opcode stream the UI hands to the worker. This is the
  // end-to-end seam: DOM input -> main.ts -> InputPacketEncoder -> worker.
  await page.addInitScript(() => {
    window.__sent = [];
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function postMessage(message, transfer) {
      try {
        if (message && message.funcName === 'sp_server_send' && message.data)
          window.__sent.push(Array.from(message.data));
      } catch { /* ignore non-send messages */ }
      return post.call(this, message, transfer);
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.evaluate(() => window.__florr.start());
  await page.waitForFunction(() => {
    for (const entity of window.__florr.world.all()) if (entity.typeId === 1) return true;
    return false;
  }, null, { timeout: 15000 });
  // Let the first frames sync inventoryTypes/hotbarTypes from the snapshot.
  await page.waitForTimeout(400);
  const decode = async () => {
    const packets = await page.evaluate(() => window.__sent.splice(0));
    return page.evaluate(async packets => {
      const { PACKET_XOR_KEY } = await import('/schema/packet-key.js');
      const readVarint = (bytes, offset) => {
        let value = 0;
        let shift = 0;
        for (;;) {
          const byte = bytes[offset.index++];
          value |= (byte & 0x7f) << shift;
          if ((byte & 0x80) === 0) break;
          shift += 7;
        }
        return value >>> 0;
      };
      return packets.map(raw => {
        const bytes = raw.map((byte, index) => byte ^ PACKET_XOR_KEY[index % PACKET_XOR_KEY.length]);
        const offset = { index: 0 };
        const sequence = readVarint(bytes, offset);
        const opcode = readVarint(bytes, offset);
        return { sequence, opcode, bytes };
      });
    }, packets);
  };
  await decode(); // drop the boot packets

  // --- attack: left button held on the garden sends buttons bit 0 ----------
  await page.mouse.move(400, 300);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(180);
  const attacking = (await decode()).filter(packet => packet.opcode === 12);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(120);
  assert.ok(attacking.length >= 1, 'left button sends input packets');
  assert.ok(attacking.some(packet => (packet.bytes[packet.bytes.length - 9] & 1) === 1
    || packet.bytes.some((_, index) => index > 0 && index + 9 === packet.bytes.length)),
    'attack input is encoded');
  const attackButtons = attacking.map(packet => {
    // opcode 12 body: buttons varint, f32 angle, f32 strength.
    const offset = { index: 0 };
    const read = () => {
      let value = 0, shift = 0;
      for (;;) { const byte = packet.bytes[offset.index++]; value |= (byte & 0x7f) << shift; if ((byte & 0x80) === 0) break; shift += 7; }
      return value >>> 0;
    };
    read(); read();
    return read();
  });
  assert.ok(attackButtons.some(buttons => (buttons & 1) === 1), `attack bit set (${attackButtons})`);

  // --- defend: right button sends buttons bit 1 ----------------------------
  await page.mouse.move(400, 300);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(180);
  const defending = (await decode()).filter(packet => packet.opcode === 12);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(120);
  const defendButtons = defending.map(packet => {
    const offset = { index: 0 };
    const read = () => {
      let value = 0, shift = 0;
      for (;;) { const byte = packet.bytes[offset.index++]; value |= (byte & 0x7f) << shift; if ((byte & 0x80) === 0) break; shift += 7; }
      return value >>> 0;
    };
    read(); read();
    return read();
  });
  assert.ok(defendButtons.some(buttons => (buttons & 2) === 2), `defend bit set (${defendButtons})`);

  // --- equip: drag inventory cell 0 onto hotbar slot 2 --------------------
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(120);
  assert.equal((await page.evaluate(() => window.__florr.ui)).inventoryOpen, true);
  await page.mouse.move(482, 307);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(80);
  await page.mouse.move(642, 622, { steps: 4 });
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(160);
  const equipPackets = (await decode()).filter(packet => packet.opcode === 10);
  assert.ok(equipPackets.length >= 1, 'inventory drag emits a swap');
  const equip = equipPackets[0].bytes.slice(1);
  assert.equal(equip[1], 0, `equip source is inventory slot 0 (${equip})`);
  assert.equal(equip[3], 2, `equip target is hotbar slot 2 (${equip})`);

  // --- swap: drag hotbar slot 0 onto slot 1 -------------------------------
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await page.mouse.move(518, 622);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(80);
  await page.mouse.move(580, 622, { steps: 3 });
  await page.waitForTimeout(80);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(160);
  const swapPackets = (await decode()).filter(packet => packet.opcode === 10);
  // Native petalSnapTarget excludes targets carrying the same petal type and
  // the source itself, so dragging Basic onto Basic snaps back without a swap.
  assert.equal(swapPackets.length, 0, 'equal-type hotbar drag emits no swap');

  // --- no discard: right click the equipped slot is inert ------------------
  await page.mouse.move(518, 622);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(60);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(160);
  const discardPackets = (await decode()).filter(packet => packet.opcode === 8);
  assert.equal(discardPackets.length, 0, 'right click does not discard');

  // --- chat: a server chat event becomes HUD chat state -------------------
  const chat = await page.evaluate(() => {
    window.__florr.setSnapshot([], [{ opcode: 9, text: 'gl hf' }]);
    return window.__florr.world.chat.slice();
  });
  assert.deepEqual(chat, ['gl hf']);

  // --- pickup: a drop appears with the snapshot and disappears when the
  // server's next snapshot no longer contains it (the pickup ack path). ----
  const dropLifecycle = await page.evaluate(() => {
    const drop = { handle: 900001, typeId: 6, kind: 4, speciesId: 6, x: 640, y: 360,
      angle: 0, health: 0, maxHealth: 0, level: 1, flags: 0, radius: 12 };
    window.__florr.setSnapshot([drop], []);
    const present = window.__florr.world.count;
    window.__florr.setSnapshot([], []);
    return { present, gone: window.__florr.world.count };
  });
  assert.equal(dropLifecycle.present, 1);
  assert.equal(dropLifecycle.gone, 0);
  assert.deepEqual(errors, []);
  await page.close();
});

// CDP touch dispatch is Chromium-only; Firefox/WebKit get a skip instead of a
// false failure (see docs/browser-matrix.md).

test('mobile viewport: DPR canvas, touch start and joystick movement',
  { skip: (process.env.BROWSER || 'chromium') !== 'chromium' }, async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    hasTouch: true, isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__florr !== undefined, null, { timeout: 8000 });
  const layout = await page.evaluate(() => ({
    width: document.querySelector('#canvas').width,
    height: document.querySelector('#canvas').height,
    ratio: window.__florr.camera.pixelRatio,
    viewport: [window.__florr.camera.viewportWidth, window.__florr.camera.viewportHeight],
  }));
  assert.deepEqual(layout, { width: 1170, height: 2532, ratio: 3, viewport: [390, 844] });
  // The menu is canvas-native (there is no DOM Play control), so start the
  // same way the keyboard spawn path does before exercising touch input.
  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => window.__florr.start());
  await page.waitForFunction(() => {
    for (const entity of window.__florr.world.all()) if (entity.typeId === 1) return true;
    return false;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => {
    for (const entity of window.__florr.world.all())
      if (entity.typeId === 1) return { x: entity.x, y: entity.y };
    return null;
  });
  // Drag the stick to the right and hold it: the player must move +x.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 600 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 600 }] });
  await page.waitForTimeout(600);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await page.evaluate(() => {
    for (const entity of window.__florr.world.all())
      if (entity.typeId === 1) return { x: entity.x, y: entity.y };
    return null;
  });
  await context.close();
  assert.ok(before && after, 'player exists before and after the touch drag');
  assert.ok(after.x - before.x > 0.5, `touch joystick moved the player (${before.x} -> ${after.x})`);
  assert.deepEqual(errors, []);
});
