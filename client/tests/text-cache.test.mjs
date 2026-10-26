import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { chromiumExecutable } from '../../tools/lib/chromium.mjs';
import { withAdditionalExports } from '../../tools/lib/wasm-binary.mjs';

// Test current TypeScript in memory, without rebuilding shared client/public.
// Both the original func444 and recovered text.mjs execute against real browser
// canvases; expected raster sizes, repaint decisions and pixels come from them.
let browser, page;
before(async () => {
  const ids = [362, 363, 366, 368, 369, 370, 371, 372, 385, 392, 398,
    443, 444, 472, 496, 556, 561, 590, 632, 633, 634, 636, 817, 818, 819];
  const wasm = withAdditionalExports(await readFile(new URL('../../web/client.wasm', import.meta.url)), [
    ...ids.map(index => ({ name: `__fn${index}`, index })),
    { name: '__stack_pointer', kind: 3, index: 0 },
  ]);
  browser = await chromium.launch({ executablePath: chromiumExecutable(), headless: true });
  page = await browser.newPage();
  await page.route('http://text-cache.test/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html></html>' });
    if (pathname === '/original.wasm') return route.fulfill({ contentType: 'application/wasm', body: wasm });
    if (pathname === '/text-cache.js') {
      const source = await readFile(new URL('../src/render/canvas2d/text-cache.ts', import.meta.url), 'utf8');
      return route.fulfill({ contentType: 'text/javascript', body: ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText });
    }
    const resources = {
      '/text.mjs': new URL('../../source/game/client/text.mjs', import.meta.url),
      '/ubuntu.woff2': new URL('../../source/assets/fonts/ubuntu-bold-latin.woff2', import.meta.url),
    };
    assert.ok(resources[pathname], `unexpected browser resource ${pathname}`);
    return route.fulfill({ contentType: pathname.endsWith('.mjs') ? 'text/javascript' : 'font/woff2',
      body: await readFile(resources[pathname]) });
  });
  await page.goto('http://text-cache.test/');
  await page.evaluate(async () => {
    const face = new FontFace('Ubuntu', 'url(/ubuntu.woff2)');
    await face.load(); document.fonts.add(face); await document.fonts.ready;
    const client = await import('/text-cache.js');
    const { createTextHooks } = await import('/text.mjs');
    const module = await WebAssembly.compile(await (await fetch('/original.wasm')).arrayBuffer());
    const f = Math.fround, decode = new TextDecoder();
    let paints = 0;
    for (const proto of [OffscreenCanvasRenderingContext2D.prototype, CanvasRenderingContext2D.prototype]) {
      const original = proto.fillText;
      proto.fillText = function (...args) { paints++; return Reflect.apply(original, this, args); };
    }
    function makeOracle(recovered) {
      let instance, hooks, textPaints = 0;
      const contexts = new Map(), labels = new Map();
      let nextContext = 0;
      const memory = () => Object.values(instance.exports).find(value => value instanceof WebAssembly.Memory);
      const view = () => new DataView(memory().buffer);
      const bytes = () => new Uint8Array(memory().buffer);
      const word = (a, v) => view().setUint32(a, v, true);
      const float = (a, v) => view().setFloat32(a, v, true);
      const call = (id, ...args) => instance.exports[`__fn${id}`](...args);
      const alloc = size => { const pointer = call(368, size); bytes().fill(0, pointer, pointer + size); return pointer; };
      const textAt = (pointer, length) => decode.decode(bytes().subarray(pointer, pointer + length));
      function host(code, signature, pointer) {
        const args = [], data = view(), raw = bytes();
        let cursor = pointer >>> 2;
        for (let type; type = raw[signature++]; cursor++) {
          const double = type < 105;
          if (double && cursor & 1) cursor++;
          args.push(double ? data.getFloat64((cursor++ >> 1) * 8, true) : data.getInt32(cursor * 4, true));
        }
        const [id, a, b, c, d] = args, ctx = contexts.get(id);
        const rgb = () => `rgb(${a},${b},${c})`;
        switch (code) {
          case 141250: return 1;
          case 141314: return 1234;
          case 139312: return 1;
          case 135144: return 1;
          case 135298:
          case 135607: { const index = nextContext++; contexts.set(index, new OffscreenCanvas(id, a).getContext('2d')); return index; }
          case 135960: ctx.direction = 'ltr'; break;
          case 136033: contexts.delete(id); break;
          case 136361: ctx.setTransform(1, 0, 0, 1, 0, 0); break;
          case 136414: ctx.setTransform(...args.slice(1)); break;
          case 136473: ctx.canvas.width = a; ctx.canvas.height = b; break;
          case 136554: word(a, ctx.canvas.width); word(b, ctx.canvas.height); break;
          case 136989: ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); break;
          case 137186: ctx.fillStyle = rgb(); break;
          case 137456: ctx.strokeStyle = rgb(); break;
          case 137767: ctx.globalAlpha = a; break;
          case 138111: ctx.lineWidth = a; break;
          case 138365: textPaints++; ctx.fillText(textAt(a, b), c, d); break;
          case 138434: ctx.strokeText(textAt(a, b), c, d); break;
          case 138505: return ctx.measureText(textAt(a, b)).width;
          case 138582: ctx.font = `${Math.trunc(2048 * a) / 2048}px Ubuntu`; break;
          case 138648: ctx.textAlign = 'center'; break;
          case 138691: ctx.lineCap = 'butt'; break;
          case 138852: ctx.lineJoin = 'miter'; break;
          case 138893: ctx.miterLimit = a; break;
          case 138931: ctx.textBaseline = 'middle'; break;
          case 138977: ctx.textBaseline = 'alphabetic'; break;
          case 139027: ctx.globalCompositeOperation = 'source-over'; break;
          default: throw new Error(`unhandled original Canvas host code ${code}`);
        }
        return 0;
      }
      const imports = {};
      for (const entry of WebAssembly.Module.imports(module)) (imports[entry.module] ??= {})[entry.name] = () => 0;
      imports.a.a = imports.a.c = host;
      imports.a.La = (count, size) => { word(count, 0); word(size, 0); return 0; };
      instance = new WebAssembly.Instance(module, imports);
      const runtime = { get memory() { return memory(); }, get stackPointer() { return instance.exports.__stack_pointer; },
        call, host(group, name, ...args) { return imports[group][name](...args); } };
      instance.exports.Nf(); hooks = createTextHooks(runtime);
      const color = alloc(4); word(color, -1);
      const renderer = alloc(112); call(818, renderer, color);
      function assign(label, spec) {
        const encoded = new TextEncoder().encode(spec.text), storage = alloc(encoded.length + 1), source = alloc(12);
        bytes().set(encoded, storage); call(561, source, storage, encoded.length); call(556, label, source);
        let dirty = false;
        for (const [offset, value] of [[144, spec.outline ?? 0.12], [148, spec.font]]) {
          if (view().getFloat32(label + offset, true) !== f(value)) { float(label + offset, value); dirty = true; }
        }
        for (const [offset, hex] of [[136, spec.fill ?? '#FFFFFF'], [139, spec.stroke ?? '#000000']]) {
          const color = Number.parseInt(hex.slice(1), 16), values = [color >>> 16 & 255, color >>> 8 & 255, color & 255];
          values.forEach((value, index) => { if (bytes()[label + offset + index] !== value) { bytes()[label + offset + index] = value; dirty = true; } });
        }
        if (dirty) { bytes()[label] = 1; bytes()[label + 120] = 0; }
      }
      return {
        step(spec, matrix) {
          const key = `${typeof spec.cacheKey}:${spec.cacheKey}`;
          let label = labels.get(key);
          if (label === undefined) { label = alloc(160); call(818, label + 8, color); bytes()[label] = 1; labels.set(key, label); }
          assign(label, spec);
          matrix.forEach((value, index) => float(renderer + index * 4, value));
          const before = textPaints;
          (recovered ? hooks[444] : (...args) => call(444, ...args))(label, renderer);
          const context = contexts.get(view().getUint32(label + 104, true));
          return { canvas: context.canvas, rebuilt: textPaints > before,
            rasterScale: view().getFloat32(label + 112, true) };
        },
      };
    }
    function comparePixels(left, right) {
      if (left.width !== right.width || left.height !== right.height) return { changed: null, sizeMismatch: [[left.width, left.height], [right.width, right.height]] };
      const a = left.getContext('2d').getImageData(0, 0, left.width, left.height).data;
      const b = right.getContext('2d').getImageData(0, 0, right.width, right.height).data;
      let changed = 0, max = 0;
      for (let i = 0; i < a.length; i += 4) { let delta = 0; for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a[i + c] - b[i + c])); if (delta) changed++; max = Math.max(max, delta); }
      return { changed, max };
    }
    let sequenceId = 0;
    window.textCacheHarness = {
      client,
      sequence(requests) {
        client.clearLabelCache();
        const native = makeOracle(false), readable = makeOracle(true), previous = new Map();
        const defaultOwner = `leaderboard:sequence${++sequenceId}:name`;
        return requests.map(request => {
          const matrix = (request.matrix ?? [request.scale, 0, 0, request.scale]).map(f);
          const projected = f(2 * Math.max(...matrix.map(Math.abs)));
          const spec = { text: 'Unnamed Flower', font: 13, cacheKey: defaultOwner, ...request,
            rasterScale: f(projected * 1.2), projectedScale: projected };
          delete spec.scale; delete spec.matrix;
          const expected = native.step(spec, matrix), recovered = readable.step(spec, matrix);
          const before = paints, actual = client.getLabel(spec), clientPaints = paints - before;
          if (!actual) throw new Error('real browser getLabel returned null');
          const prior = previous.get(spec.cacheKey);
          const context = actual.canvas.getContext('2d');
          previous.set(spec.cacheKey, { canvas: actual.canvas, context,
            nativeCanvas: expected.canvas, nativeContext: expected.canvas.getContext('2d'),
            readableCanvas: recovered.canvas, readableContext: recovered.canvas.getContext('2d') });
          return { projected, requestedRasterScale: spec.rasterScale, nativeRasterScale: expected.rasterScale,
            nativeRebuilt: expected.rebuilt, readableRebuilt: recovered.rebuilt, clientPaints,
            retainedSameCanvas: prior === undefined ? null : actual.canvas === prior.canvas,
            retainedSameContext: prior === undefined ? null : context === prior.context,
            nativeRetainedCanvas: prior === undefined ? null : expected.canvas === prior.nativeCanvas,
            nativeRetainedContext: prior === undefined ? null : expected.canvas.getContext('2d') === prior.nativeContext,
            readableRetainedCanvas: prior === undefined ? null : recovered.canvas === prior.readableCanvas,
            readableRetainedContext: prior === undefined ? null : recovered.canvas.getContext('2d') === prior.readableContext,
            nativeSize: [expected.canvas.width, expected.canvas.height], clientSize: [actual.width, actual.height],
            recoveredPixels: comparePixels(expected.canvas, recovered.canvas), clientPixels: comparePixels(expected.canvas, actual.canvas) };
        });
      },
    };
  });
});
after(async () => { await browser?.close(); });

