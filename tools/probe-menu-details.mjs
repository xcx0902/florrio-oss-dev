#!/usr/bin/env node
/** Render the frozen client in an isolated, offline browser. Discovery keys
 * are synthetic fixtures produced by the original encoders; no live profile,
 * upstream asset or golden is modified. Outputs are diagnostic evidence only. */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chromiumExecutable } from './lib/chromium.mjs';
import { loadOriginal } from '../test/helpers/wasm-probe.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'reports/ui-details');
await fs.mkdir(out, { recursive: true });
const native = await loadOriginal('client', { functionIds: [368, 1102, 1048] });
const bytes = new Uint8Array(native.memory.buffer), view = new DataView(bytes.buffer);
const pointer = native.call(368, 32), stored = { florrio_nickname: 'Synthetic UI fixture' };
for (const [prefix, fn, count] of [['gallery_', 1102, 38], ['mob_', 1048, 22]]) {
  for (let id = 1; id <= count; id++) {
    bytes.fill(0, pointer, pointer + 32); native.call(fn, pointer, id);
    const long = !!(bytes[pointer + 11] & 128);
    const start = long ? view.getUint32(pointer, true) : pointer;
    const size = long ? view.getUint32(pointer + 4, true) : bytes[pointer + 11];
    stored[prefix + id] = new TextDecoder().decode(bytes.subarray(start, start + size));
  }
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, 'web', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(path.join(root, 'web') + path.sep)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await context.addInitScript(stored => { for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value); }, stored);
  for (const [file, invoke] of [
    ['client-wasm.js', 'installClientWasmProbe();'],
    ['virtual-clock.js', 'installVirtualClock({frameMs:16});'],
    ['deterministic-worker.js', 'installDeterministicServer({});'],
    ['canvas-trace.js', 'installCanvasTrace({captureFrames:3});'],
  ]) await context.addInitScript((await fs.readFile(path.join(root, 'tools/parity', file), 'utf8')).replace(/^export function /gm, 'function ') + '\n' + invoke);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  // Playwright's default rAF poll cannot run while the virtual clock is paused.
  await page.evaluate(async () => {
    for (let attempt = 0; attempt < 400; attempt++) {
      if (window.__clientWasm?.memory && window.__virtualClock) return;
      await new Promise(resolve => window.__realSetTimeout(resolve, 25));
    }
    throw new Error('Original WASM did not initialize');
  });
  await page.evaluate(() => window.__virtualClock.advance(1600));
  const animations = [];
  const animationState = () => page.evaluate(() => {
    const view = new DataView(window.__clientWasm.memory.buffer);
    return { panel: view.getUint32(7926848, true), alphas: Object.fromEntries(['Settings','Petals','Mobs','Changelog'].map((p, i) => [p, view.getFloat32(7926852 + i * 4, true)])) };
  });
  for (const [panel, x] of [['Settings', 42], ['Petals', 112], ['Mobs', 196], ['Changelog', 280]]) {
    await page.mouse.move(x, 701); await page.evaluate(() => window.__virtualClock.advance(32));
    const animation = { panel, initial: await animationState(), samples: [] };
    await page.mouse.down(); await page.evaluate(() => window.__virtualClock.advance(16));
    animation.samples.push(await animationState());
    await page.mouse.up(); await page.evaluate(() => window.__virtualClock.advance(16));
    animation.samples.push(await animationState());
    await page.screenshot({ path: path.join(out, `original-${panel}-first.png`) });
    for (let frame = 0; frame < 24; frame++) {
      await page.evaluate(() => window.__virtualClock.advance(16));
      animation.samples.push(await animationState());
    }
    animations.push(animation);
    await page.evaluate(() => window.__canvasTrace.reset());
    await page.evaluate(() => window.__virtualClock.advance(1600));
    await page.screenshot({ path: path.join(out, `original-${panel}.png`) });
    await fs.writeFile(path.join(out, `original-${panel}.json`), JSON.stringify(await page.evaluate(() => window.__canvasTrace.export())));
    if (panel !== 'Settings') {
      await page.mouse.move(panel === 'Changelog' ? 250 : 150, 550);
      await page.mouse.wheel(0, 10000);
      await page.evaluate(() => window.__virtualClock.advance(1600));
      await page.screenshot({ path: path.join(out, `original-${panel}-bottom.png`) });
      await page.evaluate(() => window.__canvasTrace.reset());
      await page.evaluate(() => window.__virtualClock.advance(48));
      await fs.writeFile(path.join(out, `original-${panel}-bottom.json`), JSON.stringify(await page.evaluate(() => window.__canvasTrace.export())));
    }
  }
  const structure = await page.evaluate(() => {
    const bytes = new Uint8Array(window.__clientWasm.memory.buffer), view = new DataView(bytes.buffer);
    const string = p => {
      const long = bytes[p + 11] & 128, start = long ? view.getUint32(p, true) : p;
      const size = long ? view.getUint32(p + 4, true) : bytes[p + 11];
      return new TextDecoder().decode(bytes.subarray(start, start + size));
    };
    const wrapped = p => Array.from({ length: view.getUint32(p + 20, true) }, (_, i) => string(view.getUint32(p + 28, true) + i * 152 + 124));
    return {
      changelog: Array.from({ length: 35 }, (_, i) => {
        const p = view.getUint32(375248, true) + 8 + i * 5872;
        return { width: view.getFloat32(p + 5744, true), height: view.getFloat32(p + 5748, true),
          notes: Array.from({ length: bytes[p + 160] }, (_, j) => {
            const n = p + 168 + j * 304 + 152;
            return { wrap: view.getFloat32(n + 16, true), count: view.getUint32(n + 20, true), lines: wrapped(n) };
          }) };
      }),
      catalog: Array.from({ length: 23 }, (_, typeId) => {
        const p = 384096 + typeId * 116;
        return { typeId, rarity: view.getUint32(p + 24, true), drops: Array.from({ length: bytes[p + 32] }, (_, j) =>
          ({ petalTypeId: bytes[p + 36 + j * 8], chance: view.getFloat32(p + 40 + j * 8, true) })) };
      }),
      mobs: Array.from({ length: bytes[7791368] }, (_, i) => {
        const p = 7791376 + i * 4448;
        return { type: bytes[p + 32], icon: view.getUint32(p + 1052, true), description: wrapped(p + 528), descriptionWrap: view.getFloat32(p + 544, true),
          drops: Array.from({ length: bytes[p + 1072] }, (_, j) => ({ type: bytes[p + 1080 + j * 400], label: string(p + 1080 + j * 400 + 348) })),
          words: Array.from({ length: 20 }, (_, j) => view.getFloat32(p + 4296 + j * 4, true)) };
      }),
      scroll: Object.fromEntries([['Petals',7907840], ['Mobs',7890808], ['Changelog',375664]].map(([panel, p]) =>
        [panel, Array.from({ length: 96 }, (_, j) => view.getFloat32(p + j * 4, true))])),
    };
  });
  await fs.writeFile(path.join(out, 'original-structure.json'), JSON.stringify(structure, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'original-panel-animation.json'), JSON.stringify(animations, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ output: out, syntheticStorageKeys: Object.keys(stored).length,
    mobs: structure.mobs.length, changelog: structure.changelog.length }));
} finally {
  await browser?.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
