import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile only the tested source in memory: no public/dist or frozen writes.
const source = await readFile(new URL('../src/render/movement-helper.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022,
} }).outputText;
const { MovementHelper } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const input = (overrides = {}) => ({ enabled: true, keyboardMovement: false, mobile: false,
  alive: true, deltaMs: 10000, pointerX: 840, pointerY: 360, playerX: 0, playerY: 0,
  cameraX: 0, cameraY: 0, zoom: 1, viewportWidth: 1280, viewportHeight: 720, pixelRatio: 1, ...overrides });

function surface(alpha = 1) {
  let state = { alpha, matrix: [7, 0, 0, 7, 11, 13], color: [1, 2, 3], width: 3, cap: 'butt', join: 'miter' };
  const stack = [], ops = [], record = (name, ...args) => ops.push([name, ...args]);
  const context = {
    getGlobalAlpha: () => state.alpha,
    save: () => { stack.push(structuredClone(state)); record('save'); },
    restore: () => { state = stack.pop(); record('restore'); },
    setTransform: (...matrix) => { state.matrix = matrix; record('setTransform', ...matrix); },
    setGlobalAlpha: value => { state.alpha = value; record('setGlobalAlpha', value); },
    setLineCap: value => { state.cap = value; record('setLineCap', value); },
    setLineJoin: value => { state.join = value; record('setLineJoin', value); },
    setLineWidth: value => { state.width = value; record('setLineWidth', value); },
    setStrokeRgb: (...color) => { state.color = color; record('setStrokeRgb', ...color); },
    beginPath: () => record('beginPath'), moveTo: (...args) => record('moveTo', ...args),
    lineTo: (...args) => record('lineTo', ...args), stroke: () => record('stroke'),
  };
  return { context, ops, get state() { return state; } };
}
const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const lines = ops => ops.filter(op => op[0] === 'lineTo');

test('disabled, keyboard and mobile modes submit no context calls and do not advance smoothing', () => {
  for (const mode of [{ enabled: false }, { keyboardMovement: true }, { mobile: true }]) {
    const helper = new MovementHelper();
    const forbidden = new Proxy({}, { get: (_, name) => () => assert.fail(`disabled context call: ${String(name)}`) });
    assert.equal(helper.draw(forbidden, input(mode)), false);
    const actual = surface(), expected = surface();
    helper.draw(actual.context, input({ pointerX: 1640, deltaMs: 16 }));
    new MovementHelper().draw(expected.context, input({ pointerX: 1640, deltaMs: 16 }));
    assert.deepEqual(actual.ops, expected.ops);
  }
});

test('native world-distance thresholds suppress invisible arrows and reach 20% opacity at 150', () => {
  for (const [distance, alpha] of [[0, 0], [99, 0], [100, 0], [125, 0.1], [150, 0.2], [200, 0.2]]) {
    const { context, ops } = surface();
    assert.equal(new MovementHelper().draw(context, input({ pointerX: 640 + distance })), alpha > 0);
    if (!alpha) assert.deepEqual(ops, []);
    else close(ops.find(op => op[0] === 'setGlobalAlpha')[1], alpha);
  }
});

test('arrow follows the native shaft, repeated tip and two 144-degree wings in world coordinates', () => {
  const { context, ops } = surface();
  assert.equal(new MovementHelper().draw(context, input()), true);
  assert.deepEqual(ops.find(op => op[0] === 'moveTo'), ['moveTo', 50, 0]);
  const path = lines(ops);
  assert.equal(path.length, 4);
  assert.deepEqual(path[0], ['lineTo', 200, 0]);
  assert.deepEqual(path[2], path[0]);
  close(path[1][1], 159.5491485595703); close(path[1][2], 29.389259338378906);
  close(path[3][1], path[1][1]); close(path[3][2], -path[1][2]);
  assert.deepEqual(ops.find(op => op[0] === 'setLineWidth'), ['setLineWidth', 20]);
  assert.deepEqual(ops.find(op => op[0] === 'setStrokeRgb'), ['setStrokeRgb', 51, 51, 51]);
  assert.equal(ops.filter(op => op[0] === 'stroke').length, 1);
});

