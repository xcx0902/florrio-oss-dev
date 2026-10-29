import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapContext } from '../../public/render/canvas2d/context.js';

function surface() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [], ops = [];
  const native = new Proxy({
    getTransform: () => Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map((key, i) => [key, matrix[i]])),
    setTransform: (...values) => { matrix = values; ops.push(['setTransform', ...values]); },
    save: () => { stack.push([...matrix]); ops.push(['save']); },
    restore: () => { matrix = stack.pop() ?? matrix; ops.push(['restore']); },
    beginPath: () => ops.push(['beginPath']),
    moveTo: (...args) => ops.push(['moveTo', ...args]),
    lineTo: (...args) => ops.push(['lineTo', ...args]),
    fillRect: (...args) => ops.push(['fillRect', ...args]),
  }, { set(target, key, value) { target[key] = value; ops.push([key, value]); return true; } });
  return { context: wrapContext(native), native, ops };
}

test('logical transforms flush after styles and before the first coordinate', () => {
  const { context, ops } = surface();
  context.setTransform(2, 0, 0, 2, 10, 20);
  context.setLineWidth(7);
  context.beginPath(); context.moveTo(1, 2); context.lineTo(3, 4);
  assert.deepEqual(ops, [['lineWidth', 7], ['beginPath'],
    ['setTransform', 2, 0, 0, 2, 10, 20], ['moveTo', 1, 2], ['lineTo', 3, 4]]);
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