async function sequence(requests, rebuilds) {
  const steps = await page.evaluate(requests => window.textCacheHarness.sequence(requests), requests);
  steps.forEach((step, index) => {
    const message = `step${index} ${JSON.stringify(requests[index])}`;
    if (rebuilds) assert.equal(step.nativeRebuilt, rebuilds[index], `${message}: original repaint decision`);
    assert.equal(step.readableRebuilt, step.nativeRebuilt, `${message}: recovered func444 repaint`);
    assert.deepEqual(step.recoveredPixels, { changed: 0, max: 0 }, `${message}: recovered func444 pixels`);
    assert.equal(step.clientPaints, step.nativeRebuilt ? 1 : 0, `${message}: client repaint count`);
    assert.deepEqual(step.clientSize, step.nativeSize, `${message}: bitmap dimensions`);
    assert.deepEqual(step.clientPixels, { changed: 0, max: 0 }, `${message}: exact RGBA bitmap`);
    if (step.retainedSameCanvas !== null) {
      assert.equal(step.nativeRetainedCanvas, true, `${message}: original retains owner backing canvas`);
      assert.equal(step.nativeRetainedContext, true, `${message}: original retains owner backing context`);
      assert.equal(step.readableRetainedCanvas, true, `${message}: recovered func444 retains owner backing canvas`);
      assert.equal(step.readableRetainedContext, true, `${message}: recovered func444 retains owner backing context`);
      assert.equal(step.retainedSameCanvas, true, `${message}: owner backing canvas survives reuse and repaint`);
      assert.equal(step.retainedSameContext, true, `${message}: owner backing context survives reuse and repaint`);
    }
  });
  return steps;
}

