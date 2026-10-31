import { renderResources } from '../resources.js';
import { canvasAvailable, createRasterCanvas, drawLabelBox, getRasterContext, measureLabel } from '../canvas2d/text-cache.js';
import { HudContext } from '../canvas2d/transform-context.js';
import { HudLayout } from './layout.js';
import { clamp, f } from './math.js';
import { baseTransform, label, roundedRect } from './primitives.js';
import { FlowerEntry, HudState } from './state.js';
import { wrapHudSurface } from './surface.js';
export function flowerEntries(state: HudState): readonly FlowerEntry[] {
  return state.flowerEntries === undefined
    ? [{ name: state.playerName ?? 'Unnamed Flower', score: state.score ?? 0, local: true }]
    : state.flowerEntries.slice().sort((a, b) => b.score - a.score).slice(0, 10);
}
/** Source format strings at 15745/14099/13648: %.0f, %.1fk, %.1fm.
* The archived func1983 rounds half-integers down at precision zero;
* its one-decimal abbreviation path rounds exact ties to even. */
export function formatScore(score: number): string {
  const absolute = Math.abs(score);
  const value = absolute < 1000 ? absolute : absolute < 1e6 ? absolute * 0.001 : absolute * 0.000001;
  const places = absolute < 1000 ? 0 : 1;
  const power = places === 0 ? 1 : 10;
  const scaled = value * power, floor = Math.floor(scaled);
  // At one decimal place only quarter-integers are exact binary ties.
  // Multiplying by ten can erase which side of a midpoint the double was
  // on (2450 * .001 is above 2.45), so otherwise round the expected value.
  const exactTie = scaled - floor === 0.5 && (places === 0 || Number.isInteger(value * 4));
  const roundedTie = floor + (places === 0 ? 0 : floor % 2);
  const formatted = exactTie ? (roundedTie / power).toFixed(places) : value.toFixed(places);
  return `${score < 0 ? '-' : ''}${formatted}${absolute < 1000 ? '' : absolute < 1e6 ? 'k' : 'm'}`;
}
export function scoreFraction(entry: FlowerEntry, leader: FlowerEntry | undefined): number {
  const fraction = f((entry.displayedScore ?? entry.score) / (leader?.displayedScore ?? leader?.score ?? 0));
  return Number.isFinite(fraction) ? clamp(fraction) : 1;
}
export function drawPanelContent(context: HudContext, entries: readonly FlowerEntry[], scale: number, x: number, y: number): void {
  context.setGlobalAlpha(1);
  context.setLineJoin('round');
  context.setLineCap('round');
  context.save();
  context.setTransform(scale, 0, 0, scale, x, y);
  context.beginPath();
  roundedRect(context, 0, 0, 200, 276, 5);
  context.setFillRgb(85, 85, 85);
  context.setStrokeRgb(69, 69, 69);
  context.setLineWidth(6);
  context.fill();
  context.stroke();
  entries.forEach((entry, index) => {
    const displayedScore = entry.displayedScore ?? entry.score;
    const y = 59 + index * 22;
    context.beginPath();
    context.moveTo(20, y);
    context.lineTo(180, y);
    context.setLineWidth(20);
    context.setStrokeRgb(68, 68, 68);
    context.stroke();
    const fraction = scoreFraction(entry, entries[0]);
    context.beginPath();
    context.moveTo(20, y);
    context.lineTo(20 + 160 * fraction, y);
    context.setLineWidth(16);
    context.setStrokeRgb(...(entry.local ? [255, 252, 97] : [210, 210, 210]) as [
      number,
      number,
      number
    ]);
    context.stroke();
    const score = `- ${formatScore(displayedScore)}`;
    // func1132/819 lays out two left-aligned cache boxes as one centered
    // line. Their outline margins overlap at the join; long names retain
    // native font size rather than being independently fitted to the bar.
    const nameWidth = f(measureLabel(entry.name, 13) + 6);
    const scoreWidth = f(measureLabel(score, 13) + 6);
    const left = f(f(f(6 - f(nameWidth + scoreWidth)) * 0.5) + 100);
    const height = f(13 * 1.4), top = f(y - height * 0.5), rasterScale = f(scale * 2.4);
    const projectedScale = f(scale + scale);
    drawLabelBox(context, { text: entry.name, font: 13, rasterScale, projectedScale, cacheKey: `flower-name:${index}` }, left, top, nameWidth, height, false);
    drawLabelBox(context, { text: score, font: 13, rasterScale, projectedScale, cacheKey: `flower-score:${index}` }, f(f(left + nameWidth) - 3), top, scoreWidth, height, false);
  });
  // func1132 draws the header last, with square lower corners.
  context.beginPath();
  context.moveTo(5, 0);
  context.lineTo(195, 0);
  context.quadraticCurveTo(200, 0, 200, 5);
  context.lineTo(200, 40);
  context.lineTo(0, 40);
  context.lineTo(0, 5);
  context.quadraticCurveTo(0, 0, 5, 0);
  context.closePath();
  context.setFillRgb(85, 187, 85);
  context.setStrokeRgb(69, 151, 69);
  context.setLineWidth(6);
  context.fill();
  context.stroke();
  context.restore();
}
export function drawFlowerPanel(context: HudContext, state: HudState, layout: HudLayout, ratio: number, slide = 0): void {
  const resources = renderResources();
  const entries = flowerEntries(state), count = state.flowers ?? state.flowerEntries?.length ?? 1;
  context.save();
  const x = layout.logicalWidth - 230 + slide;
  if (canvasAvailable()) {
    // The native panel cache compares displayed strings and score fractions,
    // rather than invalidating on each fractional step toward a score target.
    const rows = entries.map(entry => [entry.name, entry.local,
      formatScore(entry.displayedScore ?? entry.score), scoreFraction(entry, entries[0])] as const);
    const previous = resources.panelSurface;
    if (!previous || previous.ratio !== ratio || previous.scale !== layout.scale
        || rows.length !== previous.rows.length || rows.some((row,i) => row.some((value,j) => value !== previous.rows[i][j]))) {
      if (previous) { previous.canvas.width=0; previous.canvas.height=0; }
      const canvas = createRasterCanvas(Math.ceil(242 * layout.scale * ratio), Math.ceil(325.6 * layout.scale * ratio));
      const native = canvas ? getRasterContext(canvas) : null;
      if (canvas && native) {
        drawPanelContent(wrapHudSurface(native), entries, f(layout.scale * 1.1 * ratio), f(layout.scale * 11 * ratio), f(layout.scale * 11 * ratio));
        resources.panelSurface = { canvas, rows, ratio, scale:layout.scale };
      }
    }
    if (resources.panelSurface) {
      context.setTransform(f(layout.scale * ratio * 220), 0, 0, f(layout.scale * ratio * 296), f(layout.scale * ratio * x), f(layout.scale * ratio * 10));
      context.drawImage(resources.panelSurface.canvas, 0, 0, f(242 * layout.scale * ratio), f(325.6 * layout.scale * ratio), 0, 0, 1, 1);
    }
  }
  else {
    const scale = f(layout.scale * ratio);
    drawPanelContent(context, entries, scale, f(scale * (x + 10)), f(scale * 20));
  }
  baseTransform(context, layout, ratio, x, 10);
  label(context, `${count} ${count === 1 ? 'Flower' : 'Flowers'}`, 18, f(f(layout.scale * ratio) * 2.4), 110, 30);
  context.restore();
}
