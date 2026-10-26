import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';

// Load the new source without emitting or relying on client/public.
const source = await readFile(new URL('../src/state/pan.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
} }).outputText;
const { createPanState, getPointerMovement, getPanTarget, updatePanState } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const f = Math.fround;
const viewportFactor = (width, height) => Math.max(
  f(f(height) * 0.0009259259095415473), f(f(width) * 0.0005208333604969084));
const input = (overrides = {}) => ({ displayedX: 0, displayedY: 0,
  mouseX: 640, mouseY: 360, cameraX: 0, cameraY: 0,
  zoom: f(f(0.9) * viewportFactor(1280, 720)),
  viewportWidth: 1280, viewportHeight: 720, deltaMs: 16, ...overrides });

let oraclePromise;
async function originalPan() {
  if (!oraclePromise) oraclePromise = (async () => {
    const finishedInput = new Error('native queuePlayerInput completed');
    // Original763 runs queuePlayerInput before its first inner drawing save.
    // With callerRenderer=0 there is no outer Canvas save. Stop at that inner
    // save, so no camera follow or world rendering can affect the observation.
    // The original WASM instructions are unchanged; only exports are added.
    const host = code => {
      if (code === 136300) throw finishedInput;
      return code === 141314 ? 2000 : 0;
    };
    const runtime = await loadOriginal('client', { functionIds: [368, 763],
      imports: { a: { a: host, c: host } } });
    const bytes = new Uint8Array(runtime.memory.buffer), view = new DataView(bytes.buffer);
    const put = (address, value) => view.setInt32(address, value, true);
    const alloc = size => { const p = runtime.call(368, size); bytes.fill(0, p, p + size); return p; };
    const game = alloc(4096), state = game + 8, local = alloc(160), entity = alloc(448),
      transform = alloc(176), localEntries = alloc(4);
    // Minimal active local-player/control/transform ABI, as published by the
    // recovered source. Displayed coordinates are the cached world transform.
    put(state + 256, 1); put(state + 264, localEntries); put(localEntries, local);
    put(local + 144, entity); put(entity + 120, transform);
    bytes[state + 1] = 1; bytes[transform + 144] = 1;
    bytes[151560] |= 1; bytes[151516] = 0; // settings initialized; mouse movement
    bytes[7931360] |= 1; bytes[7931352] = 1; bytes[7931296] = 0;
    const sample = (previous, options) => {
      const factor = viewportFactor(options.viewportWidth | 0, options.viewportHeight | 0);
      const scale = f(f(options.zoom) / factor);
      assert.equal(f(scale * factor), f(options.zoom), 'fixture supplies an exact native projection');
      view.setFloat32(game + 2056, previous.x, true);
      view.setFloat32(game + 2060, previous.y, true);
      view.setFloat64(transform + 152, options.displayedX, true);
      view.setFloat64(transform + 160, options.displayedY, true);
      view.setFloat32(state + 2148, options.cameraX, true);
      view.setFloat32(state + 2152, options.cameraY, true);
      view.setFloat32(state + 2156, scale, true);
      put(state + 2160, options.viewportWidth); put(state + 2164, options.viewportHeight);
      put(163824, options.mouseX); put(163828, options.mouseY);
      bytes[state + 648 + 248] = options.enabled === false ? 0 : 1;
      bytes[game + 2040] = 0; // observe this sample's movement without send throttling
      const stack = runtime.stackPointer.value;
      try {
        assert.throws(() => runtime.call(763, game, 0, options.deltaMs,
          options.viewportWidth, options.viewportHeight), error => error === finishedInput);
        return { x: view.getFloat32(state + 2048, true), y: view.getFloat32(state + 2052, true) };
      } finally {
        // The intentional Canvas host exception leaves native scratch frames
        // allocated. Restore the test fixture's stack before the next sample.
        runtime.stackPointer.value = stack;
      }
    };
    sample.movement = () => ({ angle: view.getFloat32(game + 2032, true),
      strength: view.getFloat32(game + 2036, true) });
    return sample;
  })();
  return oraclePromise;
}

function assertPanClose(actual, expected, label) {
  for (const axis of ['x', 'y']) assert.ok(Math.abs(actual[axis] - expected[axis]) <= 1e-7,
    `${label}.${axis}: ${actual[axis]} != ${expected[axis]}`);
}

test('pan is a pure world-offset update and defaults to enabled', () => {
  const previous = Object.freeze(createPanState());
  const options = Object.freeze(input({ mouseX: 700 }));
  const actual = updatePanState(previous, options);
  assert.deepEqual(previous, { x: 0, y: 0 });
  assert.notStrictEqual(actual, previous);
  assert.deepEqual(actual, updatePanState(previous, { ...options, enabled: true }));
  assert.ok(actual.x > 0 && actual.x < 5);
  assert.equal(actual.y, 0);
});