test('leaderboard owner retains its initial 1.1 panel raster when the panel becomes 0.77', async () => {
  const steps = await sequence([{ scale: 1.1 }, { scale: 0.77 }, { scale: 0.77 }], [true, false, false]);
  assert.deepEqual(steps.map(step => step.clientSize), [[290, 48], [290, 48], [290, 48]]);
});

test('owner identity isolates identical labels and accepts zero and typed numeric keys', async () => {
  await sequence([
    { cacheKey: 0, scale: 1.1 }, { cacheKey: '0', scale: 0.77 },
    { cacheKey: 0, scale: 0.77 }, { cacheKey: '0', scale: 0.77 },
    { cacheKey: 'other', scale: 0.77 },
  ], [true, true, false, false, true]);
  const isolated = await page.evaluate(() => {
    const { client } = window.textCacheHarness, spec = { text: 'same', font: 13, rasterScale: 1.848 };
    client.clearLabelCache();
    return client.getLabel({ ...spec, cacheKey: 'left' }).canvas !== client.getLabel({ ...spec, cacheKey: 'right' }).canvas;
  });
  assert.equal(isolated, true);
});

test('content changes rebuild at the new scale, including A to B to A', async () => {
  await sequence([
    { scale: 1.1 }, { scale: 0.77 }, { scale: 0.77, text: 'Changed Flower' },
    { scale: 0.77 }, { scale: 0.77 },
  ], [true, false, true, true, false]);
});

