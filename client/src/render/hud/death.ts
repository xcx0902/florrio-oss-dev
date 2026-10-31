import { PETAL_INFO } from '../../schema/petals.js';
import { deathCardRects } from '../../ui/layout/death.js';
import { drawLabelBox, measureLabel } from '../canvas2d/text-cache.js';
import { HudContext } from '../canvas2d/transform-context.js';
import { drawPetalInstance, drawPlayerFace } from '../entity-art.js';
import { drawPetalTooltipAt } from '../tooltip.js';
import { HudLayout } from './layout.js';
import { f } from './math.js';
import { baseTransform, filledSlot, label } from './primitives.js';
import { formatScore } from './scoreboard.js';
import { HudState } from './state.js';
export function drawDeathOverlay(context: HudContext, state: HudState, layout: HudLayout, ratio: number): void {
  // clientFrame interpolates 159188 toward 1 with pow(.95, dt * .06).
  const elapsed = state.deathState?.elapsedMilliseconds;
  const amount = state.deathState?.progress
    ?? f(elapsed === undefined ? 1 : 1 - Math.pow(0.95, Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) * 0.06));
  context.save();
  baseTransform(context, layout, ratio);
  context.setFillRgb(0, 0, 0);
  context.setGlobalAlpha(amount * 0.25);
  context.fillRect(0, 0, layout.logicalWidth, layout.logicalHeight);
  context.setGlobalAlpha(1);
  const centerX = Math.trunc(layout.logicalWidth / 2);
  const displacement = f(f(1 - amount) * layout.logicalHeight);
  const centerY = f(Math.trunc(layout.logicalHeight / 2) - displacement);
  const raster = f(f(layout.scale * ratio) * 2.4);
  baseTransform(context, layout, ratio, centerX, centerY);
  // clientFrame draws the retained petals behind the dead flower, then the
  // dead face at 1.5x, rotated -0.2 radians. Artwork stays in entity-art.
  // Native1095 snapshots the actual loadout. Slots 2/3/4 appear behind the
  // face, 1/0 in front; Antennae's definition suppresses its world instance.
  const kept = state.deathState?.keptSlots ?? [];
  const behind = [[2, -48, 7.5], [3, -15, -22.5], [4, 45, -7.5]] as const;
  const front = [[1, -15, 45], [0, 52.5, 30]] as const;
  for (const [slot, x, y] of behind) {
    const type = kept[slot] ?? 0;
    if (!type || type === 25 || !PETAL_INFO[type])
      continue;
    context.save();
    baseTransform(context, layout, ratio, centerX + x, centerY + y, 1.5);
    drawPetalInstance(context, type, PETAL_INFO[type].radius);
    context.restore();
  }
  context.save();
  const faceScale = f(f(layout.scale * ratio) * 1.5);
  // Exact f32 layout constants.
  const cosine = 0.9800665974617004, sine = 0.19866932928562164;
  context.setTransform(f(faceScale * cosine), f(faceScale * -sine), f(faceScale * sine), f(faceScale * cosine), f(f(layout.scale * ratio) * centerX), f(f(layout.scale * ratio) * centerY));
  drawPlayerFace(context, { dead: true });
  context.restore();
  label(context, 'You were destroyed by:', 18, raster, 0, -120);
  label(context, state.deathState?.killerName ?? 'A mysterious entity', 24, raster, 0, -90);
  label(context, state.mobile ? '(tap to continue)' : '(press enter to continue)', 18, raster, 0, 90);
  for (const [slot, x, y] of front) {
    const type = kept[slot] ?? 0;
    if (!type || type === 25 || !PETAL_INFO[type])
      continue;
    context.save();
    baseTransform(context, layout, ratio, centerX + x, centerY + y, 1.5);
    drawPetalInstance(context, type, PETAL_INFO[type].radius);
    context.restore();
  }
  const scaled = ratio === 1 ? layout : { ...layout, scale: f(layout.scale * ratio) };
  const rowY = displacement;
  const cardY = layout.logicalHeight - 45 + rowY;
  const tooltipAlpha = state.deathState?.tooltipAlpha;
  const tooltips: {
    type: number;
    centerX: number;
    size: number;
    alpha: number;
  }[] = [];
  // Gameplay's HUD already establishes this join. The independent death
  // pass must establish it too on a cold renderer.
  context.save();
  context.setLineJoin('round');
  for (const card of deathCardRects(kept, state.level, { width: layout.width, height: layout.height, mobile: state.mobile, uiScale: state.uiScale }, amount)) {
    const { index, type, size, centerX } = card;
    const alpha = tooltipAlpha?.[index] ?? 0;
    if (alpha > 0.0001) {
      // Native1095 queues renderPetalTooltip from inside the retained-card
      // transform but func1099 drains that queue after the cards and stats.
      tooltips.push({ type, centerX, size, alpha });
    }
    filledSlot(context, type, centerX, cardY, size, scaled, raster, 1, `retained:${index}`);
  }
  context.restore();
  // Native1095 prints the retained death statistics at the bottom-left in
  // the HUD's logical space. Statistics and item row slide up together.
  baseTransform(context, layout, ratio);
  const statsRaster = f(f(layout.scale * ratio) * 2.4);
  for (const [text, font, top] of [
    ['Stats', 24, layout.logicalHeight - 160],
    [`Points: ${formatScore(state.deathState?.score ?? 0)}`, 16, layout.logicalHeight - 126],
    [`Level: ${state.deathState?.respawnLevel ?? state.level ?? 1}`, 16, layout.logicalHeight - 104],
  ] as const) {
    drawLabelBox(context, { text, font, rasterScale: statsRaster }, 20, top + rowY, f(measureLabel(text, font) + Math.trunc(f(f(font * 0.12) * 2)) * 2), f(font * 1.4), false);
  }
  for (const tooltip of tooltips) {
    // Deferred tooltip pass: local (0, -size/2-10) is the card top-centre.
    context.save();
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawPetalTooltipAt(context, tooltip.type, tooltip.centerX * layout.scale, (cardY - tooltip.size / 2 - 10) * layout.scale, layout.width, layout.height, layout.scale, ratio, tooltip.alpha);
    context.restore();
  }
  context.restore();
}
