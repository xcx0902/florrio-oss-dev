/** Petal tooltip drawn on the main canvas in CSS-pixel coordinates. */
import type { Canvas2DContext } from './canvas2d/context.js';
import { drawLabelBox, measureLabel } from './canvas2d/text-cache.js';
import { PETAL_INFO, RARITY_NAMES } from '../schema/petals.js';
import { rarityRgb } from './menu-panels.js';

function rounded(context: Canvas2DContext, x: number, y: number, width: number, height: number,
                 radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
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

/**
 * Native1099 lays out a tooltip as a stack of cached text lines:
 *   width  = max(line boxWidth) + 10
 *   height = sum(font * 1.1) + 10
 * Every line box is the cached bitmap's own width (text + two outline
 * margins); the old code stretched the bitmap down to the bare measured text
 * width, which compressed glyphs and made them look narrower.
 */
export function drawPetalTooltipAt(context: Canvas2DContext, type: number, anchorX: number,
                                   anchorY: number, viewportWidth: number, viewportHeight: number,
                                   scale: number, pixelRatio: number, opacity = 1): void {
  const info = PETAL_INFO[type];
  if (!info || type === 0) return;
  const rasterScale = Math.max(1, pixelRatio * 2.4);
  const titleFont = 24 * scale, lineFont = 14 * scale;
  const titleText = info.name;
  const rarity = RARITY_NAMES[info.rarity] ?? RARITY_NAMES[0];
  // 623 stores each definition line separately; it does not word-wrap them.
  const descriptionLines = info.description.split('\n').filter(line => line.length > 0);
  const marginFor = (font: number): number => Math.trunc(font * 0.12 * 2);
  const boxWidth = (text: string, font: number): number =>
    measureLabel(text, font) + 2 * marginFor(font);
  const titleWidth = boxWidth(titleText, titleFont);
  const rarityWidth = boxWidth(rarity, lineFont);
  const descriptionWidths = descriptionLines.map(line => boxWidth(line, lineFont));
  const width = Math.max(titleWidth, rarityWidth, 0, ...descriptionWidths) + 10 * scale;
  // 623 inserts one initialized but empty line between rarity and the stat
  // lines. It contributes advance but no glyphs; initializeLine leaves that
  // line at the native default 16-unit font, not the 14-unit stat font.
  const blankFont = 16 * scale;
  const height = titleFont * 1.1 + lineFont * 1.1 + blankFont * 1.1
    + lineFont * 1.1 * descriptionLines.length + 10 * scale;
  let x = anchorX - width / 2;
  let y = anchorY - height;
  const edge = 15 * scale;
  x = Math.max(edge, Math.min(viewportWidth - width - edge, x));
  y = Math.max(edge, Math.min(viewportHeight - height - edge, y));
  context.save();
  context.setFillRgb(0, 0, 0);
  context.setGlobalAlpha(0.5 * opacity);
  rounded(context, x, y, width, height, 5 * scale);
  context.fill();
  context.setGlobalAlpha(opacity);
  const left = x + 5 * scale;
  let top = y + 5 * scale;
  drawLabelBox(context, { text: titleText, font: titleFont, rasterScale, fill: '#FFFFFF', stroke: '#000000' },
    left, top, titleWidth, titleFont * 1.4, false);
  top += titleFont * 1.1;
  const color = rarityRgb(info.rarity);
  context.setFillRgb(color[0], color[1], color[2]);
  context.setStrokeRgb(color[0], color[1], color[2]);
  drawLabelBox(context, { text: rarity, font: lineFont, rasterScale,
    fill: `rgb(${color[0]},${color[1]},${color[2]})`, stroke: '#000000' },
    left, top, rarityWidth, lineFont * 1.4, false);
  top += lineFont * 1.1 + blankFont * 1.1;
  for (const [index, line] of descriptionLines.entries()) {
    drawLabelBox(context, { text: line, font: lineFont, rasterScale, fill: '#FFFFFF', stroke: '#000000' },
      left, top, descriptionWidths[index] ?? 0, lineFont * 1.4, false);
    top += lineFont * 1.1;
  }
  context.restore();
}