test('font and outlined-text styles dirty the owner independently of retained scale', async () => {
  for (const patch of [{ font: 16 }, { outline: 0.2 }, { fill: '#FF3366' }, { stroke: '#3366FF' }]) {
    await sequence([{ scale: 1.1 }, { scale: 0.77, ...patch }, { scale: 0.77, ...patch }], [true, true, false]);
  }
});

function adjacentFloat32(value, direction) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  view.setUint32(0, view.getUint32(0) + direction);
  return view.getFloat32(0);
}

test('original func444 thresholds use adjacent float32 ratios around 1.0001 and 0.4', async () => {
  // This seed produces stored rasterScale exactly 1. Float32 cannot represent
  // the f64 comparison constants themselves; test their immediate neighbors.
  const seed = Math.fround(1 / 2.4);
  const upperAbove = Math.fround(1.0001), upperBelow = adjacentFloat32(upperAbove, -1);
  const lowerAbove = Math.fround(0.4), lowerBelow = adjacentFloat32(lowerAbove, -1);
  for (const [ratio, rebuilt] of [[upperBelow, false], [upperAbove, true], [lowerAbove, false], [lowerBelow, true]]) {
    const steps = await sequence([{ scale: seed }, { scale: ratio / 2 }], [true, rebuilt]);
    assert.equal(steps[0].nativeRasterScale, 1);
    assert.equal(steps[1].projected, ratio);
  }
});

test('projected scale prevents an inverse-raster false repaint at the upper boundary', async () => {
  // f32(f32(projected * 1.2) / 1.2) can land on the opposite side of
  // 1.0001. These are native-WASM decisions, not an inferred threshold mock.
  const retained = await sequence([{ scale: 0.77 }, { scale: 0.9240922927856445 }], [true, false]);
  assert.equal(retained[1].projected, 1.848184585571289);
  assert.equal(Math.fround(retained[1].projected / retained[0].nativeRasterScale), 1.0000998973846436);
});

test('projected scale prevents inverse-raster false reuse at the upper boundary', async () => {
  const repainted = await sequence([{ scale: 1.5 }, { scale: 1.8001799583435059 }], [true, true]);
  assert.equal(repainted[1].projected, 3.6003599166870117);
  assert.equal(Math.fround(repainted[1].projected / repainted[0].nativeRasterScale), 1.000100016593933);
});

test('negative and off-diagonal transform components determine projected scale', async () => {
  await sequence([
    { scale: 1.1 }, { matrix: [0, -0.77, 0.77, 0] },
    { matrix: [0.1, -1.6, 0.2, 0.1] }, { matrix: [0, 0, -0.77, 0] },
    { matrix: [0, 0, -0.76, 0] },
  ], [true, false, true, false, true]);
});

test('leaderboard score keeps its initial raster until the displayed string changes', async () => {
  const steps = await sequence([
    { text: '- 0', scale: 1.1 }, { text: '- 0', scale: 0.77 },
    { text: '- 1', scale: 0.77 }, { text: '- 1', scale: 0.77 },
  ], [true, false, true, false]);
  assert.deepEqual(steps.map(step => step.clientSize), [[55, 48], [55, 48], [38, 33], [38, 33]]);
});

test('no-owner cache keeps its scale-specific behavior and clearing invalidates owned labels', async () => {
  const result = await page.evaluate(() => {
    const { client } = window.textCacheHarness, spec = { text: 'Unnamed Flower', font: 13 };
    client.clearLabelCache();
    const large = client.getLabel({ ...spec, rasterScale: Math.fround(2.2 * 1.2) });
    const small = client.getLabel({ ...spec, rasterScale: Math.fround(Math.fround(0.77 * 2) * 1.2) });
    const same = client.getLabel({ ...spec, rasterScale: Math.fround(2.2 * 1.2) });
    const owned = client.getLabel({ ...spec, rasterScale: 2.64, cacheKey: 'reset' });
    client.clearLabelCache();
    const after = client.getLabel({ ...spec, rasterScale: 1.848, cacheKey: 'reset' });
    return { distinct: large.canvas !== small.canvas, reused: large.canvas === same.canvas,
      cleared: owned.canvas !== after.canvas, afterSize: [after.width, after.height] };
  });
  assert.deepEqual(result, { distinct: true, reused: true, cleared: true, afterSize: [203, 33] });
});
