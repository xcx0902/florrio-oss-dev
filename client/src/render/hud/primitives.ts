import { PETAL_INFO } from '../../schema/petals.js';
import type { Canvas2DContext } from '../canvas2d/context.js';
import type { LabelSpec } from '../canvas2d/text-cache.js';
import { drawLabel, drawLabelBox, measureLabel } from '../canvas2d/text-cache.js';
import { HudContext } from '../canvas2d/transform-context.js';
import { drawPetalIcon } from '../entity-art.js';
import { HudLayout } from './layout.js';
import { TAU, clamp, f } from './math.js';
export function roundedRect(context: Pick<Canvas2DContext, 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'closePath'>, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}
export function baseTransform(context: Canvas2DContext, layout: HudLayout, ratio = 1, x = 0, y = 0, zoom = 1): void {
  const scale = f(layout.scale * ratio);
  context.setTransform(f(scale * zoom), 0, 0, f(scale * zoom), f(scale * x), f(scale * y));
}
export function label(context: Canvas2DContext, text: string, font: number, raster: number, x: number, y: number, scale = 1, style?: Partial<LabelSpec>): void {
  drawLabel(context, { text, font, rasterScale: raster, ...style }, x, y, scale, false);
}
export function unitRect(context: Canvas2DContext, scale: number, x: number, y: number, width: number, height: number): void {
  context.setTransform(f(scale * f(width)), 0, 0, f(scale * f(height)), f(scale * f(x)), f(scale * f(y)));
  context.fillRect(0, 0, 1, 1);
}
export const RARITY_RGB: readonly (readonly [
  number,
  number,
  number
])[] = Array.from({ length: 6 }, (_, rarity) => [
  Number(245047318478718n >> BigInt(rarity * 8) & 255n),
  Number(34218529646319n >> BigInt(rarity * 8) & 255n),
  Number(111187557834093n >> BigInt(rarity * 8) & 255n),
]);
export function emptySlot(context: HudContext, layout: HudLayout, x: number, y: number, size: number, discard = false): void {
  const line = f(size / 12);
  context.save();
  context.setGlobalAlpha(0.8);
  context.setFillRgb(255, discard ? 119 : 255, discard ? 119 : 255);
  unitRect(context, layout.scale, f(x - size / 2 + line), f(y - size / 2 + line), f(size - f(line + line)), f(size - f(line + line)));
  context.beginPath();
  baseTransform(context, layout);
  const side = f(size - line), half = f(side * 0.5);
  context.rect(f(x - half), f(y - half), side, side);
  context.setLineWidth(line);
  context.setStrokeRgb(207, discard ? 96 : 207, discard ? 96 : 207);
  context.stroke();
  context.restore();
}
export function filledSlot(context: HudContext, type: number, x: number, y: number, size: number, layout: HudLayout, raster: number, progress = 1, owner?: string, angle = 0): void {
  if (!type || !PETAL_INFO[type])
    return;
  const rarity = PETAL_INFO[type].rarity;
  const rgb = RARITY_RGB[rarity] ?? RARITY_RGB[0];
  const side = f(size - f(size / 12)), half = f(side * 0.5);
  if (angle !== 0) {
    // Rotate the entire native card pass, including its recharge clip, art
    // and label, about the same center. Keep logical getTransform unrotated
    // so cached text composition does not apply the rotation twice.
    const cosine = f(Math.cos(angle)), sine = f(Math.sin(angle));
    const cx = f(layout.scale * x), cy = f(layout.scale * y);
    let matrix: readonly number[] = [1, 0, 0, 1, 0, 0];
    const stack: (readonly number[])[] = [];
    const rotated = new Proxy(context, { get(target, property) {
        if (property === 'getTransform')
          return () => matrix;
        if (property === 'save')
          return () => { stack.push(matrix); target.save(); };
        if (property === 'restore')
          return () => { matrix = stack.pop() ?? matrix; target.restore(); };
        if (property === 'setTransform')
          return (a: number, b: number, c: number, d: number, e: number, g: number) => {
            matrix = [a, b, c, d, e, g];
            target.setTransform(f(cosine * a - sine * b), f(sine * a + cosine * b), f(cosine * c - sine * d), f(sine * c + cosine * d), f(cx + cosine * (e - cx) - sine * (g - cy)), f(cy + sine * (e - cx) + cosine * (g - cy)));
          };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    filledSlot(rotated, type, x, y, size, layout, raster, progress, owner);
    return;
  }
  context.save();
  context.setGlobalAlpha(1);
  context.save();
  context.save();
  context.setFillRgb(...rgb);
  unitRect(context, layout.scale, f(x - half), f(y - half), side, side);
  const recharge = clamp(progress);
  const rechargeAngle = f(recharge * recharge * TAU);
  if (rechargeAngle < TAU * 0.99999) {
    // func587: rotating sector clipped before the border and petal art.
    context.save();
    context.setGlobalAlpha(1);
    context.beginPath();
    baseTransform(context, layout, 1, x, y);
    context.moveTo(0, -5);
    context.arc(0, -5, size * 2, rechargeAngle * 5.7, rechargeAngle * 4.7 + TAU, false);
    context.clip();
    context.setFillRgb(...rgb.map(value => Math.round(value * 0.64)) as [
      number,
      number,
      number
    ]);
    const inner = f(size - f(f(size / 12) * 2));
    unitRect(context, layout.scale, f(x - inner / 2), f(y - inner / 2), inner, inner);
    context.restore();
  }
  context.beginPath();
  baseTransform(context, layout, 1, x, y);
  context.rect(-half, -half, side, side);
  context.setLineWidth(f(size / 12));
  context.setStrokeRgb(...rgb.map(value => Math.round(value * 0.81)) as [
    number,
    number,
    number
  ]);
  context.stroke();
  baseTransform(context, layout, 1, x, y - 5);
  drawPetalIcon(context, type, size / 70);
  context.restore();
  context.setTransform(1, 0, 0, 1, 0, 0);
  // func587 sizes the label from the petal definition's label radius
  // (n[9] * slotSize / 70), not from its collision radius. The cached font
  // stays in source units under the HUD matrix, so the bitmap's measured
  // advance and outline margins are scaled exactly once.
  const logicalFont = f(PETAL_INFO[type].labelSize * size / 70);
  const textWidth = measureLabel(PETAL_INFO[type].name, logicalFont);
  const width = f(f(textWidth + 2 * Math.trunc(f(logicalFont * 0.12 * 2))) * layout.scale);
  const height = f(f(logicalFont * 1.4) * layout.scale);
  drawLabelBox(context, { text: PETAL_INFO[type].name, font: logicalFont, cacheKey: owner,
    rasterScale: f(raster * 0.8825833333333333) }, f(f(layout.scale * x) - f(width * 0.5)), f(f(layout.scale * f(y + size * 17 / 70)) - f(height * 0.5)), width, height, false);
  context.restore();
  context.restore();
}