test('pan target uses current camera screen-to-world and the displayed local transform', async () => {
  const native = await originalPan();
  for (const [width, height, scale] of [[1280,720,0.9],[800,1200,1],[1920,1080,0.75],[321,241,1.3]])
    for (const [displayedX, displayedY, cameraX, cameraY] of [
      [0,0,0,0], [-24978.123456,-1043.987654,-24975.75,-1045.5], [12345.6789,-6789.0123,12342.5,-6786.25],
    ]) for (const [mouseX, mouseY] of [[0,0],[width >> 1,height >> 1],[width,height],[width + 31,-17]]) {
      const options = input({ viewportWidth: width, viewportHeight: height,
        zoom: f(f(scale) * viewportFactor(width, height)),
        displayedX, displayedY, cameraX, cameraY, mouseX, mouseY, deltaMs: 1e6 });
      const expected = native(createPanState(), options);
      assertPanClose(getPanTarget(options), expected, `target ${JSON.stringify(options)}`);
      assertPanClose(updatePanState(createPanState(), options), expected, 'settled target');
    }
});

test('pan strength ramps below 100 world units and saturates at five world units', async () => {
  const native = await originalPan();
  for (const [dx, dy] of [[0,0],[25,0],[0,-25],[30,40],[60,80],[600,800],[-500,-250]]) {
    const options = input({ displayedX: -dx, displayedY: -dy, deltaMs: 1e6 });
    const target = getPanTarget(options);
    assertPanClose(target, native(createPanState(), options), `strength ${dx},${dy}`);
    assert.ok(Math.abs(Math.hypot(target.x, target.y) - Math.min(Math.hypot(dx,dy) * 0.05, 5)) < 1e-6);
  }
});

test('pointer movement matches native queued angle/distance before pan capping or disabling', async () => {
  const native = await originalPan();
  let seed = 0x53265abc;
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const fixtures = [0, 0.4375, 0.6875, 1, 1.1875, 2.4375, 2 ** 27].flatMap(slope =>
    [-1, 1].flatMap(x => [-1, 1].map(y => input({ displayedX: -x, displayedY: -y * slope }))));
  for (let i = 0; i < 512; i++) fixtures.push(input({
    displayedX: next() * 50000 - 25000, displayedY: next() * 4000 - 2000,
    cameraX: next() * 50000 - 25000, cameraY: next() * 4000 - 2000,
    mouseX: Math.trunc(next() * 2000 - 300), mouseY: Math.trunc(next() * 1200 - 200),
    deltaMs: 1e6, enabled: i % 2 === 0,
  }));
  for (const options of fixtures) {
    const expectedPan = native(createPanState(), options);
    assert.deepEqual(getPointerMovement(options), native.movement(), `movement ${JSON.stringify(options)}`);
    assertPanClose(updatePanState(createPanState(), options), expectedPan, 'movement-derived pan');
  }
  const near = getPointerMovement(input({ displayedX: -30, displayedY: -40 }));
  assert.equal(near.strength, 50, 'movement strength is raw world distance');
  assert.ok(getPointerMovement(input({ mouseX: 0, mouseY: 0 })).strength > 100,
    'default native mouse origin is not replaced with the screen center');
});

test('pan retains native f64 delta easing, epsilon snaps and disabled decay', async () => {
  const native = await originalPan();
  for (const deltaMs of [-16,0,1e-8,1,16,16.6666666667,40,200,1000])
    for (const enabled of [undefined, true, false])
      for (const previous of [{x:0,y:0},{x:3.141592,y:-2.71828},{x:5e-8,y:-5e-8}]) {
        const options = input({ mouseX: 991, mouseY: 127, deltaMs, enabled });
        assertPanClose(updatePanState(previous, options), native(previous, options),
          `delta ${deltaMs}, enabled ${enabled}, ${JSON.stringify(previous)}`);
      }
});

test('pan sequence follows changing displayed transforms and eases out when disabled', async () => {
  const native = await originalPan();
  let state = createPanState(), expected = createPanState();
  for (let frame = 0; frame < 120; frame++) {
    const options = input({ displayedX: -25000 + frame * 0.7, displayedY: -1000 - frame * 0.4,
      cameraX: -24995 + frame * 0.6, cameraY: -1005 - frame * 0.3,
      mouseX: 640 + Math.round(Math.cos(frame * 0.1) * 300),
      mouseY: 360 + Math.round(Math.sin(frame * 0.1) * 200), enabled: frame < 80 });
    state = updatePanState(state, options); expected = native(expected, options);
    assertPanClose(state, expected, `frame ${frame}`);
  }
  assert.ok(Math.hypot(state.x, state.y) < 1);
});
