import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { startTestServer } from '../../../tools/lib/test-server.mjs';
import { launchBrowser } from '../../../tools/lib/browser-harness.mjs';
import { startLatencyProxy } from '../support/latency-proxy.mjs';
import { startNativeServer } from '../support/native-server.mjs';
import { evidence, sameEvidence, sha256 } from '../../../tools/verification-evidence.mjs';

let http,
  native,
  browser,
  proxy,
  predictionMode = true;
before(async () => {
  http = await startTestServer(path.resolve(process.env.CLIENT_ROOT || 'dist-next'));
  browser = await launchBrowser();
});
beforeEach(async (t) => {
  native = await startNativeServer(http.origin);
  if (t.name.includes('250ms')) {
    proxy = await startLatencyProxy(native.port, { rttMs: 250, jitterMs: 20 });
  }
});
afterEach(async () => {
  await proxy?.close();
  proxy = undefined;
  predictionMode = true;
  await native?.close();
});
after(async () => {
  await browser?.close();
  await http?.close();
});
async function player(name, roomId = 'garden', prediction = predictionMode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(),
    requests = [],
    errors = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', (error) => errors.push(error.message));
  await context.route('**/connection.json', (route) =>
    route.fulfill({
      json: {
        profile: 'network',
        url: `ws://127.0.0.1:${proxy?.port ?? native.port}/ws`,
        roomId,
        prediction,
      },
    }),
  );
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error('Online entry constructed a Worker');
      }
    };
    window.__sockets = [];
    window.__socketEvents = [];
    const codec = import('/schema/multiplayer.js');
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        window.__sockets.push(this);
        this.addEventListener('message', (event) => {
          void codec.then(({ decodeMessage }) => {
            const m = decodeMessage(new Uint8Array(event.data));
            if (m?.type === 10 || m?.type === 11) {
              window.__socketEvents.push(m.value);
            }
          });
        });
      }
    };
  });
  await page.goto(http.origin + '/?test=1&cheat=1');
  await page.waitForFunction(() => document.querySelector('#menu-controls input'));
  await page.evaluate(async () => {
    const app = (await import('/main.js')).app;
    window.__observedApp = app;
    app.menuControls.keyboardMovement = true;
    window.__authorityTimeline = new Map();
    app.transport.onSnapshot((event) => {
      if (event.kind !== 'network') {
        return;
      }
      window.__authorityTimeline.set(event.value.snapshot.serverTick, {
        health: [...app.world.entitiesOfKind(1)]
          .map((e) => [e.ownerPlayerId, e.health])
          .sort((a, b) => a[0] - b[0]),
        drops: [...app.world.entitiesOfKind(4)].map((e) => e.speciesId).sort((a, b) => a - b),
      });
      if (window.__authorityTimeline.size > 256) {
        window.__authorityTimeline.delete(window.__authorityTimeline.keys().next().value);
      }
    });
    window.__entryFrames = [];
    const draw = app.transitions.drawEntryTransition;
    app.transitions.drawEntryTransition = (now) => {
      window.__entryFrames.push({
        at: now,
        start: app.transitions.entryAt,
        capturedMenu: !!app.transitions.entryCanvas,
      });
      draw(now);
    };
  });
  await page.locator('#menu-controls input').fill(name);
  await page.mouse.move(640, 360);
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  try {
    await page.waitForFunction(() => window.__observedApp?.session.phase === 'playing', undefined, {
      timeout: 15000,
    });
  } catch (error) {
    await mkdir('reports/multiplayer/m07', { recursive: true });
    const observation = { name, prediction: predictionMode, errors, state: await read(page) };
    await writeFile(
      `reports/multiplayer/m07/join-failure-${Date.now()}.json`,
      JSON.stringify(observation, null, 2) + '\n',
    );
    console.error(JSON.stringify(observation));
    await context.close();
    throw error;
  }
  await page.waitForFunction(() => window.__entryFrames.length >= 2);
  assert.ok(
    await page.evaluate(() => window.__entryFrames.every((frame) => frame.capturedMenu)),
    'entry reveals the garden over a captured menu',
  );
  await page.waitForFunction(
    () => Math.abs(window.__observedApp.world.playerEntity()?.x ?? 10000) < 1000,
  );
  await page.waitForFunction(() => {
    const app = window.__observedApp,
      self = app.world.selfState;
    return Math.abs(app.camera.x - self.cameraX) < 20 && Math.abs(app.camera.y - self.cameraY) < 20;
  });
  return { context, page, requests, errors };
}
async function read(page) {
  return page.evaluate(async () => {
    const { app } = await import('/main.js');
    const network = app.network;
    return {
      playerId: app.world.controlledPlayerId,
      handle: app.world.playerEntity()?.handle ?? 0,
      sessionEpoch: network.welcome?.sessionEpoch,
      roomEpoch: Array.from(network.welcome?.roomEpoch ?? []),
      tick: network.serverTick,
      sequence: app.world.lastSequence,
      baseline: network.decoder.baselineId,
      rttMs: network.clock.rttMs,
      predictionMetrics: app.world.prediction.metrics,
      bufferDepth: app.world.snapshotBuffer.depth,
      predictionEnabled: app.world.prediction.enabled,
      connection: app.transport.state,
      notice: app.connectionStatus.textContent,
      socketEvents: window.__socketEvents,
      phase: app.session.phase,
      dead: app.session.dead,
      self: app.world.selfState,
      status: app.session.status,
      camera: { x: app.camera.x, y: app.camera.y },
      slots: [...app.loadout.hotbarTypes],
      players: [...app.world.entitiesOfKind(1)].map((e) => ({
        handle: e.handle,
        owner: e.ownerPlayerId,
        x: e.x,
        y: e.y,
        health: e.health,
        wireHealth: network.decoder.entities
          .get(e.handle)
          ?.records.findLast((record) => record.healthKnown)?.health,
        flags: e.byteFields?.[31],
        name: e.nickname,
      })),
      petals: [...app.world.entitiesOfKind(3)].map((e) => ({
        handle: e.handle,
        owner: e.ownerPlayerId,
        ownerHandle: e.ownerHandle,
        slot: e.slot,
        type: e.speciesId,
      })),
      drops: [...app.world.entitiesOfKind(4)].length,
      dropTypes: [...app.world.entitiesOfKind(4)].map((e) => e.speciesId).sort((a, b) => a - b),
      chat: [...app.world.chat],
      leaderboard: app.world.leaderboard,
      rows: app.renderer.resources.panelSurface?.rows,
      entryStarts: [...new Set(window.__entryFrames?.map((frame) => frame.start))],
      hasDiagnostics: !!window.__florr || !!document.querySelector('#florr-cheat-panel'),
    };
  });
}
for (const prediction of [true, false]) {
  test(
    `two real BrowserContexts at 250ms RTT: PVP death/drop/respawn, resume and isolation, prediction ${prediction ? 'on' : 'off'}`,
    { timeout: 80000 },
    async () => {
      predictionMode = prediction;
      const initial = await evidence();
      const a = await player('Alice'),
        b = await player('Bob', 'garden', !prediction);
      let other;
      const checkpoints = {};
      try {
        await a.page.waitForFunction(
          () => [...window.__observedApp.world.entitiesOfKind(1)].length === 2,
        );
        for (const client of [a, b]) {
          await client.page.waitForFunction(
            () => window.__observedApp.renderer.resources.panelSurface?.rows.length === 2,
          );
        }
        for (const client of [a, b]) {
          await client.page.waitForFunction(
            () => window.__observedApp.network.clock.sampleCount > 0,
          );
        }
        const firstA = await read(a.page),
          firstB = await read(b.page);
        checkpoints.join = [firstA, firstB];
        assert.ok(
          firstA.rttMs >= 200 && firstB.rttMs >= 200,
          'PVP really traverses the TCP delay proxy',
        );
        assert.equal(firstA.predictionEnabled, prediction);
        assert.equal(firstB.predictionEnabled, !prediction);
        assert.notEqual(firstA.playerId, firstB.playerId);
        assert.notEqual(firstA.handle, firstB.handle);
        assert.deepEqual(firstA.roomEpoch, firstB.roomEpoch);
        assert.ok(firstA.petals.some((p) => p.owner === firstA.playerId));
        assert.ok(firstA.petals.some((p) => p.owner === firstB.playerId));
        assert.equal(firstA.self.inventory[0], 26);
        assert.equal(firstB.self.inventory[0], 1);
        assert.equal(firstA.players.find((p) => p.owner === firstB.playerId).name, 'Bob');
        assert.deepEqual(firstA.rows.map((row) => row[0]).sort(), ['Alice', 'Bob']);
        assert.deepEqual(firstB.rows.map((row) => row[0]).sort(), ['Alice', 'Bob']);
        assert.equal(firstA.entryStarts.length, 1);
        assert.equal(firstB.entryStarts.length, 1);
        await a.page.evaluate(() => window.__observedApp.simulation.stop());
        await a.page.waitForFunction(
          (tick) => window.__observedApp.network.serverTick >= tick + 5,
          firstA.tick,
        );
        await a.page.evaluate(() => window.__observedApp.simulation.start());
        checkpoints.independentClock = [await read(a.page), await read(b.page)];
        await a.page.keyboard.down('KeyA');
        await a.page.waitForFunction(
          (x) => window.__observedApp.world.playerEntity().x < x - 25,
          firstA.players.find((p) => p.handle === firstA.handle).x,
        );
        await a.page.keyboard.up('KeyA');
        await b.page.keyboard.down('KeyD');
        await b.page.waitForFunction(
          (x) => window.__observedApp.world.playerEntity().x > x + 25,
          firstB.players.find((p) => p.handle === firstB.handle).x,
        );
        await b.page.keyboard.up('KeyD');
        await a.page.keyboard.down('Space');
        await b.page.keyboard.down('ShiftLeft');
        await b.page.waitForFunction((id) => {
          const app = window.__observedApp;
          return (
            app.world.selfState.buttons === 2 &&
            [...app.world.entitiesOfKind(1)].some(
              (e) => e.ownerPlayerId === id && e.byteFields?.[31] & 1,
            )
          );
        }, firstA.playerId);
        await a.page.keyboard.up('Space');
        await b.page.keyboard.up('ShiftLeft');
        checkpoints.controls = [await read(a.page), await read(b.page)];
        // Trusted movement brings the fixed native loadouts into contact. The engine decides the kill.
        await a.page.keyboard.down('Space');
        const held = new Set(),
          deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
          const state = await read(a.page),
            own = state.players.find((p) => p.owner === firstA.playerId),
            target = state.players.find((p) => p.owner === firstB.playerId);
          if (!target || target.health <= 0) {
            break;
          }
          const keys = new Set();
          if (target.x - own.x > 85) {
            keys.add('KeyD');
          } else if (target.x - own.x < 55) {
            keys.add('KeyA');
          }
          if (target.y - own.y > 12) {
            keys.add('KeyS');
          } else if (target.y - own.y < -12) {
            keys.add('KeyW');
          }
          for (const key of held) {
            if (!keys.has(key)) {
              await a.page.keyboard.up(key);
              held.delete(key);
            }
          }
          for (const key of keys) {
            if (!held.has(key)) {
              await a.page.keyboard.down(key);
              held.add(key);
            }
          }
          await a.page.waitForTimeout(50);
        }
        for (const key of held) {
          await a.page.keyboard.up(key);
        }
        await a.page.keyboard.up('Space');
        await b.page.waitForFunction(
          () => {
            const app = window.__observedApp,
              self = app.world.selfState;
            return (
              app.session.dead &&
              Math.abs(app.camera.x - self.cameraX) < 20 &&
              Math.abs(app.camera.y - self.cameraY) < 20
            );
          },
          undefined,
          { timeout: 3000 },
        );
        const deadA = await read(a.page),
          deadB = await read(b.page);
        checkpoints.death = [deadA, deadB];
        assert.equal(deadA.dead, false);
        assert.equal(deadB.self.killerName, 'Alice');
        assert.equal(deadB.self.deathLevel, 1);
        assert.ok(deadA.drops > 0 || deadB.drops > 0);
        assert.equal(deadB.playerId, firstB.playerId);
        assert.ok(
          Math.abs(deadB.camera.x - deadB.self.cameraX) < 20,
          'death camera stays with Bob',
        );
        // Compare observers of the same simulation tick. Separate real-time fights
        // consume RNG at different ticks, so their random loot rolls may differ.
        const aTimeline = await a.page.evaluate(() => [...window.__authorityTimeline]);
        const bTimeline = new Map(await b.page.evaluate(() => [...window.__authorityTimeline]));
        const sharedDeath = aTimeline.findLast(
          ([tick, state]) =>
            bTimeline.has(tick) &&
            state.health.some(([id, health]) => id === firstB.playerId && health === 0) &&
            state.drops.length,
        );
        assert.ok(sharedDeath, 'both prediction modes observed the death publication');
        assert.deepEqual(
          sharedDeath[1],
          bTimeline.get(sharedDeath[0]),
          'same-tick health and drops agree with prediction on/off',
        );
        await b.page.waitForFunction(() => {
          const app = window.__observedApp;
          return (
            app.network.serverTick >= app.world.selfState.nextSpawnTick &&
            app.world.selfState.life === 3
          );
        });
        // Retained items are finalized by authoritative corpse cleanup, after the
        // first dying snapshot. Compare that completed death transaction.
        const completedDeath = await read(b.page);
        checkpoints.deathFinal = [await read(a.page), completedDeath];
        await b.page.keyboard.press('Enter');
        await b.page.waitForFunction(() => window.__observedApp.session.phase === 'menu');
        await b.page.keyboard.press('Enter');
        await b.page.waitForFunction((handle) => {
          const app = window.__observedApp;
          return app.session.phase === 'playing' && app.world.playerEntity().handle !== handle;
        }, firstB.handle);
        // Spawn is published before the fixture prepares this new life. Wait for
        // that authoritative position and its rendered camera, rather than a frame race.
        await b.page.waitForFunction(() => {
          const app = window.__observedApp,
            self = app.world.selfState;
          return (
            Math.abs(self.cameraX - 240) < 20 &&
            Math.abs(app.camera.x - self.cameraX) < 20 &&
            Math.abs(app.camera.y - self.cameraY) < 20
          );
        });
        const respawned = await read(b.page);
        checkpoints.respawn = [await read(a.page), respawned];
        assert.equal(respawned.playerId, firstB.playerId);
        assert.equal(respawned.self.lifeEpoch, 2);
        assert.ok(respawned.camera.x > 0);
        assert.equal(respawned.entryStarts.length, 2, 'respawn plays one new entry transition');
        const stillA = await read(a.page);
        assert.equal(stillA.handle, firstA.handle);
        assert.ok(Math.abs(stillA.camera.x - stillA.self.cameraX) < 20);
        const before = await read(b.page),
          aTick = (await read(a.page)).tick;
        await b.page.evaluate(() => window.__sockets.at(-1).close());
        await b.page.waitForFunction((epoch) => {
          const app = window.__observedApp;
          return (
            app.transport.state === 'connected' &&
            app.network.welcome.sessionEpoch !== epoch &&
            app.network.decoder.baselineId > 0 &&
            app.world.lastSequence === app.network.decoder.snapshotSeq
          );
        }, before.sessionEpoch);
        const resumed = await read(b.page);
        checkpoints.resume = [await read(a.page), resumed];
        assert.equal(resumed.playerId, before.playerId);
        assert.equal(resumed.handle, before.handle);
        assert.ok(resumed.baseline >= 1);
        assert.equal(resumed.entryStarts.length, 2, 'resume does not replay entry');
        assert.equal(resumed.players.length, 2);
        assert.ok((await read(a.page)).tick > aTick);
        // Neutral input on blur, then server TTL protection while the tab is suspended.
        await b.page.keyboard.down('KeyD');
        await b.page.waitForFunction(() => window.__observedApp.world.selfState.strength > 0);
        await b.page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await b.page.keyboard.up('KeyD');
        await b.page.waitForFunction(
          () =>
            window.__observedApp.world.selfState.strength === 0 &&
            window.__observedApp.world.selfState.inputExpiresTick === 0,
        );
        const baseline = (await read(b.page)).baseline;
        await b.page.evaluate(() => {
          window.dispatchEvent(new Event('focus'));
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await b.page.waitForFunction(
          (baseline) => window.__observedApp.network.decoder.baselineId > baseline,
          baseline,
        );
        await a.page.evaluate(async () => {
          const app = window.__observedApp;
          await app.transport.sendCommand({ kind: 5, text: 'garden-only' });
        });
        await b.page.waitForFunction(() =>
          window.__observedApp.world.chat.some((line) => line.includes('garden-only')),
        );
        await a.page.evaluate(async () => window.__observedApp.session.returnToNetworkMenu());
        other = await player('Alice', 'other');
        const isolated = await read(other.page);
        assert.notDeepEqual(isolated.roomEpoch, firstA.roomEpoch);
        assert.equal(isolated.players.length, 1);
        assert.equal(
          isolated.chat.some((line) => line.includes('garden-only')),
          false,
        );
        await other.page.evaluate(async () => {
          const app = window.__observedApp;
          await app.transport.sendCommand({ kind: 5, text: 'other-only' });
        });
        await other.page.waitForFunction(() =>
          window.__observedApp.world.chat.some((line) => line.includes('other-only')),
        );
        assert.equal(
          (await read(b.page)).chat.some((line) => line.includes('other-only')),
          false,
        );
        checkpoints.isolation = [await read(b.page), await read(other.page)];
        await mkdir('reports/multiplayer/m06', { recursive: true });
        await b.page.screenshot({ path: 'reports/multiplayer/m06/bob-online.png' });
        for (const p of [a, b, other]) {
          assert.deepEqual(
            p.requests.filter((url) =>
              /server\.wasm|server-worker\.js|dev\/test-api|dev\/cheat/.test(url),
            ),
            [],
          );
          assert.deepEqual(p.errors, []);
          assert.equal((await read(p.page)).hasDiagnostics, false);
        }
        for (const checkpoint of Object.values(checkpoints)) {
          for (const state of checkpoint) {
            for (const player of state.players) {
              assert.equal(
                player.health,
                player.wireHealth,
                'rendering never changes wire-authoritative health',
              );
            }
          }
        }
        const summary = {
          killer: deadB.self.killerName,
          loserHealth: deadB.players.find((p) => p.owner === firstB.playerId)?.health ?? 0,
          deathLevel: deadB.self.deathLevel,
          deathScore: deadB.self.deathScore,
          respawnLife: respawned.self.lifeEpoch,
          playerCount: respawned.players.length,
        };
        await mkdir('reports/multiplayer/m07', { recursive: true });
        await writeFile(
          `reports/multiplayer/m07/pvp-${prediction ? 'on' : 'off'}.json`,
          JSON.stringify(
            {
              runId: process.env.VERIFY_RUN_ID ?? null,
              rttMs: 250,
              jitterMs: 20,
              prediction: { Alice: prediction, Bob: !prediction },
              sharedDeath: { tick: sharedDeath[0], ...sharedDeath[1] },
              kept: completedDeath.self.kept,
              summary,
              checkpoints,
            },
            null,
            2,
          ) + '\n',
        );
        if (!prediction) {
          assert.deepEqual(
            summary,
            JSON.parse(await readFile('reports/multiplayer/m07/pvp-on.json', 'utf8')).summary,
          );
        }
        const stable = sameEvidence(initial, await evidence());
        assert.equal(stable, true);
        const artifacts = {};
        for (const name of ['florr_server', 'server_browser_fixture']) {
          artifacts[name] = sha256(await readFile(`build/native/server/${name}`));
        }
        await writeFile(
          'reports/multiplayer/m06/browser-pvp.json',
          JSON.stringify(
            {
              runId: process.env.VERIFY_RUN_ID ?? null,
              passed: true,
              stable,
              evidence: initial,
              artifacts,
              checkpoints,
              requests: [a.requests, b.requests, other.requests],
            },
            null,
            2,
          ) + '\n',
        );
      } finally {
        await mkdir('reports/multiplayer/m06', { recursive: true });
        await writeFile(
          'reports/multiplayer/m06/browser-attempt.json',
          JSON.stringify(
            { checkpoints, final: [await read(a.page), await read(b.page)] },
            null,
            2,
          ) + '\n',
        );
        for (const client of [a, b, other].filter(Boolean)) {
          await client.page.evaluate(() => window.__observedApp.session.returnToNetworkMenu());
        }
        await a.context.close();
        await b.context.close();
        await other?.context.close();
      }
    },
  );
}
test(
  'leaderboard renders all room players outside the AOI and removes a player after Leave',
  { timeout: 35000 },
  async () => {
    const a = await player('Alice'),
      b = await player('Bob');
    try {
      await b.page.waitForFunction(
        () => window.__observedApp.renderer.resources.panelSurface?.rows.length === 2,
      );
      await b.page.keyboard.down('KeyD');
      await b.page.waitForFunction(
        () => [...window.__observedApp.world.entitiesOfKind(1)].length === 1,
        undefined,
        { timeout: 12000 },
      );
      await b.page.keyboard.up('KeyD');
      const distant = await read(b.page);
      assert.deepEqual(distant.rows.map((row) => row[0]).sort(), ['Alice', 'Bob']);
      assert.equal(distant.leaderboard.length, 2);
      assert.equal(distant.rows.find((row) => row[0] === 'Bob')[1], true);
      assert.equal(distant.rows.find((row) => row[0] === 'Alice')[1], false);
      await a.page.evaluate(() => window.__observedApp.session.returnToNetworkMenu());
      await b.page.waitForFunction(
        () => window.__observedApp.renderer.resources.panelSurface?.rows.length === 1,
      );
      assert.deepEqual(
        (await read(b.page)).rows.map((row) => row[0]),
        ['Bob'],
      );
      assert.deepEqual(a.errors, []);
      assert.deepEqual(b.errors, []);
    } finally {
      await a.page.evaluate(() => window.__observedApp.session.returnToNetworkMenu());
      await b.page.evaluate(() => window.__observedApp.session.returnToNetworkMenu());
      await a.context.close();
      await b.context.close();
    }
  },
);
test(
  'ordinary online entry reports an unavailable server and retains nickname/menu without loading local simulation',
  { timeout: 15000 },
  async () => {
    const context = await browser.newContext(),
      page = await context.newPage();
    const requests = [];
    try {
      await context.route('**/connection.json', (route) =>
        route.fulfill({ json: { url: 'ws://127.0.0.1:1/ws', roomId: 'garden' } }),
      );
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(http.origin);
      await page.waitForFunction(() => document.querySelector('#menu-controls input'));
      await page.evaluate(async () => {
        window.__observedApp = (await import('/main.js')).app;
        window.__observedApp.menuControls.keyboardMovement = true;
      });
      await page.locator('#menu-controls input').fill('Remember me');
      await page.waitForTimeout(400);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() =>
        document.querySelector('#connection-status')?.textContent.includes('Cannot connect'),
      );
      await page.getByRole('button', { name: 'Return to menu' }).click();
      assert.equal(await page.locator('#menu-controls input').inputValue(), 'Remember me');
      assert.deepEqual(
        requests.filter((url) => /server\.wasm|server-worker\.js/.test(url)),
        [],
      );
    } finally {
      await context.close();
    }
  },
);
