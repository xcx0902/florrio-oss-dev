import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
const { chromiumExecutable } = await import(pathToFileURL(path.resolve('tools/lib/chromium.mjs')).href);
const { loadOriginal } = await import(pathToFileURL(path.resolve('test/helpers/wasm-probe.mjs')).href);
const oracle = await loadOriginal('client', { functionIds: [368, 1102] });
const discovery = oracle.call(368, 12);
oracle.call(1102, discovery, 1);
const basicDiscovery = new TextDecoder().decode(new Uint8Array(oracle.memory.buffer, discovery, 8));
const sha256 = body => createHash('sha256').update(body).digest('hex');
const browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
const evidence = { target: 'https://static.florr.io/old/', assets: [], errors: [], gallery: [], tabs: [],
  localAssets: Object.fromEntries(await Promise.all(['client.js', 'client.wasm'].map(async name => [name, sha256(await readFile(path.resolve('legacy/web', name)))]))),
  method: 'Unmodified live game, real mouse events, native saved Basic discovery generated with frozen func1102.' };
const assets = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(value => localStorage.setItem('gallery_1', value), basicDiscovery);
  const page = await context.newPage();
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('response', response => {
    if (/\/(client\.(?:js|wasm)|sp_server\.(?:js|wasm))(?:\?|$)/.test(response.url()))
      assets.push(response.body().then(body => evidence.assets.push({ url: response.url(), status: response.status(), bytes: body.length, sha256: sha256(body) })).catch(error => evidence.errors.push(error.message)));
  });
  await page.goto(evidence.target, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => !!window.Module?.HEAPU32, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const read = () => page.evaluate(() => ({ cursor: getComputedStyle(document.querySelector('#canvas')).cursor,
    panel: window.Module.HEAPU32[7926848 / 4] }));
  for (const [label, x] of [['Settings', 42], ['Petals', 119], ['Mobs', 196], ['Changelog', 280]]) {
    await page.mouse.move(x, 701);
    await page.waitForTimeout(80);
    const hover = await read();
    await page.mouse.click(x, 701, { delay: 80 });
    await page.waitForTimeout(400);
    evidence.tabs.push({ label, point: [x, 701], hover, clicked: await read() });
  }
  await page.mouse.click(119, 701, { delay: 80 });
  await page.waitForTimeout(500);
  for (const [label, x, y] of [['Basic center', 45.5, 488.6], ['Basic interior', 49, 492], ['Undiscovered second cell', 94.5, 488.6]]) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(350);
    evidence.gallery.push({ label, point: [x, y], ...await read() });
  }
  await page.screenshot({ path: path.resolve('reports/menu-click-repair/live-gallery.png') });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  evidence.afterEnter = await page.evaluate(() => ({ bodyText: document.body.innerText,
    canvasCursor: getComputedStyle(document.querySelector('#canvas')).cursor }));
  await page.mouse.move(518, 622);
  await page.waitForTimeout(400);
  evidence.hotbarHover = await read();
  await page.screenshot({ path: path.resolve('reports/menu-click-repair/live-hotbar.png') });
  await Promise.allSettled(assets);
} catch (error) { evidence.errors.push(error.stack); }
finally {
  await Promise.allSettled(assets);
  await writeFile(path.resolve('reports/menu-click-repair/live-menu.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
  await browser.close();
}
