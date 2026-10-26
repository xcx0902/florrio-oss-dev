#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromiumExecutable } from './lib/chromium.mjs';

const root = path.resolve('legacy/web');
const out = process.argv[2] || '/tmp/original-game';
const mode = process.argv[3] || 'idle';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local.test').pathname);
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end('Not found'); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(pathToFileURL(path.resolve('node_modules/playwright-core/index.mjs')).href);
const browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true, args: ['--no-first-run', '--disable-background-networking'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC' });
const strip = s => s.replace(/^export function /gm, 'function ');
await page.addInitScript({ content: strip(await readFile('tools/parity/pinned-ua.js', 'utf8')) + '\ninstallPinnedUserAgent({});' });
await page.addInitScript({ content: strip(await readFile('tools/parity/client-wasm.js', 'utf8')) + '\ninstallClientWasmProbe();' });
await page.addInitScript({ content: strip(await readFile('tools/parity/virtual-clock.js', 'utf8')) + '\ninstallVirtualClock({ epoch: Date.UTC(2024,0,1,0,0,0), frameMs: 16 });' });
await page.addInitScript({ content: strip(await readFile('tools/parity/deterministic-worker.js', 'utf8')) + '\ninstallDeterministicServer({});' });
await page.addInitScript({ content: strip(await readFile('tools/parity/canvas-trace.js', 'utf8')) + '\ninstallCanvasTrace({ captureFrames: 3 });' });
await page.goto(origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => document.fonts.ready.then(() => true));
for (let attempt = 0; attempt < 400; attempt++) {
  if (await page.evaluate(() => window.__parityServer?.ready === true)) break;
  await new Promise(r => setTimeout(r, 25));
}
await page.evaluate(() => window.__virtualClock.runFrames(90));
await page.screenshot({ path: out + '-menu.png' });
await page.keyboard.press('Enter');
await page.evaluate(() => window.__virtualClock.runFrames(90));
await page.screenshot({ path: out + '-game.png' });
const state = await page.evaluate(() => ({ world: window.__clientWasm ? 'yes' : 'no', trace: window.__parityServer?.exportTrace?.().responses?.length }));
console.log('state', state);
if (mode === 'discard-escape') {
  await page.mouse.move(514,620);
  await page.evaluate(() => window.__virtualClock.runFrames(2));
  await page.mouse.down();
  await page.evaluate(() => window.__virtualClock.runFrames(10));
  await page.mouse.move(810,680,{steps:5});
  await page.evaluate(() => window.__virtualClock.runFrames(10));
  await page.mouse.up();
  await page.mouse.move(1150,360);
  await page.evaluate(() => window.__virtualClock.runFrames(120));
  await page.screenshot({ path: out + '-escape.png' });
  await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
  await page.evaluate(() => window.__virtualClock.runFrames(3));
  const tr = await page.evaluate(() => window.__canvasTrace.export({ scenario: 'drop', viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3 }));
  await writeFile(out + '-escape.json', JSON.stringify(tr) + '\n');
} else if (mode === 'discard-run') {
  await page.mouse.move(514,620);
  await page.evaluate(() => window.__virtualClock.runFrames(2));
  await page.mouse.down();
  await page.evaluate(() => window.__virtualClock.runFrames(10));
  await page.mouse.move(810,680,{steps:5});
  await page.evaluate(() => window.__virtualClock.runFrames(30));
  await page.mouse.up();
  await page.evaluate(() => window.__virtualClock.runFrames(20));
  await page.mouse.move(1100,360);
  await page.evaluate(() => window.__virtualClock.runFrames(100));
  await page.screenshot({ path: out + '-discard-run.png' });
  await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
  await page.evaluate(() => window.__virtualClock.runFrames(3));
  const tr0 = await page.evaluate(() => window.__canvasTrace.export({ scenario: 'drop', viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3 }));
  await writeFile(out + '-discard-run0.json', JSON.stringify(tr0) + '\n');
  await page.evaluate(() => window.__virtualClock.runFrames(100));
  await page.screenshot({ path: out + '-discard-run2.png' });
  await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
  await page.evaluate(() => window.__virtualClock.runFrames(3));
  const tr = await page.evaluate(() => window.__canvasTrace.export({ scenario: 'drop', viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3 }));
  await writeFile(out + '-discard-run.json', JSON.stringify(tr) + '\n');
} else if (mode === 'discard') {
  await page.mouse.move(514,620);
  await page.evaluate(() => window.__virtualClock.runFrames(2));
  await page.mouse.down();
  await page.evaluate(() => window.__virtualClock.runFrames(10));
  await page.mouse.move(810,680,{steps:5});
  await page.evaluate(() => window.__virtualClock.runFrames(30));
  await page.screenshot({ path: out + '-discard-before.png' });
  await page.mouse.up();
  for (let i=0;i<12;i++) {
    await page.evaluate(f => window.__virtualClock.runFrames(f), i===0?1:5);
    await page.screenshot({ path: `${out}-discard-${i}.png` });
    if (i === 1 || i === 4) {
      await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
      await page.evaluate(() => window.__virtualClock.runFrames(3));
      const tr = await page.evaluate(() => window.__canvasTrace.export({ scenario: 'drop', viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3 }));
      await writeFile(`${out}-discard-${i}.json`, JSON.stringify(tr) + '\n');
    }
  }
} else if (mode === 'kill') {
  for (let i=0;i<20;i++) {
    await page.mouse.move(1000, 500);
    await page.evaluate(() => window.__virtualClock.runFrames(30));
    await page.screenshot({ path: `${out}-kill-${i}.png` });
  }
} else if (mode === 'hotbar') {
  await page.mouse.move(514,620);
  await page.evaluate(() => window.__virtualClock.runFrames(10));
  await page.screenshot({ path: out + '-hotbar-hover.png' });
  await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
  await page.evaluate(() => window.__virtualClock.runFrames(3));
  const tr = await page.evaluate(() => window.__canvasTrace.export({ scenario: 'hotbar', viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3 }));
  await writeFile(out + '-hotbar.json', JSON.stringify(tr) + '\n');
} else if (mode === 'hover') {
  // Player is centered; initial petals around ~65 world units at 0.6 => 39 px.
  for (const [x,y] of [[640+39,360],[640,360-39],[640-39,360],[640,360+39],[640+28,360-28]]) {
    await page.mouse.move(x,y); await page.evaluate(() => window.__virtualClock.runFrames(4));
    const name = `${out}-hover-${x}-${y}.png`; await page.screenshot({ path: name });
  }
} else if (mode === 'drag') {
  // Hotbar equipped slot 0 at screen (490+35)*? Actually layout scale .7, equipped x=490? probe UI.
  await page.mouse.move(525, 630);
  await page.evaluate(() => window.__virtualClock.runFrames(2));
  await page.mouse.down();
  await page.evaluate(() => window.__virtualClock.runFrames(8));
  await page.screenshot({ path: out + '-drag-down.png' });
  for (const [x,y] of [[525,630],[400,500],[300,300],[500,680],[600,680]]) {
    await page.mouse.move(x,y,{steps:4});
    await page.evaluate(() => window.__virtualClock.runFrames(60));
    await page.screenshot({ path: `${out}-drag-${x}-${y}.png` });
    await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
    await page.evaluate(() => window.__virtualClock.runFrames(3));
    const tr = await page.evaluate(() => window.__canvasTrace.export({ scenario: 'drag', viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3 }));
    await writeFile(`${out}-drag-${x}-${y}.json`, JSON.stringify(tr) + '\n');
  }
  await page.mouse.up();
  await page.evaluate(() => window.__virtualClock.runFrames(8));
  await page.screenshot({ path: out + '-drag-up.png' });
}
await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
await page.evaluate(() => window.__virtualClock.runFrames(3));
const trace = await page.evaluate(() => window.__canvasTrace.export({ scenario: 'probe', viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3 }));
await writeFile(out + '.json', JSON.stringify(trace) + '\n');
await browser.close(); server.closeAllConnections(); server.close();
