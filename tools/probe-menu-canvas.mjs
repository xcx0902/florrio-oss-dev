import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { chromiumExecutable } from './lib/chromium.mjs';
const root = new URL('../', import.meta.url);
const browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
await page.route('http://probe-menu.test/**', async route => {
  const pathname = new URL(route.request().url()).pathname;
  if (pathname === '/') { await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;overflow:hidden;background:#1ea761"><canvas id="c" style="position:absolute;inset:0"></canvas></body></html>' }); return; }
  if (pathname.endsWith('.js')) {
    const source = await readFile(new URL(`client/src${pathname.replace(/\.js$/, '.ts')}`, root), 'utf8');
    await route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText });
    return;
  }
  if (pathname === '/ubuntu.woff2') { await route.fulfill({ contentType: 'font/woff2', body: await readFile(new URL('source/assets/fonts/ubuntu-bold-latin.woff2', root)) }); return; }
  await route.abort();
});
await page.goto('http://probe-menu.test/');
await page.evaluate(async () => {
  const font = new FontFace('Ubuntu', 'url(/ubuntu.woff2)'); await font.load(); document.fonts.add(font);
  localStorage.setItem('florr-menu', JSON.stringify({name:'Probe', keyboardMovement:false, movementHelper:false, petals:[1,2,6,15,4], mobs:[1,4,6]}));
  const { MenuControls } = await import('/input/menu.js');
  const { drawMenu } = await import('/render/menu.js');
  const { wrapContext } = await import('/render/canvas2d/context.js');
  const canvas = document.getElementById('c'), ratio = devicePixelRatio;
  canvas.width = innerWidth * ratio; canvas.height = innerHeight * ratio; canvas.style.width = innerWidth+'px'; canvas.style.height = innerHeight+'px';
  const menu = new MenuControls(); menu.resize(innerWidth, innerHeight); menu.show(true); window.menu = menu;
  window.redraw = () => {
    const ctx = wrapContext(canvas.getContext('2d'));
    ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle='#1ea761'; ctx.fillRect(0,0,canvas.width,canvas.height);
    drawMenu(ctx, innerWidth, innerHeight, '', ratio, 1000, 2432940084, undefined, undefined, true, menu.petalDiscoveryCount, menu.renderState(), [1,2,6]);
  };
  window.redraw();
});
for (const [panel, x] of [['Settings',60],['Petals',170],['Mobs',280],['Changelog',400]]) {
  await page.evaluate(({x}) => { window.menu.open(undefined); window.menu.pointerDown(x*0.7, 700); window.redraw(); }, {x});
  await page.screenshot({ path: `/tmp/menu-canvas-${panel}.png` });
}
await page.evaluate(() => { window.menu.open('Petals'); window.menu.pointerMove(46, 488); window.redraw(); });
await page.screenshot({ path: '/tmp/menu-canvas-hover.png' });
await page.evaluate(() => { window.menu.open('Mobs'); window.menu.pointerMove(150, 488); window.redraw(); });
await page.screenshot({ path: '/tmp/menu-canvas-mob.png' });
console.log('errors', errors);
await browser.close();
