/** Petal tooltip drawn on the main canvas in CSS-pixel coordinates. */
import { PETAL_INFO,RARITY_NAMES } from '../schema/petals.js';
import type { Canvas2DContext } from './canvas2d/context.js';
import { drawLabelBox,measureLabel } from './canvas2d/text-cache.js';
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
export function drawPetalTooltipAt(context: Canvas2DContext, type: number,
                                  anchorX: number, anchorY: number,
                                  viewportWidth: number, viewportHeight: number,
                                  scale: number, pixelRatio: number, opacity = 1): void {
  const info = PETAL_INFO[type];
  if (!info || type === 0) return;
  const uiScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const width = viewportWidth / uiScale, height = viewportHeight / uiScale;
  const anchorLogicalX = anchorX / uiScale, anchorLogicalY = anchorY / uiScale;
  // func1099 receives the unscaled font metrics and divides the anchor by the
  // UI scale; its whole layout is then drawn under the HUD matrix. Keeping the
  // cache font unscaled is what makes glyph advance widths and the box edges
  // land on the same fractional pixels as the native renderer.
  const titleFont = 24, lineFont = 14;
  const titleText = info.name;
  const rarity = RARITY_NAMES[info.rarity] ?? RARITY_NAMES[0];
  // 623 stores each definition line separately; it does not word-wrap them.
  const descriptionLines = info.description.split('\n').filter(line => line.length > 0);
  const marginFor = (font: number): number => Math.trunc(font * 0.12 * 2);
  const lineWidth = (text: string, font: number): number =>
    measureLabel(text, font) + 2 * marginFor(font);
  const titleWidth = lineWidth(titleText, titleFont);
  const rarityWidth = lineWidth(rarity, lineFont);
  const descriptionWidths = descriptionLines.map(line => lineWidth(line, lineFont));
  const contentWidth = Math.max(titleWidth, rarityWidth, 0, ...descriptionWidths);
  // The empty line inserted by 623 is initialized with the native default
  // font (16), not the 14-unit stat font.
  const blankFont = 16;
  const contentHeight = titleFont * 1.1 + lineFont * 1.1 + blankFont * 1.1
    + lineFont * 1.1 * descriptionLines.length;
  // func1099 clamps the un-padded content edge to 15 logical units and the
  // rounded panel adds a fixed 5-unit padding on every side.
  const edge = 15;
  const contentLeft = Math.max(edge, Math.min(width - edge - contentWidth,
    anchorLogicalX - contentWidth / 2));
  const contentTop = Math.max(edge, Math.min(height - edge - contentHeight,
    anchorLogicalY - contentHeight));
  const left = contentLeft - 5, top = contentTop - 5;
  const rasterScale = ratio * uiScale * 2.4;
  context.save();
  const matrix = Math.fround(ratio * uiScale);
  context.setTransform(matrix, 0, 0, matrix, 0, 0);
  context.setFillRgb(0, 0, 0);
  context.setGlobalAlpha(0.5 * opacity);
  rounded(context, left, top, contentWidth + 10, contentHeight + 10, 5);
  context.fill();
  context.setGlobalAlpha(opacity);
  let lineTop = contentTop - 2;
  drawLabelBox(context, { text: titleText, font: titleFont, rasterScale,
    fill: '#FFFFFF', stroke: '#000000' },
    // Native623 supplies [-2] as the per-line offsets to 691/1099. Only
    // the title receives it, compensating its larger outline margin.
    contentLeft - 2, lineTop, titleWidth, titleFont * 1.4, false);
  lineTop += titleFont * 1.1;
  const color = rarityRgb(info.rarity);
  context.setFillRgb(color[0], color[1], color[2]);
  context.setStrokeRgb(color[0], color[1], color[2]);
  drawLabelBox(context, { text: rarity, font: lineFont, rasterScale,
    fill: `rgb(${color[0]},${color[1]},${color[2]})`, stroke: '#000000' },
    contentLeft, lineTop, rarityWidth, lineFont * 1.4, false);
  lineTop += lineFont * 1.1 + blankFont * 1.1;
  for (const [index, line] of descriptionLines.entries()) {
    drawLabelBox(context, { text: line, font: lineFont, rasterScale,
      fill: '#FFFFFF', stroke: '#000000' },
      contentLeft, lineTop, descriptionWidths[index] ?? 0, lineFont * 1.4, false);
    lineTop += lineFont * 1.1;
  }
  context.restore();
}
