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

function wrap(value: string, font: number, maxWidth: number): readonly string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (measureLabel(next, font) > maxWidth && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function drawPetalTooltipAt(context: Canvas2DContext, type: number, anchorX: number,
                                   anchorY: number, viewportWidth: number, viewportHeight: number,
                                   scale: number, pixelRatio: number, opacity = 1): void {
  const info = PETAL_INFO[type];
  if (!info || type === 0) return;
  const rasterScale = Math.max(1, pixelRatio * 2.4);
  const titleFont = 24 * scale, lineFont = 14 * scale;
  const titleText = info.name;
  const rarity = RARITY_NAMES[info.rarity] ?? RARITY_NAMES[0];
  const maxTextWidth = Math.min(320, Math.max(120, viewportWidth / scale - 40));
  const descriptionLines = wrap(info.description, lineFont, maxTextWidth);
  const titleWidth = measureLabel(titleText, titleFont);
  const rarityWidth = measureLabel(rarity, lineFont);
  const descriptionWidth = Math.max(0, ...descriptionLines.map(line => measureLabel(line, lineFont)));
  const width = Math.max(titleWidth, rarityWidth, descriptionWidth) + 8 * scale;
  const titleHeight = titleFont * 1.4;
  const lineHeight = lineFont * 1.4;
  const height = titleHeight + lineHeight * (descriptionLines.length + 1) + 12 * scale;
  let x = anchorX - width / 2;
  let y = anchorY - height;
  x = Math.max(8, Math.min(viewportWidth - width - 8, x));
  y = Math.max(8, Math.min(viewportHeight - height - 8, y));
  context.save();
  context.setFillRgb(0, 0, 0);
  context.setGlobalAlpha(0.5 * opacity);
  rounded(context, x, y, width, height, 5 * scale);
  context.fill();
  context.setGlobalAlpha(opacity); context.setFillRgb(255, 255, 255);
  drawLabelBox(context, { text: titleText, font: titleFont, rasterScale, fill: '#FFFFFF', stroke: '#000000' },
    x + 2 * scale, y + 2 * scale, titleWidth, titleHeight, false);
  const color = rarityRgb(info.rarity);
  context.setFillRgb(color[0], color[1], color[2]);
  context.setStrokeRgb(color[0], color[1], color[2]);
  const unit = scale / 0.7;
  const rarityY = y + 18.5 * unit;
  drawLabelBox(context, { text: rarity, font: lineFont, rasterScale,
    fill: `rgb(${color[0]},${color[1]},${color[2]})`, stroke: '#000000' },
    x + 2 * scale, rarityY, rarityWidth, lineHeight, false);
  let lineY = y + 41.6 * unit;
  context.setFillRgb(255, 255, 255);
  for (const line of descriptionLines) {
    const lineWidth = measureLabel(line, lineFont);
    drawLabelBox(context, { text: line, font: lineFont, rasterScale, fill: '#FFFFFF', stroke: '#000000' },
      x + 2 * scale, lineY, lineWidth, lineHeight, false);
    lineY += lineHeight;
  }
  context.restore();
}
