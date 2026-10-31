#!/usr/bin/env node
/** Exercise the actual default serve.mjs entrypoint. */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { launchBrowser } from './lib/browser-harness.mjs';
import { evidence, sameEvidence, sha256, treeIdentity } from './verification-evidence.mjs';
import { atomicJson, assertVerificationOwner } from './verification/io.mjs';

await assertVerificationOwner();
const initial = await evidence();
const delivery = await treeIdentity('.', ['dist-next']);
const report = { generatedAt: new Date().toISOString(), evidence: initial,
  target: { root: 'dist-next', sha256: delivery.sha256 }, entries: [], passed: false };
const browser = await launchBrowser();
try {
  for (const entry of [
    { name: 'default', root: 'dist-next', args: [], worker: 'server-worker.js', wasm: 'server.wasm' },
  ]) {
    const reservation = net.createServer();
    await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const server = spawn(process.execPath, ['serve.mjs', ...entry.args, '--no-open', '--port', String(port)],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('serve.mjs startup timeout')), 10000);
      server.on('error', error => { clearTimeout(timer); reject(error); });
      server.on('exit', code => { clearTimeout(timer); reject(new Error(`serve.mjs exited ${code}: ${output}`)); });
      server.stdout.on('data', bytes => {
        output += bytes;
        const origin = output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
        if (origin) { clearTimeout(timer); resolve(origin); }
      });
      server.stderr.on('data', bytes => { output += bytes; });
    });
    let page;
    try {
      const origin = await ready;
      const errors = [];
      page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        const probe = window.__entrySmoke = { workers: [], dataPackets: 0, largePackets: 0, sends: 0, errors: [] };
        window.Worker = class extends NativeWorker {
          constructor(url, options) {
            super(url, options);
            probe.workers.push(String(url));
            this.addEventListener('error', event => probe.errors.push(event.message || 'worker error'));
            this.addEventListener('message', event => {
              const data = event.data;
              if (data?.error) probe.errors.push(String(data.error));
              const size = data?.data?.byteLength ?? 0;
              if (size > 0) probe.dataPackets++;
              if (size > 64) probe.largePackets++;
            });
          }
          postMessage(message, transfer) {
            if (message?.funcName === 'sp_server_send') probe.sends++;
            if (message?.funcName === 'step') probe.sends += message.inputs.length;
            return super.postMessage(message, transfer);
          }
        };
      });
      const response = await page.goto(origin, { waitUntil: 'load' });
      if (response.status() !== 200) throw new Error(`entry HTTP ${response.status()}`);
      for (const file of ['index.html', entry.worker, entry.wasm]) {
        const result = await page.request.get(origin + file);
        if (result.status() !== 200 || sha256(await result.body()) !== sha256(await readFile(path.join(entry.root, file))))
          throw new Error(`entrypoint served different bytes: ${entry.name}/${file}`);
      }
      await page.waitForFunction(() => window.__entrySmoke.dataPackets > 0 && document.querySelector('canvas'), undefined, { timeout: 15000 });
      // Allow the real menu to initialize before trusted keyboard input.
      await page.waitForFunction(() => performance.now() > 1500);
      const before = sha256(await page.screenshot());
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__entrySmoke.sends > 0 && window.__entrySmoke.largePackets > 0
        && (!window.__florr || (window.__florr.ui.started && Array.from(window.__florr.world.all())
          .some(entity => entity.kind === 1 && entity.health > 0))), undefined, { timeout: 15000 });
      await page.mouse.move(1100, 360);
      await page.waitForFunction(() => window.__entrySmoke.sends >= 3);
      const probe = await page.evaluate(() => ({ ...window.__entrySmoke,
        player: window.__florr ? Array.from(window.__florr.world.all()).find(entity => entity.kind === 1)?.handle ?? null : null,
        entities: window.__florr?.world.count ?? null }));
      const screenshot = await page.screenshot();
      const checks = { correctWorker: probe.workers.some(url => url.split('?')[0].endsWith(entry.worker)),
        livePackets: probe.dataPackets > 0 && probe.largePackets > 0,
        trustedInput: probe.sends >= 3, renderedTransition: sha256(screenshot) !== before,
        noErrors: errors.length === 0 && probe.errors.length === 0 };
      const passed = Object.values(checks).every(Boolean);
      await mkdir('reports/entrypoints', { recursive: true });
      await writeFile(`reports/entrypoints/${entry.name}.png`, screenshot);
      report.entries.push({ name: entry.name, root: entry.root, args: entry.args, checks, probe, errors,
        screenshotSha256: sha256(screenshot), passed });
      console.log(`${entry.name}: ${passed ? 'PASS' : 'FAIL'} (${entry.root}, real Worker + keyboard/mouse)`);
    } finally {
      await page?.close();
      if (server.exitCode === null) {
        const closed = new Promise(resolve => server.once('exit', resolve));
        server.kill('SIGTERM');
        await closed;
      }
    }
  }
  report.stable = sameEvidence(initial, await evidence()) && delivery.sha256 === (await treeIdentity('.', ['dist-next'])).sha256;
  report.passed = report.stable && report.entries.length === 1 && report.entries.every(entry => entry.passed);
} catch (error) {
  report.error = error.stack ?? String(error);
} finally {
  await browser.close();
  report.generatedAt = new Date().toISOString();
  await atomicJson('reports/entrypoint-smoke.json', report);
}
if (!report.passed) { console.error(report.error ?? 'entrypoint smoke failed'); process.exitCode = 1; }
