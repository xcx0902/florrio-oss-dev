import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';

const source = await readFile(new URL('../src/render/species-animation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
} }).outputText;
const { createSpeciesAnimationState, advanceSpeciesAnimation } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

async function animationOracle() {
  const native = await loadOriginal('client', { functionIds: [368, 615, 782, 1038] });
  const bytes = new Uint8Array(native.memory.buffer), view = new DataView(bytes.buffer);
  const alloc = size => { const at = native.call(368, size); bytes.fill(0, at, at + size); return at; };
  const entity = alloc(448), component = alloc(64), renderer = alloc(128), visual = alloc(128),
    bounds = alloc(64), flags = alloc(64), transform = alloc(192);
  const put = (at, value) => view.setUint32(at, value, true);
  put(component, entity); put(entity + 56, flags); put(entity + 136, visual);
  put(entity + 140, bounds); put(entity + 120, transform);
  view.setFloat32(bounds + 8, 40, true); bytes[transform + 144] = 1;
  const reset = () => {
    bytes.fill(0, component + 8, component + 64);
    bytes.fill(0, renderer, renderer + 128);
    view.setFloat32(renderer, 1, true); view.setFloat32(renderer + 12, 1, true);
    view.setFloat64(renderer + 56, 1, true);
    bytes[renderer + 48] = 1; bytes[renderer + 50] = 2;
  };
  return { reset,
    step(species, elapsed, active, x = 0, y = 0) {
      bytes[flags + 8] = active;
      view.setFloat64(transform + 152, x, true); view.setFloat64(transform + 160, y, true);
      if (species === 7) {
        native.call(615, component, renderer, elapsed, -1);
        return { time: view.getFloat64(component + 24, true), activity: view.getFloat32(component + 16, true) };
      }
      if (species === 12) {
        native.call(782, component, renderer, elapsed);
        return { time: view.getFloat64(component + 16, true), activity: view.getFloat32(component + 8, true) };
      }
      native.call(1038, component, renderer, elapsed);
      return { legPhase: view.getFloat64(component + 8, true), speed: view.getFloat32(component + 28, true),
        previousX: view.getFloat32(component + 16, true), previousY: view.getFloat32(component + 20, true) };
    } };
}

test('ant and beetle clocks and AI activity match the original across rendered frames', async () => {
  const oracle = await animationOracle();
  for (const species of [7, 12]) {
    oracle.reset();
    const state = createSpeciesAnimationState();
    for (let frame = 0; frame < 90; frame++) {
      const delta = [16, 16.6666666667, 0, 40][frame % 4];
      const flags = frame < 25 || frame > 60 ? 0 : 1;
      advanceSpeciesAnimation(state, { typeId: species, speciesId: species, byteFields: { 36: flags, 22: flags ^ 1 } }, 0, 0, delta);
      const expected = oracle.step(species, delta, flags);
      assert.deepEqual({ time: state.time, activity: state.activity }, expected, `species ${species}, frame ${frame}`);
    }
  }
});

test('spider legs retain native f32 position sampling, speed easing and f64 accumulated phase', async () => {
  const oracle = await animationOracle(); oracle.reset();
  const state = createSpeciesAnimationState();
  for (let frame = 0; frame < 90; frame++) {
    const delta = frame % 9 === 0 ? 0 : [16, 16.6666666667, 40][frame % 3];
    const x = -24567.12345 + frame * 0.785, y = -1071.98765 + Math.sin(frame * 0.2) * 11;
    advanceSpeciesAnimation(state, { typeId: 22, speciesId: 22 }, x, y, delta);
    const expected = oracle.step(22, delta, 0, x, y);
    assert.deepEqual({ legPhase: state.legPhase, speed: state.speed,
      previousX: state.previousX ?? 0, previousY: state.previousY ?? 0 }, expected, `frame ${frame}`);
  }
});
