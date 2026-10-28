import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';
import { createDropCardOracle } from './helpers/drop-oracle.mjs';
import { RenderingCanvas } from './helpers/rendering-oracle.mjs';
import { drawHud, getHudLayout } from '../public/render/hud.js';
import { drawPetalCard, drawPetalIcon } from '../public/render/entity-art.js';
import { drawMenu } from '../public/render/menu.js';
import { MenuAnimation } from '../public/render/menu-animation.js';
import { createPetalOracle } from './helpers/petal-oracle.mjs';
import { drawPetalTooltipAt } from '../public/render/tooltip.js';

const close = (a, b, detail) => assert.ok(Math.abs(a - b) < 0.0001, `${detail}: ${a} != ${b}`);

// Execute original804 up to its hint blit. Prewarm the original text cache;
// neither its drawing instructions nor the checked-in goldens are replaced.
async function hintOracle() {
  let runtime, matrix, blit;
  const stop = new Error('hint submitted');
  const host = (code, signature, pointer) => {
    const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(view.buffer), args = [];
    let word = pointer >>> 2;
    for (let kind; (kind = bytes[signature++]); word++) {
      if (kind < 105) { if (word & 1) word++; args.push(view.getFloat64((word++ >> 1) * 8, true)); }
      else args.push(view.getInt32(word * 4, true));
    }
    if (code === 136414) matrix = args.slice(1);
    if (code === 138211) { blit = matrix; throw stop; }
    return 0;
  };
  runtime = await loadOriginal('client', { functionIds: [368, 561, 804, 818], imports: { a: { a: host, c: host } } });
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(view.buffer);
  const put = (p, n) => view.setInt32(p, n, true), float = (p, n) => view.setFloat32(p, n, true);
  const alloc = size => { const p = runtime.call(368, size); bytes.fill(0, p, p + size); return p; };
  const color = alloc(4), renderer = alloc(128), scope = alloc(12), holder = alloc(4), loadout = alloc(200), owner = alloc(4);
  put(color, -1); put(holder, renderer); put(owner, loadout); put(scope, holder); put(scope + 4, owner);
  for (let index = 0; index < 9; index++) {
    const address = index < 8 ? 437744 + index * 152 : 438968;
    const text = index < 8 ? `[${index + 1}]` : '[T]', source = alloc(4);
    bytes.set(new TextEncoder().encode(text), source);
    runtime.call(818, address + 8, color); runtime.call(561, address + 124, source, text.length);
    bytes[address] = 0; bytes[address + 120] = 1;
    float(address + 116, 32); float(address + 144, .12); float(address + 148, 16); float(address + 112, 2);
    put(address + 104, 1);
  }
  return (level, index, x, y, size, alpha) => {
    runtime.call(818, renderer, color); bytes[loadout + 168] = level; float(437404, alpha);
    blit = undefined; const stack = runtime.stackPointer.value;
    try { runtime.call(804, scope, x, y, size, index); }
    catch (error) { if (error !== stop) throw error; }
    finally { runtime.stackPointer.value = stack; }
    assert.ok(blit, 'native hint submitted');
    return [blit[4] + blit[0] / 2, blit[5] + blit[3] / 2];
  };
}

