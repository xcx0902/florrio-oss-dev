#!/usr/bin/env node
/** Exercise serve.mjs and the ordinary online entry against the native fixture. */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { launchBrowser } from './lib/browser-harness.mjs';
import { startNativeServer } from '../client/tests/support/native-server.mjs';
import { evidence, sameEvidence, sha256, treeIdentity } from './verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from './verification/io.mjs';
await assertVerificationOwner();
const initial = await evidence(), delivery = await treeIdentity('.', ['dist-next']);
const report = { generatedAt: new Date().toISOString(), evidence: initial, target: { root: 'dist-next', sha256: delivery.sha256 }, entries: [], passed: false };
let browser, native, server, page;
try {
  browser = await launchBrowser();
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  native = await startNativeServer(origin);
  server = spawn(process.execPath, ['serve.mjs', '--no-open', '--port', String(port), '--server', `ws://127.0.0.1:${native.port}/ws`], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('serve.mjs startup timeout')), 10000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`serve.mjs exited ${code}: ${output}`)); });
    server.stderr.on('data', bytes => { output += bytes; });
    server.stdout.on('data', bytes => { output += bytes; if (output.includes(origin + '/')) { clearTimeout(timer); resolve(); } });
  });
  const requests = [], errors = [];
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.Worker = class { constructor() { throw new Error('Online entry constructed Worker'); } }; });
  const response = await page.goto(origin, { waitUntil: 'load' });
  if (response.status() !== 200) throw new Error(`entry HTTP ${response.status()}`);
  for (const file of ['index.html', 'main.js']) {
    const actual = await page.request.get(`${origin}/${file}`);
    if (actual.status() !== 200 || sha256(await actual.body()) !== sha256(await readFile(`dist-next/${file}`))) throw new Error(`entry served different bytes: ${file}`);
  }
  await page.waitForFunction(() => document.querySelector('#menu-controls input'));
  await page.evaluate(async () => { window.__observedApp = (await import('/main.js')).app; });
  await page.locator('#menu-controls input').fill('Alice');
  await page.waitForTimeout(400);
  const before = sha256(await page.screenshot()); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__observedApp?.session.phase === 'playing', undefined, { timeout: 15000 });
  await page.waitForFunction(() => Math.abs(window.__observedApp.world.playerEntity()?.x ?? 10000) < 1000);
  const x = await page.evaluate(async () => (await import('/main.js')).app.world.playerEntity().x);
  await page.keyboard.down('KeyD');
  await page.waitForFunction(x => window.__observedApp.world.playerEntity().x > x + 10, x);
  await page.keyboard.up('KeyD');
  const probe = await page.evaluate(async () => {
    const app = (await import('/main.js')).app;
    return { profile: app.transport.mode, state: app.transport.state, playerId: app.world.controlledPlayerId, controlledHandle: app.world.playerEntity()?.handle,
      entities: app.world.count, serverTick: app.network.serverTick, lifeEpoch: app.world.selfState.lifeEpoch, testApi: !!window.__florr };
  });
  const screenshot = await page.screenshot();
  const checks = { networkProfile: probe.profile === 'network' && probe.state === 'connected', explicitIdentity: probe.playerId > 0 && probe.controlledHandle > 0,
    nativeSnapshots: probe.serverTick > 0 && probe.entities > 1, trustedInput: true, renderedTransition: sha256(screenshot) !== before,
    noLocalSimulation: !requests.some(p => /server\.wasm|server-worker\.js/.test(p)), noTestApi: !probe.testApi, noErrors: !errors.length };
  await mkdir('reports/entrypoints', { recursive: true }); await writeFile('reports/entrypoints/default.png', screenshot);
  report.entries.push({ name: 'default', root: 'dist-next', checks, probe, errors, requests, screenshotSha256: sha256(screenshot), passed: Object.values(checks).every(Boolean) });
  report.stable = sameEvidence(initial, await evidence()) && delivery.sha256 === (await treeIdentity('.', ['dist-next'])).sha256;
  report.passed = report.stable && report.entries.every(entry => entry.passed);
  console.log(`default: ${report.passed ? 'PASS' : 'FAIL'} (native WebSocket + trusted input, no Worker/WASM)`);
} catch (error) { report.error = error.stack ?? String(error); }
finally {
  await page?.close(); await browser?.close();
  if (server && server.exitCode === null) { const closed = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await closed; }
  await native?.close(); report.generatedAt = new Date().toISOString(); await atomicJson('reports/entrypoint-smoke.json', report);
}
if (!report.passed) { console.error(report.error ?? 'entrypoint smoke failed'); process.exitCode = 1; }