test('CSS pointer projection, camera translation, zoom and device pixel ratio agree', () => {
  const { context, ops } = surface();
  const data = input({ pointerX: 700, pointerY: 320, playerX: 100, playerY: -40,
    cameraX: 100, cameraY: -40, zoom: 2, viewportWidth: 800, viewportHeight: 600, pixelRatio: 2 });
  const original = structuredClone(data);
  assert.equal(new MovementHelper().draw(context, data), true);
  assert.deepEqual(ops.find(op => op[0] === 'setTransform'), ['setTransform', 4, 0, 0, 4, 400, 760]);
  assert.deepEqual(lines(ops)[0], ['lineTo', 250, -30]);
  assert.deepEqual(data, original, 'no camera or input mutation');
});

test('16ms smoothing uses the separate native 0.7/0.6 rates and reset reproduces startup', () => {
  const helper = new MovementHelper(), first = surface();
  const data = input({ pointerX: 1640, deltaMs: 16 });
  assert.equal(helper.draw(first.context, data), true);
  const visibility = Math.fround(1 - 0.7 ** (Math.fround(16) * 0.06));
  const mouse = Math.fround(1000 * (1 - 0.6 ** (Math.fround(16) * 0.06)));
  const tip = Math.fround(visibility * mouse);
  assert.deepEqual(lines(first.ops)[0], ['lineTo', tip, 0]);
  assert.ok(tip > 100 && tip < 150);
  const next = surface(); helper.draw(next.context, data);
  assert.ok(lines(next.ops)[0][1] > tip);
  helper.reset();
  const restarted = surface(); helper.draw(restarted.context, data);
  assert.deepEqual(restarted.ops, first.ops);
  helper.reset();
  const stationary = surface();
  assert.equal(helper.draw(stationary.context, input({ deltaMs: 0 })), false);
  assert.deepEqual(stationary.ops, []);
});

test('death fades an existing arrow and preserves the original absolute-world endpoint scaling', () => {
  const helper = new MovementHelper(); helper.draw(surface().context, input());
  const fading = surface();
  assert.equal(helper.draw(fading.context, input({ alive: false, deltaMs: 16 })), true);
  const visibility = Math.fround(0.7 ** (16 * 0.06));
  close(lines(fading.ops)[0][1], Math.fround(visibility * 200));
  const ended = surface();
  assert.equal(helper.draw(ended.context, input({ alive: false })), false);
  assert.deepEqual(ended.ops, []);
  assert.equal(new MovementHelper().draw(ended.context, input({ alive: false })), false);
});

test('draw multiplies caller opacity and restores its full transform and styles, including on errors', () => {
  const helper = new MovementHelper(), actual = surface(0.5), before = structuredClone(actual.state);
  assert.equal(helper.draw(actual.context, input()), true);
  close(actual.ops.find(op => op[0] === 'setGlobalAlpha')[1], 0.1);
  assert.deepEqual(actual.state, before);
  assert.equal(actual.ops[0][0], 'save'); assert.equal(actual.ops.at(-1)[0], 'restore');
  actual.context.stroke = () => { throw new Error('canvas failure'); };
  assert.throws(() => helper.draw(actual.context, input()), /canvas failure/);
  assert.deepEqual(actual.state, before);
  assert.equal(actual.ops.at(-1)[0], 'restore');
});

test('invalid projection inputs do not corrupt smoothing or submit canvas operations', () => {
  for (const invalid of [{ zoom: 0 }, { pixelRatio: 0 }, { pointerX: NaN }, { deltaMs: Infinity }, { viewportWidth: 0 }]) {
    const { context, ops } = surface();
    assert.equal(new MovementHelper().draw(context, input(invalid)), false);
    assert.deepEqual(ops, []);
  }
});