class TextCanvas extends RenderingCanvas {
  texts = [];
  setFont(value) { this.font = value; }
  measureText(text) { return { width: text.length * 6 }; }
  fillText(text, x, y) {
    const m = this.state.matrix;
    this.texts.push({ text, font: this.font, alpha: this.state.alpha,
      x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  }
}

test('Q/E hint centres, font and fade positions follow original804 at every slot threshold', async () => {
  const original = await hintOracle();
  for (const level of [1, 14, 15, 29, 30, 44, 45]) for (const alpha of [.1, .5, 1]) {
    const layout = getHudLayout(1280, 720, level), canvas = new TextCanvas();
    drawHud(canvas, { width: 1280, height: 720, health: 100, maxHealth: 100, level, slots: [], keyboardHint: alpha });
    for (let index = 0; index <= layout.equippedCount; index++) {
      const remove = index === layout.equippedCount;
      const label = canvas.texts.find(row => row.text === (remove ? '[T]' : `[${index + 1}]`));
      assert.ok(label, 'hint exists');
      assert.match(label.font, /16px/); close(label.alpha, alpha, 'hint alpha');
      const expected = original(level, remove ? 16 : index,
        remove ? layout.storageX + 8 * 65 : layout.equippedX + index * 90,
        remove ? layout.storageY : layout.equippedY, remove ? 50 : 70, alpha);
      close(label.x / layout.scale, expected[0], `level ${level} hint ${index} x`);
      close(label.y / layout.scale, expected[1], `level ${level} hint ${index} y`);
    }
  }
});

test('Web and Cactus card instance transforms follow original587 without rotating the whole cluster', async () => {
  const original = await createDropCardOracle();
  for (const type of [16, 17, 30, 33]) {
    const calls = original(type);
    const actual = new RenderingCanvas(); actual.setTransform(1, 0, 0, 1, 0, -5); drawPetalIcon(actual, type);
    // The first two native matrices paint the card fill and border. Cached
    // Path2D artwork (Web) and immediate artwork use the same instance CTMs.
    const expected = calls.filter(call => call[0] === 136414).slice(2).map(call => call.slice(1));
    const matrices = actual.paints.map(p => p.matrix).filter((m, i, all) =>
      i === 0 || m.some((v, j) => v !== all[i - 1][j]));
    assert.equal(matrices.length, expected.length, `petal ${type} transform count`);
    matrices.forEach((matrix, i) => matrix.forEach((value, j) =>
      close(value, expected[i][j], `petal ${type} instance ${i} matrix ${j}`)));
  }
});

test('menu objects draw one native catalogue visual, retaining Peas internal discs', async () => {
  const original = await createPetalOracle();
  for (const type of [16, 17, 30, 33, 11, 12, 34]) {
    const native = new RenderingCanvas(); native.replay(original.draw(type, { bind: false }).calls);
    const seed = 100 + type, animation = new MenuAnimation(seed); animation.setPetals([type]);
    const particles = animation.sample(800, 1280, 720);
    const actual = new RenderingCanvas();
    drawMenu(actual, 1280, 720, '', 1, 800, seed, undefined, undefined, false, 0,
      undefined, [type], undefined, false);
    // Each native visual has a characteristic fill colour; menu UI has none
    // of these colours. Compare the count of those fills to the original.
    const fill = native.paints.find(p => p.op === 'fill').fill;
    const fills = paints => paints.filter(p => p.op === 'fill' && p.fill.every((c, i) => c === fill[i])).length;
    assert.equal(fills(actual.paints), particles.length * fills(native.paints), `menu petal ${type}`);
  }
});

test('tooltip title retains the one-line horizontal offset supplied by original623', async () => {
  const runtime = await loadOriginal('client', { functionIds: [368, 391, 623, 818] });
  runtime.call(391, 1);
  const view = new DataView(runtime.memory.buffer), bytes = new Uint8Array(view.buffer);
  const alloc = size => { const p = runtime.call(368, size); bytes.fill(0, p, p + size); return p; };
  const queue = alloc(4400), renderer = alloc(128), color = alloc(4);
  view.setInt32(color, -1, true); runtime.call(818, renderer, color);
  for (const type of [1, 6, 30, 33]) {
    bytes[queue] = 0; runtime.call(623, queue, renderer, 1, type, 400, 500);
    assert.equal(bytes[queue], 1);
    const record = queue + 8;
    assert.equal(view.getUint32(record + 60, true), 1, 'only the title has an offset');
    const offset = view.getFloat32(record + 72, true);
    assert.equal(offset, -2);
    const actual = new TextCanvas();
    drawPetalTooltipAt(actual, type, 400, 500, 1280, 720, 1, 1);
    const panelLeft = actual.paints[0].path[0][1] - 5;
    const title = actual.texts[0];
    // DOM-free drawLabelBox places its fallback at the box centre.
    const titleBoxWidth = 2 * Math.trunc(24 * .12 * 2); // Node has no font-measurement canvas.
    close(title.x - titleBoxWidth / 2, panelLeft + 5 + offset, `petal ${type} title left`);
  }
});

test('retained death cards and independent menu cards start with the original round join', async () => {
  const original = await createDropCardOracle(), native = new RenderingCanvas(); native.replay(original(1, 50));
  const nativeBorder = native.paints.find(p => p.op === 'stroke' && p.path.some(op => op[0] === 'rect'));
  assert.equal(nativeBorder.join, 'round');
  const death = new RenderingCanvas();
  drawHud(death, { width: 1280, height: 720, level: 45, health: 0, maxHealth: 100, death: true,
    slots: [1], deathState: { elapsedMilliseconds: 1000, progress: 1, keptSlots: [1], killerName: 'Hornet', respawnLevel: 33, score: 0 } });
  const borders = death.paints.filter(p => p.op === 'stroke' && p.path.some(op => op[0] === 'rect'));
  assert.ok(borders.length, 'retained card painted');
  assert.ok(borders.every(p => p.join === nativeBorder.join));
  const menu = new RenderingCanvas(); drawPetalCard(menu, 1, 50);
  assert.equal(menu.paints.find(p => p.op === 'stroke').join, nativeBorder.join);
});
