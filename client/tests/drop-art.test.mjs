import test from 'node:test';
import assert from 'node:assert/strict';
import { createDropOracle, createDropCardOracle } from './helpers/drop-oracle.mjs';
import { createDropVisualState, advanceDropVisualState, drawDrop, drawPetalCard } from '../public/render/entity-art.js';

const f = Math.fround;
class Context {
  constructor(matrix = [1, 0, 0, 1, 0, 0]) {
    this.state = { matrix, alpha: 1, fill: [0, 0, 0], stroke: [0, 0, 0], width: 1 };
    this.stack = []; this.paints = []; this.rectangles = [];
  }
  save() { this.stack.push(structuredClone(this.state)); }
  restore() { this.state = this.stack.pop(); }
  setTransform(...matrix) { this.state.matrix = matrix; }
  getTransform() { return this.state.matrix; }
  transform(a, b, c, d, e, y) {
    const [A, B, C, D, E, F] = this.state.matrix;
    this.state.matrix = [f(f(A*a)+f(C*b)), f(f(B*a)+f(D*b)), f(f(A*c)+f(C*d)), f(f(B*c)+f(D*d)),
      f(E+f(f(A*e)+f(C*y))), f(F+f(f(B*e)+f(D*y)))];
  }
  setGlobalAlpha(alpha) { this.state.alpha = alpha; }
  getGlobalAlpha() { return this.state.alpha; }
  setFillRgb(...fill) { this.state.fill = fill; }
  setStrokeRgb(...stroke) { this.state.stroke = stroke; }
  setLineWidth(width) { this.state.width = width; }
  setLineCap() {} setLineJoin() {} setFont() {} fillText() {} strokeText() {}
  measureText() { return { width: 0 }; }
  beginPath() { this.path = []; }
  closePath() { this.path.push(['closePath']); }
  moveTo(...args) { this.path.push(['moveTo', ...args]); }
  lineTo(...args) { this.path.push(['lineTo', ...args]); }
  quadraticCurveTo(...args) { this.path.push(['quadraticCurveTo', ...args]); }
  bezierCurveTo(...args) { this.path.push(['bezierCurveTo', ...args]); }
  arc(...args) { this.path.push(['arc', ...args]); }
  ellipse(...args) { this.path.push(['ellipse', ...args]); }
  rect(...args) { this.path.push(['rect', ...args]); }
  fill() { this.paints.push({ op: 'fill', ...structuredClone(this.state), path: structuredClone(this.path) }); }
  stroke() { this.paints.push({ op: 'stroke', ...structuredClone(this.state), path: structuredClone(this.path) }); }
  fillRect(...rect) { this.rectangles.push({ ...structuredClone(this.state), rect }); }
}

test('pickup arrival, idle pulse and collected fade match original763 on each frame', async () => {
  for (const fresh of [true, false]) {
    const native = await createDropOracle({ fresh });
    let state;
    for (let index = 0; index < 180; index++) {
      const delta = [16, 8, 24, 0, 33.333, 4.5, 100][index % 7], collected = index >= 100;
      const expected = native(delta, collected);
      state ??= createDropVisualState(expected.createdAt, fresh, expected.phase);
      advanceDropVisualState(state, expected.now, delta, collected);
      assert.equal(state.progress, expected.progress, `native f32 progress frame ${index}, fresh=${fresh}`);
      const context = new Context(expected.baseline); drawDrop(context, 7, 14, Infinity, state);
      const rim = context.paints[0];
      assert.deepEqual(rim.path, [['rect', ...expected.marker.rect]]);
      assert.equal(rim.width, expected.marker.width);
      assert.equal(rim.alpha, expected.alpha, `native alpha frame ${index}`);
      rim.matrix.forEach((value, component) => assert.ok(value === expected.marker.matrix[component],
        `native matrix frame ${index}, component ${component}: ${value} vs ${expected.marker.matrix[component]}`));
      assert.equal(context.stack.length, 0);
    }
  }
});

test('all 38 pickup cards retain original587 rarity fill, border and dimensions', async () => {
  const native = await createDropCardOracle();
  for (let type = 1; type <= 38; type++) {
    const calls = native(type), expectedFill = calls.find(call => call[0] === 137186).slice(1);
    const expectedRect = calls.find(call => call[0] === 136946).slice(1);
    const expectedStroke = calls.find(call => call[0] === 137456).slice(1);
    const expectedWidth = calls.find(call => call[0] === 138111).at(1);
    const context = new Context(); drawDrop(context, type);
    assert.deepEqual(context.rectangles[0].fill, expectedFill, `fill ${type}`);
    const card = context.paints.find(paint => paint.path[0]?.[0] === 'rect' && paint.path[0][1] !== -36);
    assert.deepEqual(card.path[0].slice(1), expectedRect, `rect ${type}`);
    assert.deepEqual(card.stroke, expectedStroke, `stroke ${type}`);
    assert.equal(card.width, expectedWidth, `line width ${type}`);
  }
});

test('all discovered gallery cards use original587 geometry at both gallery sizes', async () => {
  const native = await createDropCardOracle();
  for (const size of [60, 42]) for (let type = 1; type <= 38; type++) {
    const calls = native(type, size), context = new Context();
    drawPetalCard(context, type, size);
    assert.deepEqual(context.paints[0].path[0].slice(1), calls.find(call => call[0] === 136946).slice(1), `card ${type}/${size}`);
    assert.equal(context.paints[0].width, calls.find(call => call[0] === 138111)[1]);
    assert.deepEqual(context.rectangles[0].fill, calls.find(call => call[0] === 137186).slice(1));
  }
});
