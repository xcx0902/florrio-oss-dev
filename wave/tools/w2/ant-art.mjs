import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import binaryen from 'binaryen';
import { CaptureCodec, record, f32, u32, vu, str } from './codec.mjs';
import { root } from './host.mjs';

const castes = [5, 6, 7, 8, 23];

async function observedClient(snapshot) {
  const source = await readFile(path.join(root, 'web/local.js'), 'utf8');
  const end = source.indexOf('  const instantiateStreaming');
  assert.ok(end > 0, 'Find the production adapter before its browser hooks');
  const box = { location: { protocol: 'http:' } };
  vm.runInNewContext(source.slice(0, end) + 'globalThis.adapt = adaptWaveClient;})();', box);
  const adapted = box.adapt(new Uint8Array(await readFile(path.join(snapshot, 'client.wasm'))));
  assert.ok(WebAssembly.validate(adapted), 'Adapted October client validates');
  const module = binaryen.readBinary(adapted);
  try {
    // Tag draws without changing the original renderer, its transforms or art.
    const info = binaryen.getFunctionInfo(module.getFunction('597'));
    module.addFunction('antTestOriginalDraw', info.params, info.results, info.vars, info.body);
    module.removeFunction('597');
    module.addFunctionImport('antTestEntity', 'antTest', 'entity', binaryen.i32, binaryen.none);
    module.addFunction(
      '597',
      info.params,
      info.results,
      [],
      module.block(null, [
        module.call('antTestEntity', [module.local.get(2, binaryen.i32)], binaryen.none),
        module.call(
          'antTestOriginalDraw',
          [0, 1, 2, 3].map((i) => module.local.get(i, i === 3 ? binaryen.f32 : binaryen.i32)),
          binaryen.none,
        ),
        module.call('antTestEntity', [module.i32.const(0)], binaryen.none),
      ]),
    );
    assert.ok(module.validate(), 'Draw observer validates');
    return {
      expected: Buffer.from(adapted).toString('base64'),
      observed: Buffer.from(module.emitBinary()).toString('base64'),
    };
  } finally {
    module.dispose();
  }
}

function observeArt({ expected, observed }) {
  const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const expectedBytes = decode(expected);
  const observedBytes = decode(observed);
  const instantiate = WebAssembly.instantiate;
  const stack = [];
  window.waveAntArt = {};
  WebAssembly.instantiate = (bytes, imports, ...options) => {
    if (bytes instanceof Uint8Array && bytes.length === expectedBytes.length) {
      if (!bytes.every((byte, i) => byte === expectedBytes[i])) {
        throw new Error('Browser adaptation differs from the observed production adapter');
      }
      imports.antTest = {
        entity(ptr) {
          if (ptr) {
            stack.push({ ptr, circles: [] });
          } else {
            const draw = stack.pop();
            if (draw.circles.length) {
              window.waveAntArt[draw.ptr] = draw.circles;
            }
          }
        },
      };
      window.waveAntAdapterMatched = true;
      return instantiate(observedBytes, imports, ...options);
    }
    return instantiate(bytes, imports, ...options);
  };
  const arc = CanvasRenderingContext2D.prototype.arc;
  CanvasRenderingContext2D.prototype.arc = function (x, y, radius, ...args) {
    const draw = stack.at(-1);
    if (draw) {
      const transform = this.getTransform();
      draw.circles.push(radius * Math.hypot(transform.a, transform.b));
    }
    return arc.call(this, x, y, radius, ...args);
  };
  window.waveAntLabels = new Set();
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
    window.waveAntLabels.add(String(text));
    return fillText.call(this, text, ...args);
  };
}

function samples(serverRadii) {
  return castes.flatMap((id, row) =>
    Array.from({ length: 6 }, (_, rarity) => {
      const handle = 8224 + row * 6 + rarity;
      // Match::mob_radius's tiers and caste sizes; equal radii independently
      // isolate accidental native rarity scaling from the server's own growth.
      const radius = serverRadii
        ? [7, 8, 9.5, 11.5, 14, 17.5][rarity] * (id === 5 ? 0.55 : id === 8 ? 1 : 0.6) * 5
        : 35;
      return {
        handle,
        id,
        rarity,
        radius,
        bytes: record(
          handle,
          1 | 0x400 | 0x1000 | 0x80000 | 0x100000,
          Buffer.concat([
            Buffer.from([0]),
            Buffer.alloc(2),
            f32((rarity - 2.5) * 210),
            f32((row - 2) * 165),
            f32(radius),
            Buffer.from([0, id, 0, rarity]),
          ]),
        ),
      };
    }),
  );
}

