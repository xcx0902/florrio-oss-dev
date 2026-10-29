#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromiumExecutable } from './lib/chromium.mjs';

const root = path.resolve('legacy/web');
const out = path.resolve(process.argv[2] || '/tmp/original-menu.json');
const click = process.argv[3] ? process.argv[3].split(',').map(Number) : [];
const hover = process.argv[4] ? process.argv[4].split(',').map(Number) : [];
const frames = Number(process.argv[5] || 5);
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
await page.addInitScript({ content: strip(await readFile('tools/parity/deterministic-entropy.js', 'utf8')) + '\ninstallDeterministicEntropy();' });
await page.addInitScript({ content: strip(await readFile('tools/parity/virtual-clock.js', 'utf8')) + '\ninstallVirtualClock({ epoch: Date.UTC(2024,0,1,0,0,0), frameMs: 16 });' });
await page.addInitScript({ content: strip(await readFile('tools/parity/canvas-trace.js', 'utf8')) + '\ninstallCanvasTrace({ captureFrames: 3 });' });
await page.addInitScript(() => { try { for (let i = 1; i <= 38; i++) localStorage.setItem('gallery_' + i, '1'); for (let i = 1; i <= 22; i++) localStorage.setItem('mob_' + i, '1'); } catch {} });
await page.goto(origin + '/index.html', { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => document.fonts.ready.then(() => true));
for (let attempt = 0; attempt < 400; attempt++) {
  if (await page.evaluate(() => window.__canvasTrace?.summary?.().frames > 0)) break;
  await new Promise(r => setTimeout(r, 25));
}
await page.evaluate(() => window.__virtualClock.runFrames(90));
console.log('boot ops', await page.evaluate(() => window.__canvasTrace.summary()));
if (process.argv.includes('--start')) {
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__virtualClock.runFrames(120));
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await page.evaluate(() => window.__canvasTrace?.summary?.().frames > 0)) break;
    await new Promise(r => setTimeout(r, 25));
  }
  await page.evaluate(() => window.__virtualClock.runFrames(90));
}
if (click.length === 2) {
  await page.mouse.move(click[0], click[1]);
  await page.evaluate(() => window.__virtualClock.runFrames(2));
  await page.mouse.down();
  await page.evaluate(() => window.__virtualClock.runFrames(2));
  await page.mouse.up();
  await page.evaluate(() => window.__virtualClock.runFrames(20));
}
if (hover.length === 2) {
  await page.mouse.move(hover[0], hover[1]);
  await page.evaluate(() => window.__virtualClock.runFrames(10));
}
await page.evaluate(() => window.__canvasTrace.reset({ captureFrames: 3 }));
await page.evaluate(f => window.__virtualClock.runFrames(f), frames);
const trace = await page.evaluate(() => window.__canvasTrace.export({ scenario: 'probe', viewport: { width: 1280, height: 720 }, frameMs: 16, frames: 3 }));
await writeFile(out, JSON.stringify(trace) + '\n');
const shot = await page.screenshot({ path: out.replace(/\.json$/, '.png') });
console.log('wrote', out, 'ops', trace.totalOps, 'contexts', trace.contexts.length, 'shot', shot.length);
await browser.close();
server.closeAllConnections();
server.close();
