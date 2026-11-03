import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { startTestServer } from '../../../tools/lib/test-server.mjs';
import { launchBrowser } from '../../../tools/lib/browser-harness.mjs';
import { evidence, sameEvidence } from '../../../tools/verification-evidence.mjs';
import { startNativeServer } from '../support/native-server.mjs';
import { startLatencyProxy } from '../support/latency-proxy.mjs';
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] ?? null;

test(
  'latency proxy preserves every TCP byte in both directions under jitter and a stall',
  { timeout: 10000 },
  async () => {
    const requests = [],
      expected = Buffer.alloc(128 * 1024);
    for (let i = 0; i < expected.length; i++) {
      expected[i] = (i * 17 + Math.floor(i / 256)) % 251;
    }
    const server = net.createServer((socket) => {
      socket.setNoDelay(true);
      socket.on('data', (bytes) => {
        requests.push(bytes);
        socket.write(bytes);
      });
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    let proxy, client, deadline;
    try {
      proxy = await startLatencyProxy(server.address().port, { rttMs: 80, jitterMs: 20 });
      client = net.connect(proxy.port, '127.0.0.1');
      client.setNoDelay(true);
      const echoes = [];
      let length = 0;
      const echoed = new Promise((resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('TCP echo deadline')), 5000);
        client.once('error', reject);
        client.on('data', (bytes) => {
          echoes.push(bytes);
          length += bytes.length;
          if (length >= expected.length) {
            resolve(Buffer.concat(echoes));
          }
        });
      });
      for (let at = 0; at < expected.length; at += 256) {
        if (at === expected.length / 2) {
          proxy.stall(80);
        }
        client.write(expected.subarray(at, at + 256));
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      assert.deepEqual(await echoed, expected);
      assert.deepEqual(Buffer.concat(requests), expected);
      assert.equal(proxy.stats.stalls, 1);
    } finally {
      clearTimeout(deadline);
      client?.destroy();
      await proxy?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);

test(
  'real TCP/browser latency matrix: 0/80/150/250ms RTT, jitter, prediction comparison, convergence and reconnect',
  { timeout: 240000 },
  async () => {
    const initial = await evidence(),
      rows = [];
    const http = await startTestServer(path.resolve(process.env.CLIENT_ROOT || 'dist-next')),
      browser = await launchBrowser();
    let passed = false;
    try {
      for (const rttMs of [0, 80, 150, 250]) {
        for (const jitterMs of [0, 20]) {
          for (const prediction of [false, true]) {
            const native = await startNativeServer(http.origin),
              proxy = await startLatencyProxy(native.port, { rttMs, jitterMs });
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } }),
              page = await context.newPage(),
              errors = [],
              requests = [];
            page.on('pageerror', (e) => errors.push(e.message));
            page.on('request', (r) => requests.push(new URL(r.url()).pathname));
            let row = { rttMs, jitterMs, prediction };
            rows.push(row);
            try {
              await context.route('**/connection.json', (route) =>
                route.fulfill({
                  json: {
                    profile: 'network',
                    url: `ws://127.0.0.1:${proxy.port}/ws`,
                    roomId: 'garden',
                    prediction,
                  },
                }),
              );
              await page.addInitScript(() => {
                const WS = window.WebSocket;
                window.__sockets = [];
                window.WebSocket = class extends WS {
                  constructor(...args) {
                    super(...args);
                    window.__sockets.push(this);
                  }
                };
                window.Worker = class {
                  constructor() {
                    throw new Error('Network prediction loaded Worker');
                  }
                };
              });
              await page.goto(http.origin);
              await page.waitForFunction(() => document.querySelector('#menu-controls input'));
              await page.evaluate(async () => {
                const app = (await import('/main.js')).app;
                window.__app = app;
                app.menuControls.keyboardMovement = true;
              });
              await page.locator('#menu-controls input').fill('Alice');
              await page.mouse.move(640, 360);
              await page.waitForTimeout(400);
              await page.keyboard.press('Enter');
              await page.waitForFunction(
                () =>
                  window.__app.session.phase === 'playing' &&
                  Math.abs(window.__app.world.selfState.positionX) < 1000,
                undefined,
                { timeout: 12000 },
              );
              await page.waitForFunction(
                () => window.__app.network.clock.sampleCount > 0,
                undefined,
                { timeout: 5000 },
              );
              await page.waitForTimeout(400);
              await page.evaluate(() => {
                const app = window.__app;
                Object.assign(app.world.prediction.metrics, {
                  corrections: 0,
                  snaps: 0,
                  resyncs: 0,
                  error: 0,
                  maxError: 0,
                  correctionDistance: 0,
                  maxFrameMs: 0,
                  responses: [],
                });
                window.__responses = [];
                window.__frames = [];
                window.__renderCpu = [];
                window.__pending = undefined;
                window.__stopAt = undefined;
                window.__stopSeq = undefined;
                window.__lastApplied = 0;
                window.__convergence = [];
                app.network.onInput((input) => {
                  if (window.__stopAt !== undefined && input.strength === 0) {
                    window.__stopSeq ??= input.inputSeq;
                  }
                });
                app.transport.onSnapshot((event) => {
                  if (event.kind === 'network') {
                    window.__lastApplied = event.value.snapshot.lastAppliedInputSeq;
                  }
                });
                window.addEventListener(
                  'keydown',
                  (event) => {
                    if (event.code !== 'KeyD' || event.repeat) {
                      return;
                    }
                    const e = app.world.playerEntity(),
                      p = app.renderer.playerTransform.get(e, performance.now(), {
                        x: app.camera.panX,
                        y: app.camera.panY,
                      });
                    window.__pending = { at: performance.now(), x: p.x };
                  },
                  true,
                );
                window.addEventListener(
                  'keyup',
                  (event) => {
                    if (event.code === 'KeyD') {
                      window.__stopAt = performance.now();
                      window.__stopSeq = undefined;
                    }
                  },
                  true,
                );
                const frame = app.renderer.frame;
                app.renderer.frame = (...args) => {
                  const started = performance.now();
                  frame(...args);
                  window.__renderCpu.push(performance.now() - started);
                  if (window.__renderCpu.length > 256) {
                    window.__renderCpu.shift();
                  }
                  const e = app.world.healthyPlayer();
                  if (!e) {
                    return;
                  }
                  const p = app.renderer.playerTransform.get(e, args[0], {
                    x: app.camera.panX,
                    y: app.camera.panY,
                  });
                  if (window.__pending && p.x - window.__pending.x > 0.5) {
                    window.__responses.push(performance.now() - window.__pending.at);
                    window.__pending = undefined;
                  }
                  if (
                    window.__stopAt !== undefined &&
                    window.__stopSeq !== undefined &&
                    window.__lastApplied >= window.__stopSeq &&
                    app.world.selfState.strength === 0 &&
                    Math.hypot(p.x - e.x, p.y - e.y) <= 1
                  ) {
                    window.__convergence.push(performance.now() - window.__stopAt);
                    window.__stopAt = undefined;
                  }
                  window.__frames.push({ at: args[0], x: p.x });
                  if (window.__frames.length > 256) {
                    window.__frames.shift();
                  }
                };
              });
              for (let event = 0; event < 8; event++) {
                await page.keyboard.down('KeyD');
                await page.waitForTimeout(100);
                await page.keyboard.up('KeyD');
                // Observe the entire 1s convergence budget before another input can
                // replace this stop. The asserted deadline remains 1000ms below.
                await page.waitForTimeout(1100);
              }
              await page.waitForTimeout(400);
              const measured = await page.evaluate(() => {
                const app = window.__app,
                  e = app.world.playerEntity(),
                  p = app.renderer.playerTransform.get(e, performance.now(), { x: 0, y: 0 });
                return {
                  renderCpuMs: window.__renderCpu,
                  responses: window.__responses,
                  stopConvergenceMs: window.__convergence,
                  rtt: app.network.clock.rttMs,
                  clockSamples: app.network.clock.sampleCount,
                  delay: app.network.clock.delayMs,
                  convergenceError: Math.hypot(p.x - e.x, p.y - e.y),
                  predictionMetrics: app.world.prediction.metrics,
                  bufferDepth: app.world.snapshotBuffer.depth,
                  inputDepth: app.world.prediction.depth,
                  resyncs: app.network.resyncCount,
                  tick: app.network.serverTick,
                  session: app.network.welcome.sessionEpoch,
                };
              });
              row = {
                ...row,
                ...measured,
                inputP95Ms: percentile(measured.responses, 0.95),
                renderCpuP95Ms: percentile(measured.renderCpuMs, 0.95),
                proxy: proxy.stats,
              };
              rows[rows.length - 1] = row;
              assert.equal(measured.responses.length, 8, JSON.stringify(row));
              if (prediction) {
                assert.ok(row.inputP95Ms <= 50, JSON.stringify(row));
              }
              assert.ok(measured.convergenceError <= 1, JSON.stringify(row));
              assert.equal(measured.stopConvergenceMs.length, 8);
              assert.ok(Math.max(...measured.stopConvergenceMs) <= 1000, JSON.stringify(row));
              assert.ok(
                row.renderCpuP95Ms <= 8,
                'same 8ms render CPU budget as tools/performance/acceptance.mjs',
              );
              assert.ok(
                measured.bufferDepth <= 8 &&
                  measured.inputDepth <= 256 &&
                  measured.predictionMetrics.replayDepth <= 4,
              );
              if (rttMs === 250 && jitterMs === 20 && prediction) {
                proxy.stall(300);
                await page.keyboard.down('KeyD');
                await page.waitForTimeout(200);
                await page.keyboard.up('KeyD');
                await page.waitForTimeout(1200);
                const epoch = await page.evaluate(() => window.__app.network.welcome.sessionEpoch);
                proxy.interrupt();
                await page.waitForFunction(
                  (epoch) =>
                    window.__app.network.welcome?.sessionEpoch !== epoch &&
                    window.__app.network.decoder.baselineId > 0 &&
                    window.__app.network.state === 'connected',
                  epoch,
                  { timeout: 8000 },
                );
                await page.waitForFunction(() => window.__app.network.clock.sampleCount > 0);
                row.reconnected = await page.evaluate(() => ({
                  depth: window.__app.world.prediction.depth,
                  life: window.__app.world.selfState.lifeEpoch,
                  handle: window.__app.world.playerEntity().handle,
                  session: window.__app.network.welcome.sessionEpoch,
                }));
                assert.notEqual(row.reconnected.session, epoch);
                assert.equal(row.reconnected.life, 1);
              }
              const serverMetrics = await (
                await fetch(`http://127.0.0.1:${native.port}/metrics`)
              ).json();
              row.serverProcessingMaxMs = serverMetrics.maxTickMicros / 1000;
              row.serverMetrics = serverMetrics;
              assert.equal(serverMetrics.rateRejected, 0);
              assert.deepEqual(errors, []);
              assert.deepEqual(
                requests.filter((url) => /server\.wasm|server-worker\.js/.test(url)),
                [],
              );
              await page.evaluate(() => window.__app.session.returnToNetworkMenu());
              const cleared = await page.evaluate(() => ({
                timers: window.__app.network.timerCount,
                input: window.__app.world.prediction.depth,
                buffer: window.__app.world.snapshotBuffer.entityCount,
              }));
              assert.deepEqual(cleared, { timers: 0, input: 0, buffer: 0 });
            } catch (error) {
              row.failure = {
                message: error.message,
                errors,
                observed: await page
                  .evaluate(() => {
                    const app = window.__app;
                    return {
                      status: document.querySelector('#status')?.textContent,
                      phase: app?.session.phase,
                      notice: app?.session.status,
                      connection: app?.network.state,
                      self: app?.world.selfState,
                      tick: app?.network.serverTick,
                      disposed: app?.disposed,
                      running: app?.running,
                      frozen: app?.frozen,
                      pending: app?.network.pendingCount,
                      keyboardEnter: app?.input.keyboard.isDown('Enter'),
                      socket: window.__sockets?.map((s) => s.readyState),
                    };
                  })
                  .catch((e) => ({ error: e.message })),
              };
              throw error;
            } finally {
              await context.close();
              await proxy.close();
              await native.close();
            }
          }
        }
      }
      passed = true;
    } finally {
      await browser.close();
      await http.close();
      await mkdir('reports/multiplayer/m07', { recursive: true });
      await writeFile(
        'reports/multiplayer/m07/latency-matrix.json',
        JSON.stringify(
          {
            runId: process.env.VERIFY_RUN_ID ?? null,
            passed,
            stable: sameEvidence(initial, await evidence()),
            evidence: initial,
            transport:
              'ordered TCP byte-stream delay; no WebSocket messages dropped; jitter is +/-10ms per direction (RTT +/-20ms); controlled 300ms stall and socket interruption',
            rows,
          },
          null,
          2,
        ) + '\n',
      );
    }
  },
);