export async function antArtCase({ browser, host, snapshot, output, report }) {
  const observation = { status: 'failed', kind: 'synthetic-replay', samples: [] };
  report.cases['W2-ant-art'] = observation;
  const replay = JSON.parse(
    await readFile(path.join(root, 'data/wire/20221030/w2-lobby-replay.json')),
  );
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let timer;
  try {
    await context.addInitScript(observeArt, await observedClient(snapshot));
    const codec = new CaptureCodec();
    const client = new CaptureCodec(true);
    let socket;
    let acknowledged = 0;
    let tick = 6;
    await context.routeWebSocket('**/wave/socket', (route) => {
      socket = route;
      let greeted = false;
      route.onMessage((message) => {
        if (!greeted) {
          greeted = true;
          for (const frame of replay.initial) {
            const bytes = Buffer.from(frame.hex, 'hex');
            codec.decode(bytes);
            route.send(bytes);
          }
          return;
        }
        const plain = client.decode(Buffer.from(message));
        if (plain[0] === 1) {
          acknowledged = Math.max(acknowledged, plain[2]);
        }
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(host.url);
    await page.waitForFunction(() => window.waveAntLabels.has('Ready'), null, { timeout: 8000 });
    await page.keyboard.press('Enter');
    const profile = record(
      8193,
      0x8000,
      Buffer.concat([
        Buffer.from([1, 0]),
        Buffer.alloc(280),
        str('Ant art'),
        f32(0),
        Buffer.alloc(27),
        f32(1),
        str(''),
        f32(0),
        u32(0),
        f32(0),
        Buffer.alloc(276),
      ]),
    );
    const arena = record(
      8196,
      16 | 0x2000,
      Buffer.concat([
        vu(3000),
        vu(3000),
        f32(1),
        Buffer.from([0]),
        f32(1500),
        Buffer.from([31, 138, 78]),
      ]),
    );
    const wave = record(8197, 2048, Buffer.concat([Buffer.alloc(219), Buffer.from([255])]));
    const server = record(8198, 2, Buffer.concat([Buffer.from([0]), str('wavelocal'), vu(0)]));
    for (const serverRadii of [false, true]) {
      const entries = samples(serverRadii);
      const records = Buffer.concat([server, profile, arena, wave, ...entries.map((e) => e.bytes)]);
      const broadcast = () => socket.send(codec.world(tick++, records, acknowledged));
      broadcast();
      timer = setInterval(broadcast, 100);
      await page.waitForTimeout(1200); // Native birth/camera/radius interpolation settles.
      const drawn = await page.evaluate(() => {
        const data = new DataView(window.Module.asm.Jf.buffer);
        return Object.entries(window.waveAntArt).map(([ptr, circles]) => ({
          handle: data.getUint32(Number(ptr) + 28, true),
          radius: Math.max(...circles),
        }));
      });
      assert.ok(await page.evaluate(() => window.waveAntAdapterMatched));
      for (const entry of entries) {
        const actual = drawn.find((e) => e.handle === entry.handle);
        const common = entries.find((e) => e.id === entry.id && e.rarity === 0);
        const reference = drawn.find((e) => e.handle === common.handle);
        assert.ok(actual?.radius > 0 && reference?.radius > 0, 'Every ant variant draws circles');
        const ratio = actual.radius / reference.radius;
        const expected = entry.radius / common.radius;
        assert.ok(
          Math.abs(ratio / expected - 1) < 0.001,
          `Ant ${entry.id}/${entry.rarity}: drawn ratio ${ratio}, collision ratio ${expected}`,
        );
        observation.samples.push({
          mode: serverRadii ? 'server-radii' : 'equal-radius',
          id: entry.id,
          rarity: entry.rarity,
          collisionRadius: entry.radius,
          drawnRadius: actual.radius,
          ratio,
          expected,
        });
      }
      clearInterval(timer);
      const screenshot = `W2-ant-art-${serverRadii ? 'server-radii' : 'equal-radius'}.png`;
      await page.screenshot({ path: path.join(output, screenshot) });
    }
    assert.deepEqual(errors, []);
    observation.status = 'passed';
    await writeFile(path.join(output, 'ant-art.json'), JSON.stringify(observation, null, 2) + '\n');
  } finally {
    clearInterval(timer);
    await context.close();
  }
}
