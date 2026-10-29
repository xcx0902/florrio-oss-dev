import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';

// Execute current source without a build or stale client/public modules. The
// only addition to the in-memory world module is a read-only private-state
// observer: the production drawWorld and boundary update statements run intact.
const modules = new Map();
async function sourceModule(url) {
  if (!modules.has(url.href)) modules.set(url.href, (async () => {
    let source = await readFile(url, 'utf8');
    if (url.pathname.endsWith('/render/world.ts')) source += `
      export function observeArenaBoundary(world: WorldState) {
        const value = arenaBoundaries.get(world);
        return value && [value.left, value.top, value.right, value.bottom];
      }
    `;
    let compiled = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
    } }).outputText;
    for (const [, specifier] of compiled.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.')) continue;
      const dependency = await sourceModule(new URL(specifier.replace(/\.js$/, '.ts'), url));
      compiled = compiled.replaceAll(JSON.stringify(specifier), JSON.stringify(dependency))
        .replaceAll(`'${specifier}'`, JSON.stringify(dependency));
    }
    return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
  })());
  return modules.get(url.href);
}

const { drawWorld, observeArenaBoundary } = await import(
  await sourceModule(new URL('../src/render/world.ts', import.meta.url)));
const { WorldState } = await import(
  await sourceModule(new URL('../src/state/world.ts', import.meta.url)));
const { CameraState } = await import(
  await sourceModule(new URL('../src/state/camera.ts', import.meta.url)));

function context() {
  const operations = [];
  return new Proxy({ operations }, { get(target, name) {
    if (name in target) return target[name];
    return (...args) => { operations.push([name, ...args]); };
  } });
}

function camera(x = 0, y = 0, zoom = Math.fround(0.6)) {
  const result = new CameraState();
  result.resize(1280, 720, 1);
  result.setCamera(x, y, zoom);
  return result;
}

/** Original763, stopped after its arena phase, before unrelated grid/entities.
 * Native ABI: state=game+8; four process-global f32 values are441284..441296.
 * The gate requires active state, control count and a control record, but not
 * that record's player reference at+144 (render-frame.mjs3593-3619).
 */
async function nativeBoundaryOracle() {
  const finishedArena = new Error('original arena phase completed');
  let saves = 0;
  const host = code => {
    // Outer763 save, inner world save, then arena overlay save. With no
    // metadata the overlay is skipped and the third save belongs to the grid;
    // either way the four boundary globals have finished this frame's update.
    if (code === 136300 && ++saves === 3) throw finishedArena;
    return code === 141314 ? 2000 : 0;
  };
  const native = await loadOriginal('client', { functionIds: [368, 763, 818],
    imports: { a: { a: host, c: host } } });
  const bytes = new Uint8Array(native.memory.buffer), view = new DataView(bytes.buffer);
  const put = (address, value) => view.setUint32(address, value, true);
  const float = (address, value) => view.setFloat32(address, value, true);
  const alloc = size => {
    const address = native.call(368, size);
    bytes.fill(0, address, address + size);
    return address;
  };
  const game = alloc(4096), state = game + 8, control = alloc(160), entries = alloc(4),
    renderer = alloc(112), color = alloc(4);
  put(color, 0xffffffff); native.call(818, renderer, color); put(renderer + 96, 7);
  float(state + 2156, 1);
  put(state + 2160, 1280); put(state + 2164, 720);
  bytes[7931360] |= 1; bytes[7931352] = 1;
  bytes[151560] |= 1; bytes[151516] = 0;
  return {
    metadata() {
      bytes[state + 1] = 1;
      put(state + 256, 1); put(state + 264, entries); put(entries, control);
      float(state + 648 + 252, 50000); float(state + 648 + 340, 4000);
      assert.equal(view.getUint32(control + 144, true), 0, 'native control has no player body');
    },
    frame() {
      saves = 0;
      const stack = native.stackPointer.value;
      try {
        assert.throws(() => native.call(763, game, renderer, 16, 1280, 720),
          error => error === finishedArena);
        return [441284, 441288, 441292, 441296].map(address => view.getFloat32(address, true));
      } finally {
        // The deliberate host exception leaves scratch frames allocated.
        native.stackPointer.value = stack;
      }
    },
  };
}

function metadata(world, at = 80) {
  world.apply({ sequence: 1, serverTime: 64, entities: [], events: [] }, at);
  assert.equal(Array.from(world.all()).length, 0, 'metadata has no player or drawable entities');
}

function compareFrame(world, view, native, at, hidden = true) {
  const expected = native.frame(), canvas = context();
  drawWorld(canvas, world, view, at, { menuPreview: hidden });
  assert.deepEqual(observeArenaBoundary(world), expected,
    `all four f32 boundary scalars match original763 at ${at}ms`);
  assert.ok(canvas.operations.some(([name]) => name === 'fillRect'), 'production world pass executes');
  return expected;
}

test('arena boundaries stay zero before metadata, including hidden renders and camera changes', async () => {
  const native = await nativeBoundaryOracle(), world = new WorldState();
  const views = [camera(), camera(120, -40, Math.fround(0.8))];
  for (const [index, at] of [16, 32, 48, 64].entries()) {
    assert.deepEqual(compareFrame(world, views[index % 2], native, at), [0, 0, 0, 0]);
  }
  assert.equal(world.lastSequence, 0);
});

test('metadata advances hidden arena boundaries without a player and preserves every f32 across cameras', async () => {
  const native = await nativeBoundaryOracle(), world = new WorldState();
  const menu = camera(), game = camera(-24900, -1000), replacement = camera(200, 100);
  metadata(world); native.metadata();
  const first = compareFrame(world, menu, native, 80);
  assert.deepEqual(first, [-5000, -400, 5000, 400]);
  assert.deepEqual(compareFrame(world, menu, native, 96), [-9000, -720, 9000, 720]);
  // Switch before convergence, so a per-camera reset cannot be hidden by the
  // final f32 fixed point. Revisit both previous camera instances as well.
  for (const [index, view] of [game, menu, replacement, game, replacement].entries()) {
    compareFrame(world, view, native, 112 + index * 16, view !== game);
  }
});

test('metadata-to-equip history matches original globals through the 69-update fixed point and 154th render', async () => {
  const native = await nativeBoundaryOracle(), world = new WorldState();
  const menu = camera(), game = camera(-24898.482421875, -1027.380615234375);
  for (const at of [16, 32, 48, 64]) compareFrame(world, menu, native, at);
  metadata(world); native.metadata();
  let updates = 0, fixed;
  for (let at = 80; at <= 2528; at += 16) {
    const hidden = at < 1536;
    const actual = compareFrame(world, hidden ? menu : game, native, at, hidden);
    updates++;
    if (updates === 63) assert.equal(actual[0], -24999.982421875);
    if (updates === 69) {
      fixed = actual;
      assert.deepEqual(fixed, [-24999.998046875, -1999.9996337890625,
        24999.998046875, 1999.9996337890625]);
    }
    if (updates > 69) assert.deepEqual(actual, fixed, '69 is convergence, not the first eligible frame');
  }
  assert.equal(updates, 154, '80ms metadata through2528ms includes154 eligible world renders');
  assert.deepEqual(observeArenaBoundary(world), fixed);
});
