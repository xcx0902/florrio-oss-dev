import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { chromiumExecutable } from '../../tools/lib/chromium.mjs';
import { installCanvasTrace } from '../../tools/parity/canvas-trace.js';

// Allocation ids can differ; surface kinds, names, sizes, referenced paths,
// every command/style argument and cross-surface submission order cannot.
function canonical(value, trace, resources) {
  if (Array.isArray(value)) return value.map(item => canonical(item, trace, resources));
  if (!value || typeof value !== 'object') return value;
  if (value.kind === 'path' || value.kind === 'canvas') {
    const key = `${value.kind}:${value.id}`;
    if (!resources.has(key)) resources.set(key, resources.size);
    const identity = resources.get(key);
    if (value.kind === 'path') return { kind: 'path', identity, ops: trace.paths.find(path => path.id === value.id)?.ops };
    return { kind: 'canvas', identity, name: value.name, width: value.width, height: value.height,
      ...(value.type === undefined ? {} : { type: value.type }) };
  }
  return value;
}
function operations(ops, trace) {
  const identities = new Map(), resources = new Map();
  return ops.map(([id, op, args]) => {
    if (!identities.has(id)) identities.set(id, identities.size);
    const surface = trace.contexts.find(context => context.id === id);
    assert.ok(surface, `context ${id} has a resource descriptor`);
    return [identities.get(id), canonical(surface, trace, resources), op, canonical(args, trace, resources)];
  });
}
function compare(actual, expected, path = 'trace') {
  if (typeof actual === 'number' && typeof expected === 'number') {
    assert.ok(Math.abs(actual - expected) <= 1e-4, `${path}: ${actual} != ${expected}`); return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path); assert.equal(actual.length, expected.length, `${path} length`);
    expected.forEach((item, index) => compare(actual[index], item, `${path}[${index}]`)); return;
  }
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) compare(actual[key], expected[key], `${path}.${key}`);
  } else assert.equal(actual, expected, path);
}

export async function captureMenu() {
  const browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
  try {
    const page = await browser.newPage();
    await page.route('http://menu.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') { await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html></html>' }); return; }
      const module = pathname.endsWith('.js');
      const file = new URL(module ? `../src${pathname.replace(/\.js$/, '.ts')}` : `../..${pathname}`, import.meta.url);
      const contents = await readFile(file);
      await route.fulfill({ contentType: module ? 'text/javascript' : 'font/woff2', body: module
        ? ts.transpileModule(contents.toString(), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText : contents });
    });
    await page.goto('http://menu.test/');
    await page.evaluate(async () => {
      const font = new FontFace('Ubuntu', 'url(/source/assets/fonts/ubuntu-bold-latin.woff2)');
      await font.load(); document.fonts.add(font);
    });
    await page.evaluate(installCanvasTrace);
    return await page.evaluate(async () => {
      const { drawHud, createHudState } = await import('/render/hud.js');
      const { wrapContext } = await import('/render/canvas2d/context.js');
      const { drawWorld } = await import('/render/world.js');
      const { WorldState } = await import('/state/world.js');
      const { CameraState } = await import('/state/camera.js');
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const native = canvas.getContext('2d'), context = wrapContext(native);
      const world = new WorldState(), camera = new CameraState(), hud = createHudState();
      const frames = [], calls = [];
      // Original boot receipt at 64 ms makes metadata available to the next
      // frame (80 ms). This is an input schedule, never a renderer time offset.
      for (let now = 16; now <= 2880; now += 16) {
        if (now === 80) world.apply({ sequence: 1, serverTime: 64, entities: [], events: [] }, now);
        if (now >= 2848) window.__canvasTrace.reset();
        native.setTransform(1, 0, 0, 1, 0, 0); native.clearRect(0, 0, 1280, 720);
        drawHud(context, hud.update({ health: 100, maxHealth: 100, level: 1, menu: true,
          animationTime: now, menuSeed: 2432940084, width: 1280, height: 720,
          menuPreview: (preview, frame) => {
            camera.resize(frame.width, frame.height, frame.pixelRatio);
            camera.x = frame.cameraX; camera.y = frame.cameraY; camera.zoom = frame.zoom;
            drawWorld(preview, world, camera, frame.nowMilliseconds, { menuPreview: true });
            if (now >= 2848) calls.push(frame);
            return world.lastSequence > 0;
          },
        }, now, 16));
        if (now >= 2848) frames.push({ ops: window.__canvasTrace.state.ops.slice(), ...window.__canvasTrace.export(), frames: undefined });
      }
      return { frames, calls };
    });
  } finally { await browser.close(); }
}

test('boot menu strictly matches all three complete native frames including invisible passes', async () => {
  const capture = await captureMenu();
  // Diagnostic output is separate from both frozen goldens and the comparator.
  await writeFile('/tmp/florr-menu-current.json', JSON.stringify(capture));
  const golden = JSON.parse(await readFile(new URL('../../tests/parity/golden/boot-menu/canvas.json', import.meta.url), 'utf8'));
  assert.equal(capture.frames.length, 3); assert.equal(capture.calls.length, 3);
  for (let index = 0; index < 3; index++) {
    const frame = capture.frames[index], expected = golden.frames[index];
    // Deliberate UI deviation: the top-right Discord/Reddit buttons were
    // removed from the legacy rebuild. The frozen native frame keeps them at
    // ops 418..468; filtering that exact button pass leaves the rest of the
    // strict menu trace (including its input and warning passes) unchanged.
    const nativeOps = expected.ops.filter((_, opIndex) => opIndex < 418 || opIndex > 468);
    compare(operations(frame.ops, frame), operations(nativeOps, golden), `frame ${expected.time}`);
  }
});
