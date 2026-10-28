import test from 'node:test';
import assert from 'node:assert/strict';
import { drawHud, hotbarSlotAt, inventorySlotAt, getHudLayout } from '../public/render/ui.js';
import { PETAL_INFO } from '../public/schema/petals.js';

/** Record the DOM-free path. Scope tooltip checks to its own draw pass: Rose
 * may legitimately be drawn as a hotbar label even when no tooltip is open. */
function render(state = {}) {
  const calls = [];
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === 'measureText') return text => ({ width: String(text).length * 6 });
      return (...args) => { calls.push([String(property), args]); };
    },
    set() { return true; },
  });
  drawHud(context, { health: 100, maxHealth: 100, level: 1, slots: [], ...state });
  let start = -1;
  for (let index = calls.length - 1; index > 0; --index)
    if (calls[index][0] === 'setGlobalAlpha' && calls[index][1][0] === 0.5
        && calls[index - 1][0] === 'setFillRgb'
        && calls[index - 1][1].every(value => value === 0)) { start = index - 1; break; }
  const end = start < 0 ? -1 : calls.findIndex(([op], index) => index > start && op === 'restore');
  const tooltip = start < 0 ? [] : calls.slice(start, end);
  return { calls, tooltip, texts: tooltip.filter(([op]) => op === 'fillText').map(([, args]) => String(args[0])) };
}

test('hotbar hit test includes all eight source storage slots and discard', () => {
  assert.equal(hotbarSlotAt(490 + 28, 594 + 28), 0);
  assert.equal(hotbarSlotAt(490 + 4 * 62 + 28, 594 + 28), 4);
  assert.equal(hotbarSlotAt(490 + 28, 655 + 18), 6);
  assert.equal(hotbarSlotAt(810 + 18, 655 + 18), 'discard');
  assert.equal(hotbarSlotAt(10, 10), undefined);
  const layout = getHudLayout(1280, 720, 30);
  assert.equal(hotbarSlotAt(layout.storageX * layout.scale, layout.storageY * layout.scale, 1280, 720, 30), 7);
});

test('inventory hit test matches the 6x3 grid and follows viewport dimensions', () => {
  assert.equal(inventorySlotAt(454 + 28, 279 + 28), 0);
  assert.equal(inventorySlotAt(454 + 3 * 62 + 28, 279 + 2 * 62 + 28), 15);
  assert.equal(inventorySlotAt(454 + 5 * 62 + 28, 279 + 2 * 62 + 28), undefined);
  assert.equal(inventorySlotAt(10, 10), undefined);
  assert.equal(inventorySlotAt(1920 / 2 - 198 + 12 + 28, 1080 / 2 - 125 + 44 + 28, 1920, 1080), 0);
});

test('tooltip preserves source name, rarity, blank separation and full description', () => {
  const result = render({ inventoryOpen: true, slots: [0, 6], hoveredSlot: 1, pointerX: 400, pointerY: 300 });
  assert.equal(result.texts[0], 'Rose');
  assert.equal(result.texts[1], 'Unusual');
  assert.equal(result.texts.slice(2).join(' '), PETAL_INFO[6].description);
  // source/game/client/petal-tooltip.mjs func623 has no synthetic reload line.
  assert.ok(!result.texts.some(text => /reload/i.test(text)));
  const ys = result.tooltip.filter(([op]) => op === 'fillText').map(([, args]) => args[2]);
    assert.ok(ys[2] - ys[1] >= 21, 'description retains the source blank separator');
});

test('hotbar and inventory tooltip anchors stay fixed while the pointer moves inside a petal', () => {
  for (const inventoryOpen of [false, true]) {
    const a = render({ inventoryOpen, slots: [6], hoveredSlot: 0, pointerX: 502, pointerY: 611 });
    const b = render({ inventoryOpen, slots: [6], hoveredSlot: 0, pointerX: 530, pointerY: 632 });
    assert.deepEqual(a.tooltip, b.tooltip, 'tooltip follows the displayed slot, not pointer coordinates');
  }
});

