#!/usr/bin/env node
/** Runs the frozen client and server with existing read-only parity helpers.
 * The UI fixture changes only live client memory; no original file is written. */
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { chromiumExecutable } from '../../../tools/lib/chromium.mjs';
import { findOriginalClientState } from '../../../tools/parity/original-client-state.mjs';

const root = path.resolve('web');
const hashes = {};
for (const name of ['client.wasm', 'sp_server.wasm'])
  hashes[name] = createHash('sha256').update(await readFile(path.join(root, name))).digest('hex');
assert.equal(hashes['client.wasm'], 'c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1');
assert.equal(hashes['sp_server.wasm'], '75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const listener = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' })
      .end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  const scripts = [];
  for (const [file, invocation] of [
    ['pinned-ua.js', 'installPinnedUserAgent({})'],
    ['client-wasm.js', 'installClientWasmProbe()'],
    ['virtual-clock.js', 'installVirtualClock({frameMs:16})'],
    ['deterministic-worker.js', 'installDeterministicServer({})'],
    ['canvas-trace.js', 'installCanvasTrace({captureFrames:3})'],
  ]) scripts.push((await readFile(`tools/parity/${file}`, 'utf8'))
    .replace(/^export function /gm, 'function ') + `\n${invocation};`);
  await page.addInitScript({ content: scripts.join('\n') });
  await page.goto(`http://127.0.0.1:${listener.address().port}/index.html`);
  await page.evaluate(async () => { await document.fonts.load('700 24px Ubuntu'); await document.fonts.ready; });
  await page.waitForFunction(() => window.__parityServer?.ready);
  const advance = frames => page.evaluate(n => window.__virtualClock.advance(n * 16), frames);
  await advance(60);
  await page.keyboard.press('Enter'); await advance(30);
  const state = await page.evaluate(source => (0, eval)(`(${source})`)(window.__clientWasm), findOriginalClientState.toString());
  assert.ok(state, 'real original boot binds a controlled body');
  const fixture = [6, 7, 8, 9, 10, 12, 15, 18, 19, 22, 25, 29, 34, 36, 2, 3];
  await page.evaluate(({ state, fixture }) => {
    const worker = window.__parityServer.worker;
    clearInterval(worker._tickTimer); // Isolate the UI from subsequent server deltas.
    const v = new DataView(window.__clientWasm.memory.buffer), b = new Uint8Array(v.buffer);
    const u = a => v.getUint32(a, true), controller = u(u(state + 264));
    const body = u(controller + 144), player = u(body + 152), health = u(body + 116);
    b.set(fixture, player + 40); b[player + 168] = 45;
    v.setFloat32(health + 8, 0, true);
    v.setFloat32(controller + 108, 1234.5, true); b[controller + 141] = 45;
    window.__deathFixture = { state, controller, body, player, health };
    window.__canvasTrace.reset({ captureFrames: 3 });
  }, { state, fixture });
  const samples = [];
  let progress = 0;
  for (let frame = 1; frame <= 80; ++frame) {
    await advance(1);
    progress = Math.fround(progress + (1 - progress) * (1 - Math.pow(.95, Math.fround(16) * .06)));
    const sample = await page.evaluate(() => ({ progress: window.__clientWasm.f32(159188),
      active: window.__clientWasm.bytes(159192, 1)[0], slots: Array.from(window.__clientWasm.bytes(159200, 16)) }));
    assert.equal(sample.progress, progress, `original animation frame ${frame}`);
    assert.equal(sample.active, 8); assert.deepEqual(sample.slots, fixture);
    if ([1, 2, 10, 30, 80].includes(frame)) samples.push({ frame, ...sample });
  }
  const trace = await page.evaluate(() => window.__canvasTrace.export({ frames: 1 }));
  assert.deepEqual(errors, []);
  const shot = process.argv.indexOf('--screenshot');
  if (shot >= 0) await page.locator('#canvas').screenshot({ path: process.argv[shot + 1] });
  const report = { hashes, fixture: 'real original boot; isolated death HUD memory fixture, level45, all16 slots', samples, trace };
  const at = process.argv.indexOf('--out');
  if (at >= 0) await writeFile(process.argv[at + 1], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ hashes, samples, contexts: trace.contexts.length }));
} finally {
  await browser?.close();
  listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve));
}
