import { PETAL_INFO } from '../../schema/petals.js';
import type { Canvas2DContext } from '../canvas2d/context.js';
import { inLocal } from './geometry.js';
import { Rgb, TAU, flashColor, rgb, setFill, setStroke, shade } from './palette.js';
import { rockPoints } from './species.js';
// ---------------------------------------------------------------------------
// Petals and drops
// ---------------------------------------------------------------------------
/** Native catalogue colours, independent of rarity (rarity colours the tile). */
export const petalColors: Readonly<Record<number, Rgb>> = {
  1: rgb(255, 255, 255), 2: rgb(255, 255, 255), 3: rgb(187, 187, 187), 4: rgb(119, 119, 119),
  5: rgb(255, 232, 105), 6: rgb(255, 148, 201), 7: rgb(51, 51, 51), 8: rgb(206, 118, 219),
  9: rgb(255, 255, 255), 10: rgb(51, 51, 51), 11: rgb(138, 194, 85), 12: rgb(206, 118, 219),
  13: rgb(56, 199, 95), 14: rgb(254, 255, 201), 15: rgb(255, 148, 201), 16: rgb(255, 255, 255),
  17: rgb(255, 255, 255), 18: rgb(255, 255, 255), 19: rgb(255, 231, 99), 20: rgb(255, 255, 255),
  21: rgb(180, 56, 199), 22: rgb(255, 240, 184), 23: rgb(255, 240, 184), 24: rgb(255, 148, 201),
  25: rgb(51, 51, 51), 26: rgb(51, 51, 51), 27: rgb(51, 51, 51), 28: rgb(255, 255, 255),
  29: rgb(255, 255, 255), 30: rgb(255, 255, 255), 31: rgb(247, 207, 47), 32: rgb(57, 181, 74),
  33: rgb(56, 199, 95), 34: rgb(206, 118, 219), 35: rgb(255, 255, 255), 36: rgb(255, 255, 255),
  37: rgb(255, 255, 255), 38: rgb(255, 228, 25),
};
export function petalColor(type: number): Rgb { return petalColors[type] ?? rgb(255, 255, 255); }
export function petalPaint(context: Canvas2DContext, type: number, width = 3): void {
  const color = petalColor(type);
  setFill(context, color);
  setStroke(context, shade(color));
  context.setLineWidth(width);
  context.fill();
  context.stroke();
}
export function petalDisc(context: Canvas2DContext, type: number, radius: number, x = 0, y = 0): void {
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  petalPaint(context, type);
}
export function petalPolygon(context: Canvas2DContext, radius: number, sides: number, inset = 1): void {
  context.beginPath();
  context.moveTo(radius, 0);
  for (let index = 1; index <= sides; index++) {
    const angle = index * TAU / sides;
    if (inset !== 1) {
      const middle = angle - Math.PI / sides;
      context.quadraticCurveTo(Math.cos(middle) * radius * inset, Math.sin(middle) * radius * inset, Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    else
      context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  context.closePath();
}
/** Recovered catalogue shapes. World instances and inventory icons have
* different multiplicities (Twin/Triplet/Peas); neither is a generic disc.
* Coordinates/colours are checked against the actual catalogue vtables in
* client.wasm, not against the old eight-scene golden's social-media paths. */
export function drawPetalShape(context: Canvas2DContext, type: number, _icon: boolean, _now: number, seed = type, phase = _now * 0.001): void {
  switch (type) {
    case 4:
    case 36: {
      // The original creates one irregular polygon per instance.
      const points = rockPoints(seed, type === 4 ? 14 : 12, type === 4 ? 5 : 7);
      context.beginPath();
      points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
      context.closePath();
      context.setLineJoin('round');
      petalPaint(context, type);
      return;
    }
    case 5:
      context.beginPath();
      context.rect(-10.60660171508789, -10.60660171508789, 21.21320343017578, 21.21320343017578);
      petalPaint(context, type, 2.250000089406967);
      return;
    case 7:
    case 27:
      petalPolygon(context, 7, 3);
      petalPaint(context, type);
      return;
    case 9:
      inLocal(context, local => {
        local.beginPath();
        local.arc(0, 0, 15, -Math.PI / 2, Math.PI / 2);
        local.quadraticCurveTo(10, 0, 0, -15);
        local.closePath();
        petalPaint(local, type);
      });
      return;
    case 10:
      context.setLineJoin('round');
      context.beginPath();
      context.moveTo(11, 0);
      context.lineTo(-11, -6);
      context.lineTo(-11, 6);
      context.closePath();
      setFill(context, petalColor(type));
      setStroke(context, petalColor(type));
      context.setLineWidth(5);
      context.fill();
      context.stroke();
      return;
    case 11:
    case 12:
    case 34: {
      // Native3628/3649/4283: diagonal offsets, independent fill/stroke per
      // pea, and a persistent random initial phase in the world. Native4283
      // uses radius 10 and offset 7 for the Legendary cluster.
      const offset = type === 34 ? 7 : 6, radius = type === 34 ? 10 : 7;
      inLocal(context, local => {
        for (const [x, y] of [[offset, offset], [-offset, offset], [offset, -offset], [-offset, -offset]])
          inLocal(local, pea => petalDisc(pea, type, radius), 1, 0, x, y);
      }, 1, _icon ? 0 : Math.fround(phase));
      return;
    }
    case 13:
    case 21:
    case 33:
      petalPolygon(context, 15, 8, 0.739103626);
      petalPaint(context, type);
      context.beginPath();
      context.arc(0, 0, 8, 0, TAU);
      setFill(context, type === 21 ? rgb(194, 116, 214) : rgb(116, 214, 143));
      context.fill();
      return;
    case 15:
      context.beginPath();
      context.moveTo(10, 0);
      for (let index = 1; index <= 3; index++) {
        const angle = index * TAU / 3, mid = angle - Math.PI / 3;
        context.quadraticCurveTo(Math.cos(mid) * 20, Math.sin(mid) * 20, Math.cos(angle) * 10, Math.sin(angle) * 10);
      }
      context.closePath();
      petalPaint(context, type);
      return;
    case 16:
    case 17:
      petalDisc(context, type, 7);
      return;
    case 18: {
      const alpha = context.getGlobalAlpha?.() ?? 1;
      context.setGlobalAlpha(alpha * 0.7);
      context.beginPath();
      context.arc(0, 0, 12, 0, TAU);
      context.setLineWidth(3);
      setStroke(context, rgb(255, 255, 255));
      context.stroke();
      context.setGlobalAlpha(alpha * 0.35);
      setFill(context, rgb(255, 255, 255));
      context.beginPath();
      context.arc(0, 0, 10.5, 0, TAU);
      context.fill();
      context.beginPath();
      context.arc(4, -4, 3, 0, TAU);
      context.fill();
      context.setGlobalAlpha(alpha);
      return;
    }
    case 20:
      context.setLineCap('round');
      context.setLineWidth(7);
      setStroke(context, rgb(51, 51, 51));
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(-16, 0);
      context.stroke();
      petalDisc(context, type, 9);
      return;
    case 22:
    case 23:
      context.beginPath();
      context.ellipse(0, 0, type === 22 ? 11 : 13, type === 22 ? 15 : 17, 0, 0, TAU);
      petalPaint(context, type);
      return;
    case 25:
      context.setLineJoin('round');
      context.setLineCap('round');
      inLocal(context, local => {
        for (const sign of [-1, 1]) {
          local.beginPath();
          local.moveTo(25, sign * 5);
          local.quadraticCurveTo(40, sign * 10, 50, sign * 15);
          local.quadraticCurveTo(40, sign * 5, 25, sign * 5);
          local.closePath();
          setFill(local, petalColor(type));
          setStroke(local, petalColor(type));
          local.setLineWidth(3);
          local.fill();
          local.stroke();
        }
      }, 1, -Math.PI / 2, 0, 35);
      return;
    case 26:
      petalDisc(context, type, 16);
      context.beginPath();
      context.arc(6, -6, 4.6, 0, TAU);
      setFill(context, rgb(204, 204, 204));
      context.fill();
      return;
    case 28:
      context.setLineCap('round');
      context.setLineWidth(3);
      context.beginPath();
      context.arc(0, 0, 12, 0, TAU);
      context.setFillRgb(255, 255, 255);
      context.fill();
      context.beginPath();
      context.arc(0, 0, 12, -Math.PI / 2, Math.PI / 2);
      setFill(context, rgb(51, 51, 51));
      context.fill();
      for (const [y, color] of [[6, 51], [-6, 255]]) {
        context.beginPath();
        context.arc(0, y, 6, 0, TAU);
        context.setFillRgb(color, color, color);
        context.fill();
      }
      for (const [start, end, color] of [[-Math.PI / 2, 0, 41], [Math.PI / 2, -Math.PI / 2, 207], [0, Math.PI / 2, 41]]) {
        context.beginPath();
        context.arc(0, 0, 12, start, end);
        context.setStrokeRgb(color, color, color);
        context.stroke();
      }
      for (const [y, start, end, color] of [[6, Math.PI / 2, -Math.PI / 2, 41], [-6, -Math.PI / 2, Math.PI / 2, 207]]) {
        context.beginPath();
        context.arc(0, y, 6, start, end);
        context.setStrokeRgb(color, color, color);
        context.stroke();
      }
      return;
    case 29:
    case 30:
      petalPolygon(context, 11, 5, 0.4854101966);
      petalPaint(context, type);
      return;
    case 31:
      petalPolygon(context, 11, 6);
      petalPaint(context, type);
      return;
    case 32:
      context.setLineCap('round');
      context.setLineWidth(3);
      setStroke(context, shade(petalColor(type)));
      context.beginPath();
      context.moveTo(-15, 0);
      context.lineTo(-20, 0);
      context.stroke();
      context.beginPath();
      context.moveTo(-15, 0);
      context.bezierCurveTo(-10, -12, 5, -12, 15, 0);
      context.bezierCurveTo(5, 12, -10, 12, -15, 0);
      context.closePath();
      petalPaint(context, type);
      context.beginPath();
      context.moveTo(-9, 0);
      context.quadraticCurveTo(0, -1.5, 7.5, 0);
      context.stroke();
      return;
    case 37:
      context.setLineCap('round');
      context.beginPath();
      context.moveTo(-8, 0);
      context.quadraticCurveTo(0, -3, 8, 0);
      context.setLineWidth(10);
      context.setStrokeRgb(207, 207, 207);
      context.stroke();
      context.setLineWidth(4);
      context.setStrokeRgb(255, 255, 255);
      context.stroke();
      return;
    case 38:
      context.beginPath();
      context.moveTo(-5, 8);
      context.quadraticCurveTo(-15, -8, 0, -8);
      context.quadraticCurveTo(15, -8, 5, 8);
      context.quadraticCurveTo(0, 2, -5, 8);
      context.closePath();
      petalPaint(context, type);
      return;
    default: petalDisc(context, type, PETAL_INFO[type]?.radius ?? 10);
  }
}
export function drawPetalInstance(context: Canvas2DContext, type: number, radius = PETAL_INFO[type]?.radius ?? 10, now = 0, seed = type, phase?: number): void {
  if (!type || !PETAL_INFO[type])
    return;
  const base = PETAL_INFO[type]?.radius ?? 10;
  const scale = Number.isFinite(radius) && radius > 0 ? radius / base : 1;
  const draw = (local: Canvas2DContext): void => drawPetalShape(local, type, false, now, seed, phase);
  if (type === 9)
    inLocal(context, draw, scale, now * 0.01);
  else if (type === 5)
    inLocal(context, draw, scale, phase ?? now * 0.0003);
  else if (scale === 1)
    draw(context);
  else
    inLocal(context, draw, scale);
}
/** Native760 component+108. Hornet projectiles have their own fixed 1.3
* transform, round caps/joins and 5-unit stroke, independent of collider size. */
export function drawHornetMissile(context: Canvas2DContext, flash = 0): void {
  inLocal(context, local => {
    local.setLineCap('round');
    local.setLineJoin('round');
    local.setLineWidth(5);
    const color = flashColor(rgb(51, 51, 51), flash);
    setFill(local, color);
    setStroke(local, color);
    local.beginPath();
    local.moveTo(11, 0);
    local.lineTo(-11, -6);
    local.lineTo(-11, 6);
    local.closePath();
    local.fill();
    local.stroke();
  }, Math.fround(1.3));
}
/** Split Peas use native760 component+68, not the catalogue cluster. */
export function drawLaunchedPea(context: Canvas2DContext, type: number, flash = 0, flags = type === 34 ? 3 : type === 12 ? 1 : 0): void {
  const color = flashColor(petalColor(flags & 1 ? 12 : 11), flash);
  context.beginPath();
  context.arc(0, 0, flags & 2 ? 10 : 7, 0, TAU);
  setFill(context, color);
  context.fill();
  setStroke(context, shade(color));
  context.setLineWidth(3);
  context.stroke();
}
/** Native760 component+92: five scalloped rings and thirteen 55-unit spokes.
* The original caches this path in a 120-unit bitmap. Keep its actual geometry
* here so a ground Web can never be scaled into a collider-sized Missile. */
export function drawGroundWeb(context: Canvas2DContext, progress = 1): void {
  const f = Math.fround, step = TAU / 13;
  inLocal(context, local => {
    local.setGlobalAlpha((local.getGlobalAlpha?.() ?? 1) * progress * 0.5);
    local.setLineJoin('round');
    local.setLineCap('round');
    local.setLineWidth(3);
    local.setStrokeRgb(255, 255, 255);
    local.beginPath();
    const point = (index: number, radius: number): readonly [
      number,
      number
    ] => {
      const angle = f(index * step);
      return [f(f(Math.cos(angle)) * radius), f(f(Math.sin(angle)) * radius)];
    };
    for (let radius = 10; radius <= 50; radius += 10) {
      local.moveTo(radius, 0);
      for (let index = 0; index < 13; index++) {
        const a = point(index, radius), b = point(index + 1, radius);
        const x = f(a[0] + b[0]), y = f(a[1] + b[1]), length = f(Math.sqrt(x * x + y * y));
        local.quadraticCurveTo(f(f(x * 0.5) - f(f(x / length) * 5)), f(f(y * 0.5) - f(f(y / length) * 5)), b[0], b[1]);
      }
      local.closePath();
    }
    for (let index = 0; index < 13; index++) {
      local.moveTo(0, 0);
      local.lineTo(...point(index, 55));
    }
    local.stroke();
  }, Math.fround(progress));
}
export function drawPetalIcon(context: Canvas2DContext, type: number, scale = 1): void {
  const info = PETAL_INFO[type];
  if (!type || !info)
    return;
  const angle = [5, 9, 10, 11, 12, 20, 29, 30, 34].includes(type) ? 1 : type === 32 ? -1 : type === 37 || type === 38 ? 0.7 : 0;
  if (info.instances === 1 && angle === 0 && scale === 1) {
    drawPetalShape(context, type, true, 0);
    return;
  }
  inLocal(context, local => {
    if (info.instances > 1)
      for (let index = 0; index < info.instances; index++) {
        const phase = Math.fround(index * 6.283185 / info.instances);
        // Native587 translates the group first. Each catalogue visual then
        // applies its own icon rotation, preserving the cluster's orientation.
        inLocal(local, part => drawPetalShape(part, type, true, 0), 1, angle, Math.fround(Math.fround(Math.cos(phase)) * 10), Math.fround(Math.fround(Math.sin(phase)) * 10));
      }
    else
      inLocal(local, part => drawPetalShape(part, type, true, 0), 1, angle);
  }, scale);
}