test('all source rarities retain their RGB values', () => {
  const cases = [
    [1, 'Common', [126, 239, 109]], [6, 'Unusual', [255, 230, 93]],
    [4, 'Rare', [94, 77, 227]], [15, 'Epic', [134, 31, 222]],
    [23, 'Legendary', [222, 31, 31]], [5, 'Unique', [222, 31, 101]],
  ];
  for (const [type, rarity, rgb] of cases) {
    const result = render({ slots: [type], hoveredSlot: 0 });
    assert.equal(result.texts[0], PETAL_INFO[type].name);
    assert.equal(result.texts[1], rarity);
    assert.ok(result.tooltip.some(([op, args]) => op === 'setStrokeRgb' && args.every((value, index) => value === rgb[index])));
  }
});

test('no tooltip without a valid hovered nonempty slot, or while dragging', () => {
  for (const state of [
    { slots: [6] }, { slots: [6, 0], hoveredSlot: 1 }, { slots: [6], hoveredSlot: -1 },
    { slots: [6], hoveredSlot: 0.5 }, { slots: [6], hoveredSlot: 99 },
    { slots: [6], hoveredSlot: 0, draggedSlot: 0, pointerX: 400, pointerY: 300 },
  ]) {
    const result = render({ inventoryOpen: true, ...state });
    assert.equal(result.tooltip.length, 0, JSON.stringify(state));
    assert.ok(result.calls.some(([op, args]) => op === 'fillText' && args[0] === 'Rose'), 'equipped label remains visible');
  }
});

test('storage hover uses authoritative storage contents and wraps inside viewport edges', () => {
  for (const [width, height, pointerX, pointerY, pixelRatio] of [[1280, 720, 1279, 719, 1], [320, 480, -20, -20, 2]]) {
    const result = render({ width, height, pixelRatio, slots: [1, 1, 1, 1, 1, 6], storageSlots: [5],
      hoveredSlot: 5, pointerX, pointerY });
    assert.equal(result.texts[0], 'Square');
    assert.equal(result.texts[1], 'Unique');
    assert.equal(result.texts.slice(2).join(' '), PETAL_INFO[5].description);
    const layout = getHudLayout(width, height, 1, false);
    const coordinates = result.tooltip.filter(([op]) => ['moveTo', 'lineTo', 'quadraticCurveTo'].includes(op)).flatMap(([, args]) => args);
    for (let index = 0; index < coordinates.length; index += 2) {
      assert.ok(coordinates[index] >= 8 && coordinates[index] <= layout.logicalWidth - 8, `x=${coordinates[index]}`);
      assert.ok(coordinates[index + 1] >= 8 && coordinates[index + 1] <= layout.logicalHeight - 8, `y=${coordinates[index + 1]}`);
    }
    // func1099 works in logical units under the UI matrix; the logical matrix
    // is the CSS pixel ratio multiplied once by the HUD scale.
    const transform = result.tooltip.find(([op]) => op === 'setTransform')[1];
    const matrix = Math.fround(pixelRatio * layout.scale);
    assert.deepEqual(transform, [matrix, 0, 0, matrix, 0, 0]);
  }
});

test('hover bounds follow the source hotbar and the expanded inventory separately', () => {
  const slots = Array(24).fill(6);
  for (const level of [1, 15, 30, 45]) {
    const count = getHudLayout(1280, 720, level).equippedCount;
    assert.equal(render({ level, slots, hoveredSlot: count + 7 }).texts[0], 'Rose');
    assert.equal(render({ level, slots, hoveredSlot: count + 8 }).tooltip.length, 0, 'discard has no petal');
  }
  assert.equal(render({ inventoryOpen: true, slots, hoveredSlot: 15 }).texts[0], 'Rose');
  assert.equal(render({ inventoryOpen: true, slots, hoveredSlot: 16 }).tooltip.length, 0);
  assert.equal(render({ slots, storageSlots: [], hoveredSlot: 5 }).tooltip.length, 0,
    'explicit empty storage cannot fall back to a stale flattened slot');
});
