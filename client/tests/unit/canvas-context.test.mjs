import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapContext } from '../../../build/client/render/canvas2d/context.js';
import { wrapHudSurface } from '../../../build/client/render/hud/surface.js';

function surface() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [], ops = [];
  let transformReads = 0;
  const native = new Proxy({
    getTransform: () => { ++transformReads; return Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((key, i) => [key, matrix[i]])); },
    setTransform: (...values) => { matrix = values; ops.push(['setTransform', ...values]); },
    save: () => { stack.push([...matrix]); ops.push(['save']); },
    restore: () => { matrix = stack.pop() ?? matrix; ops.push(['restore']); },
    beginPath: () => ops.push(['beginPath']),
    moveTo: (...args) => ops.push(['moveTo', ...args]),
    lineTo: (...args) => ops.push(['lineTo', ...args]),
    fillRect: (...args) => ops.push(['fillRect', ...args]),
  }, { set(target, key, value) { target[key] = value; ops.push([key, value]); return true; } });
  return { context: wrapContext(native), native, ops, transformReads: () => transformReads };
}

test('logical transforms flush after styles and before the first coordinate', () => {
  const { context, ops } = surface();
  context.setTransform(2, 0, 0, 2, 10, 20);
  context.setLineWidth(7);
  context.beginPath(); context.moveTo(1, 2); context.lineTo(3, 4);
  assert.deepEqual(ops, [['lineWidth', 7], ['beginPath'],
    ['setTransform', 2, 0, 0, 2, 10, 20], ['moveTo', 1, 2], ['lineTo', 3, 4]]);
});

test('path coordinates reuse the flushed matrix and explicit synchronization handles native resets', () => {
  const { context, native, ops, transformReads } = surface();
  context.setTransform(2, 0, 0, 2, 10, 20);
  for (let i = 0; i < 1000; ++i) context.lineTo(i, i);
  assert.equal(transformReads(), 1, 'a path must not read a DOMMatrix for each coordinate');
  assert.equal(ops.filter(op => op[0] === 'setTransform').length, 1);
  native.setTransform(1, 0, 0, 1, 0, 0);
  context.syncTransform();
  context.lineTo(1, 2);
  assert.equal(transformReads(), 2);
  assert.deepEqual(ops.at(-2), ['setTransform', 2, 0, 0, 2, 10, 20]);
});

test('nested saves preserve unflushed transforms and compose from logical state', () => {
  const { context, ops } = surface();
  context.setTransform(2, 0, 0, 3, 10, 20);
  context.save(); context.transform(1, 0, 0, 1, 4, 5);
  context.fillRect(0, 0, 1, 1); context.restore(); context.fillRect(0, 0, 1, 1);
  assert.deepEqual(ops.filter(op => op[0] === 'setTransform'), [
    ['setTransform', 2, 0, 0, 3, 18, 35], ['setTransform', 2, 0, 0, 3, 10, 20],
  ]);
});

test('HUD surfaces use the same exact RGB byte conversion as the shared bridge', () => {
  const {native,ops}=surface(),hud=wrapHudSurface(native);
  hud.setFillRgb(17.2,-1,511);hud.setStrokeRgb(256,10,127);
  assert.deepEqual(ops,[['fillStyle','#11FFFF'],['strokeStyle','#000A7F']]);
});
