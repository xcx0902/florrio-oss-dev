import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOriginal } from '../../test/helpers/wasm-probe.mjs';
import { createHudState, drawHud, getHudLayout } from '../public/render/hud.js';

const f = Math.fround;
const state = { health: 100, maxHealth: 100, level: 30, arenaWidth: 50000, playerX: 0 };

test('warning visibility follows native client588 boundary, independently of the timer', async () => {
  const original = await loadOriginal('client', { functionIds: [588] });
  const view = new DataView(original.memory.buffer), arena = 5000000;
  for (const width of [50000, 4125, 9876]) {
    view.setFloat32(arena + 252, width, true);
    for (const level of [1, 14, 15, 29, 30, 44, 45, 99]) {
      const boundary = original.call(588, arena, level);
      const positions = Number.isFinite(boundary) ? [boundary - 1, boundary, boundary + 1] : [-width / 2, width / 2];
      for (const playerX of positions) {
        const hud = createHudState();
        const result = hud.update({ ...state, level, arenaWidth: width, playerX, zoneProgress: 255 }, 16, 16);
        assert.equal(result.zoneWarningAlpha > 0, playerX < boundary,
          `width=${width}, level=${level}, x=${playerX}, native boundary=${boundary}`);
      }
    }
  }
});

test('warning fades out in the correct zone while the accumulated timer remains full', () => {
  const hud = createHudState();
  let shown;
  for (let now = 16; now <= 320; now += 16) shown = hud.update({ ...state, zoneProgress: 255 }, now, 16);
  let alpha = shown.zoneWarningAlpha, countdown = shown.zoneCountdownProgress;
  for (let now = 336; now <= 656; now += 16) {
    const hidden = hud.update({ ...state, playerX: 10000, zoneProgress: 255 }, now, 16);
    alpha = f(alpha + (1 - Math.pow(0.7, f(16) * 0.06)) * -alpha);
    countdown = f(countdown + (1 - Math.pow(0.8, f(16) * 0.06)) * (f(255 * 0.003922) - countdown));
    assert.equal(hidden.zoneWarningAlpha, alpha);
    assert.equal(hidden.zoneCountdownProgress, countdown);
    assert.deepEqual(hud.update({ ...state, playerX: 10000, zoneProgress: 255 }, now, 16), hidden);
  }
  assert.ok(alpha < 0.002);
  hud.reset();
  assert.equal(hud.update({ ...state, playerX: 10000, zoneProgress: 255 }, 16, 16).zoneWarningAlpha, 0);
});

test('warning radial indicator matches original func1099 and its actual func2636 callback', async () => {
  let original;
  const calls = [];
  const host = (code, signature, pointer) => {
    if (!original) return 0;
    const view = new DataView(original.memory.buffer), bytes = new Uint8Array(view.buffer), values = [];
    let cursor = pointer >>> 2;
    for (let type; (type = bytes[signature++]); cursor++) {
      if (type < 105) {
        if (cursor & 1) cursor++;
        values.push(view.getFloat64((cursor++ >>> 1) * 8, true));
      } else values.push(view.getInt32(cursor * 4, true));
    }
    calls.push([code, ...values.slice(1)]);
    return 0;
  };
  original = await loadOriginal('client', { functionIds: [818, 1099], imports: { a: { a: host, c: host } } });
  const view = new DataView(original.memory.buffer), bytes = new Uint8Array(view.buffer);
  const renderer = 5000000, record = renderer + 200, labels = renderer + 500, callback = renderer + 1200, color = renderer + 1300;
  view.setInt32(color, -1, true); original.call(818, renderer, color);
  const layout = getHudLayout();
  view.setFloat32(record, 1, true);
  view.setFloat32(record + 4, layout.logicalWidth * 0.5, true);
  view.setFloat32(record + 8, layout.logicalHeight * 0.5 - 170, true);
  view.setUint32(record + 12, labels, true); view.setUint32(record + 16, 3, true);
  // client.wat 320225-320237 builds the template with qword [0, 65.0];
  // function691 copies that qword to record +24, so +28 is the 65px gutter.
  view.setFloat32(record + 24, 0, true); view.setFloat32(record + 28, 65, true);
  view.setUint32(record + 56, 1, true); view.setUint32(record + 48, callback, true);
  view.setUint32(callback, 90324, true);
  for (let index = 0; index < 3; index++) {
    const label = labels + index * 152;
    bytes[label + 120] = 1;
    // No DOM canvas here: both sides use the same zero text measurement, so
    // the comparison isolates the command gutter and callback geometry.
    view.setFloat32(label + 116, 0, true);
    view.setFloat32(label + 144, 0.12, true);
    view.setFloat32(label + 148, index === 0 ? 20 : 14, true);
  }
  for (const progress of [0, 0.125, 0.5, 0.999, 1]) {
    calls.length = 0; view.setFloat32(440000, progress, true);
    original.call(1099, renderer, record, layout.logicalWidth, layout.logicalHeight, 1);
    const nativeArcs = calls.filter(([op]) => op === 137995).map(([, ...args]) => args);
    const recorded = [];
    const context = new Proxy({}, { get(_target, method) {
      if (method === 'measureText') return () => ({ width: 0 });
      if (method === 'getGlobalAlpha') return () => 1;
      return (...args) => { recorded.push([method, ...args]); };
    } });
    drawHud(context, { ...state, zoneWarningAlpha: 1, zoneCountdownProgress: f(progress) });
    const arcs = recorded.filter(([op, , , radius]) => op === 'arc' && (radius === 22 || radius === 18))
      .map(([, ...args]) => args.map(value => typeof value === 'boolean' ? +value : value));
    assert.equal(arcs.length, 2);
    arcs.forEach((arc, index) => arc.forEach((value, argument) =>
      assert.ok(Math.abs(value - nativeArcs[index][argument]) < 0.00005,
        `progress ${progress}, arc ${index}, argument ${argument}: ${value} != ${nativeArcs[index][argument]}`)));
    const title = recorded.find(([op, text]) => op === 'fillText' && text === 'MOVE RIGHT ->');
    assert.ok(title);
    const boxWidth = (index) =>
      Math.trunc(f(f(f(index === 0 ? 20 : 14) * 0.12) * 2)) * 2;
    const widest = Math.max(boxWidth(0), boxWidth(1), boxWidth(2));
    const arcLeft = f(arcs[0][0] - arcs[0][2]);
    // drawLabelBox centers the text in its box, so recover the panel's left
    // edge from the title's text x. Both the title and the widest subtitle must
    // stay left of the 22px countdown arc; the 65px command gutter guarantees it.
    const panelLeft = f(title[2] - boxWidth(0) * 0.5);
    assert.ok(arcLeft - f(panelLeft + widest) >= 8 - 0.0001,
      `progress ${progress}: widest label right ${panelLeft + widest} overlaps arc left ${arcLeft}`);
    assert.ok(arcLeft - f(panelLeft + boxWidth(0)) >= 8 - 0.0001,
      `progress ${progress}: title right ${panelLeft + boxWidth(0)} overlaps arc left ${arcLeft}`);
    assert.ok(recorded.some(([op, text]) => op === 'fillText' && text === 'MOVE RIGHT ->'));
    assert.ok(recorded.some(([op, text]) => op === 'fillText' && text === 'You will be unable to attack'));
    assert.ok(!recorded.some(([op, text]) => op === 'fillText' && /seconds/.test(String(text))));
  }
});
