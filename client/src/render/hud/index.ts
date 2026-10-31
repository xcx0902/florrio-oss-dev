import { renderResources } from '../resources.js';
import type { Canvas2DContext } from '../canvas2d/context.js';
import { drawLabelBox, measureLabel } from '../canvas2d/text-cache.js';
import { HudContext, hudRenderer } from '../canvas2d/transform-context.js';
import { drawPlayerFace } from '../entity-art.js';
import type { MenuPreviewFrame } from '../menu.js';
import { drawMenu } from '../menu.js';
import { drawDeathOverlay } from './death.js';
import { drawHint, drawHotbar, drawHotbarTooltip } from './hotbar.js';
import { drawInventory } from './inventory.js';
import { HudLayout, getHudLayout } from './layout.js';
import { TAU, clamp, f } from './math.js';
import { baseTransform, label, roundedRect, unitRect } from './primitives.js';
import { drawFlowerPanel } from './scoreboard.js';
import { HudState } from './state.js';
import { getHudSurface } from './surface.js';
export function drawMap(context: HudContext, state: HudState, layout: HudLayout, raster: number, slide = 0): void {
  const resources = renderResources();
  const left = layout.logicalWidth - (state.mobile ? 350 : 300) + slide;
  const top = layout.logicalHeight - 120;
  context.save();
  context.setLineCap('round');
  context.setLineJoin('round');
  context.save();
  const colors = [[30, 167, 97], [167, 167, 30], [167, 39, 30], [85, 85, 85]] as const;
  for (let index = 0; index < 4; index++) {
    const [red, green, blue] = colors[index];
    context.setFillRgb(red, green, blue);
    unitRect(context, layout.scale, left + index * 75, top, index === 2 ? 74.999985 : index === 3 ? 25.000006 : 75, 40);
  }
  baseTransform(context, layout, 1, left, top);
  for (const [text, center] of [['Easy', 37.5], ['Medium', 112.500008], ['Hard', 187.5], ['?', 237.5]] as const) {
    label(context, text, 14, raster, center, 20);
  }
  context.beginPath();
  const normalized = state.mapPosition ?? (state.playerX !== undefined && (state.arenaWidth ?? 0) > 0
    ? state.playerX / state.arenaWidth! + 0.5 : 0);
  context.arc(clamp(normalized) * 250 < 20 ? 20 : Math.min(230, clamp(normalized) * 250), 20, 15, 0, TAU);
  context.setFillRgb(255, 231, 99);
  context.setStrokeRgb(211, 189, 70);
  context.setLineWidth(4);
  context.fill();
  context.stroke();
  context.setLineWidth(5);
  context.setStrokeRgb(51, 51, 51);
  if (typeof Path2D !== 'undefined') {
    if (!resources.mapBorder) {
      resources.mapBorder = new Path2D();
      roundedRect(resources.mapBorder, 0, 0, 250, 40, 5);
    }
    context.stroke(resources.mapBorder);
  }
  else {
    context.beginPath();
    roundedRect(context, 0, 0, 250, 40, 5);
    context.stroke();
  }
  context.restore();
  baseTransform(context, layout);
  label(context, 'Map', 24, raster, left + 125, top - 15);
  context.restore();
}
export function drawLevelBar(context: HudContext, state: HudState, layout: HudLayout, raster: number, slide = 0): void {
  const progress = clamp(state.levelProgress ?? 0);
  const y = layout.logicalHeight - 110;
  context.save();
  context.setLineCap('round');
  context.beginPath();
  baseTransform(context, layout, 1, -slide, 0);
  context.moveTo(0, y);
  context.lineTo(300, y);
  context.setLineWidth(40);
  context.setStrokeRgb(51, 51, 51);
  context.stroke();
  context.setGlobalAlpha(clamp(progress * 30));
  context.setLineWidth(clamp(progress * 30) * 34);
  context.beginPath();
  context.moveTo(0, y);
  context.lineTo(f(f(progress) * 300), y);
  context.setStrokeRgb(245, 255, 101);
  context.stroke();
  context.setGlobalAlpha(1);
  label(context, `Lvl ${state.level} Flower`, 16, raster, 150, y);
  const next = state.level < 15 ? 15 : state.level < 30 ? 30 : state.level < 45 ? 45 : undefined;
  if (!state.mobile && next !== undefined)
    label(context, `Extra petal slot at level ${next}`, 14, raster, 150, y + 32);
  context.restore();
}
export function drawChat(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  const lines = state.chat?.slice(-6) ?? [];
  if (!lines.length)
    return;
  const ratio = state.pixelRatio ?? 1;
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.setGlobalAlpha(0.8);
  context.setFillRgb(0, 0, 0);
  context.fillRect(16, layout.height - 118 - lines.length * 18, Math.min(460, layout.width - 32), lines.length * 18 + 8);
  context.setGlobalAlpha(1);
  lines.forEach((text, index) => label(context, text, 15, raster, 246, layout.height - 110 - (lines.length - 1 - index) * 18));
  context.restore();
}
/** client588 rounds the level boundary to the nearest 50 world units.
* The warning follows current position, while field63 can take 450 seconds
* to drain after returning to the correct zone. */
export function zoneWarningVisible(state: HudState): boolean {
  if (state.death)
    return false;
  if (state.playerX === undefined || !(state.arenaWidth! > 0))
    return (state.zoneProgress ?? 0) > 0;
  if (state.level < 15)
    return false;
  // These are f64 constants containing the promoted float32 fractions in
  // exact f32 values, not shorter decimal spellings.
  const fraction = f(state.level < 30 ? 0.3 : state.level < 45 ? 0.6 : 0.9);
  const cells = f(f((state.arenaWidth! * fraction) - state.arenaWidth! * 0.5) * f(0.02));
  const boundary = Math.sign(cells) * Math.floor(Math.abs(cells) + 0.5) * 50;
  return state.playerX < boundary;
}
export function drawZoneWarning(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  const alpha = state.zoneWarningAlpha ?? +zoneWarningVisible(state);
  if (alpha < 0.0001)
    return;
  const lines = [
    { text: 'MOVE RIGHT ->', font: 20, fill: '#FFAAAA' },
    { text: 'You are overleveled for this zone', font: 14, fill: '#FFFFFF' },
    { text: 'You will be unable to attack', font: 14, fill: '#FFFFFF' },
  ];
  const widths = lines.map(({ text, font }) => f(f(measureLabel(text, font))
    + Math.trunc(f(f(font * 0.12) * 2)) * 2));
  // The warning template reserves 65.0 for the widest label; the HUD adds it
  // to the label width when laying out the warning row.
  // The extra gutter keeps the countdown arc clear of the text.
  const width = f(Math.max(...widths) + 65);
  const height = lines.reduce((sum, { font }) => f(sum + f(font * f(1.1))), 0);
  const left = f(layout.logicalWidth * 0.5 - f(width * 0.5));
  const top = f(f(layout.logicalHeight * 0.5 - 170) + f(height * 0.5));
  context.save();
  context.setGlobalAlpha(alpha * 0.5);
  context.setFillRgb(0, 0, 0);
  context.beginPath();
  const x = left - 5, y = top - 5, right = x + width + 10, bottom = y + height + 10;
  context.moveTo(x + 5, y);
  context.lineTo(right - 5, y);
  context.quadraticCurveTo(right, y, right, y + 5);
  context.lineTo(right, bottom - 5);
  context.quadraticCurveTo(right, bottom, right - 5, bottom);
  context.lineTo(x + 5, bottom);
  context.quadraticCurveTo(x, bottom, x, bottom - 5);
  context.lineTo(x, y + 5);
  context.quadraticCurveTo(x, y, x + 5, y);
  context.closePath();
  context.fill();
  context.setGlobalAlpha(alpha);
  let labelTop = f(top - 2);
  lines.forEach((spec, index) => {
    drawLabelBox(context, { ...spec, rasterScale: raster }, left, labelTop, widths[index], f(spec.font * 1.4));
    labelTop = f(labelTop + f(spec.font * f(1.1)));
  });
  const cx = f(left + width - 30), cy = f(top + f(height * 0.5));
  context.beginPath();
  context.arc(cx, cy, 22, -1.5707963705062866, -7.853981677685873, true);
  context.setFillRgb(51, 51, 51);
  context.fill();
  const progress = state.zoneCountdownProgress ?? f((state.zoneProgress ?? 0) * 0.003922);
  context.beginPath();
  context.arc(cx, cy, 18, -1.5707963705062866, progress * -6.283185307179586 - 1.5707963705062866, true);
  context.lineTo(cx, cy);
  context.closePath();
  context.setFillRgb(170, 51, 51);
  context.fill();
  context.restore();
}
export function drawHudLayer(context: HudContext, state: HudState, layout: HudLayout, clear = true): void {
  const raster = f(layout.scale * 2.4);
  if (clear) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    // resizeCanvas and clearCanvas both clear in the archived source.
    for (let pass = 0; pass < 2; pass++) {
      context.clearRect(0, 0, Math.round(layout.width * (state.pixelRatio ?? 1)), Math.round(layout.height * (state.pixelRatio ?? 1)));
      context.setGlobalCompositeOperation('source-over');
    }
  }
  context.save();
  baseTransform(context, layout);
  drawLabelBox(context, { text: 'florr.io', font: 32, rasterScale: raster }, 15, 15, f(measureLabel('florr.io', 32) + 14), f(32 * 1.4), false);
  // The HUD stays alive while the death overlay rises: the level
  // bar recedes left, the map and flower panel recede right, and the hotbar
  // (with its hint) drops by 400 logical units. The inventory closes.
  const slide = state.death ? state.hudSlide ?? 0 : 0;
  const shifted = slide > 0 ? {
    ...layout,
    logicalHeight: f(layout.logicalHeight + slide),
    equippedY: f(layout.equippedY + slide),
    storageY: f(layout.storageY + slide),
  } : layout;
  drawMap(context, state, layout, raster, slide);
  drawLevelBar(context, state, layout, raster, slide);
  drawHint(context, state, shifted, raster);
  drawHotbar(context, state, shifted, raster);
  if (!state.death)
    drawInventory(context, state, layout, raster);
  drawChat(context, state, layout, raster);
  drawZoneWarning(context, state, layout, raster);
  context.restore();
}
/** Native menu's second clear of renderer7926712, followed by its HUD/death
* branch. That renderer retains identity, independently of the main UI scale;
* only the logo layer uses the UI scale. amount is persistent presentation
* state advanced by the menu owner only while world metadata is available.
*/
export function drawMenuPreviewHud(native: Canvas2DContext, frame: MenuPreviewFrame, amount: number, playerState?: HudState): void {
  native.clearRect(0, 0, 1, 1);
  native.setGlobalCompositeOperation?.('source-over');
  const context = hudRenderer(native);
  const layout = getHudLayout(frame.width, frame.height);
  const ratio = frame.pixelRatio;
  context.save();
  const surface = getHudSurface(1, 1);
  if (surface) {
    const logo = surface.context;
    for (let pass = 0; pass < 2; pass++) {
      logo.setTransform(1, 0, 0, 1, 0, 0);
      logo.clearRect(0, 0, 1, 1);
      logo.setGlobalCompositeOperation('source-over');
    }
    if (playerState) {
      drawHudLayer(logo, playerState, ratio === 1 ? layout : { ...layout, scale: f(layout.scale * ratio) }, false);
    }
    else {
      logo.save();
      baseTransform(logo, layout, ratio);
      drawLabelBox(logo, { text: 'florr.io', font: 32, rasterScale: f(f(layout.scale * ratio) * 2.4) }, 15, 15, f(measureLabel('florr.io', 32) + 14), f(32 * 1.4), false);
      logo.restore();
    }
    context.save();
    context.setGlobalAlpha(0.85);
    context.drawImage(surface.canvas, 0, 0);
    context.restore();
  }
  // func1095 uses the unscaled offscreen renderer for the remaining HUD.
  const hidden = { ...layout, scale: ratio };
  drawFlowerPanel(context, playerState ?? { health: 0, maxHealth: 100, level: 1, flowers: 0, flowerEntries: [] }, hidden, 1);
  if (playerState) {
    context.restore();
    return;
  }
  context.save();
  context.setFillRgb(0, 0, 0);
  context.setGlobalAlpha(amount * 0.25);
  unitRect(context, ratio, 0, 0, layout.logicalWidth, layout.logicalHeight);
  context.setGlobalAlpha(1);
  const x = Math.trunc(layout.logicalWidth / 2);
  const offset = f(f(1 - amount) * layout.logicalHeight);
  const y = f(Math.trunc(layout.logicalHeight / 2) - offset);
  // Empty retained-petal groups still submit their state scopes.
  context.save();
  context.restore();
  context.save();
  const cosine = f(Math.cos(-0.2)), sine = f(Math.sin(-0.2));
  context.setTransform(f(ratio * f(1.5 * cosine)), f(ratio * f(1.5 * sine)), f(ratio * f(-1.5 * sine)), f(ratio * f(1.5 * cosine)), f(ratio * x), f(ratio * y));
  drawPlayerFace(context, { dead: true });
  context.restore();
  context.save();
  context.restore();
  context.setTransform(ratio, 0, 0, ratio, f(ratio * x), f(ratio * y));
  const raster = f(ratio * 2.4);
  label(context, 'You were destroyed by:', 18, raster, 0, -120);
  label(context, 'A mysterious entity', 24, raster, 0, -90);
  label(context, '(press enter to continue)', 18, raster, 0, 90);
  context.setTransform(ratio, 0, 0, ratio, 0, f(ratio * offset));
  for (const [text, font, top] of [['Stats', 24, layout.logicalHeight - 160],
    ['Points: 0', 16, layout.logicalHeight - 126], ['Level: 0', 16, layout.logicalHeight - 104]] as const) {
    // Stats labels are left/top aligned, unlike drawTextLabel's centering.
    drawLabelBox(context, { text, font, rasterScale: raster }, 20, top, f(measureLabel(text, font) + Math.trunc(f(f(font * 0.12) * 2)) * 2), f(font * 1.4), false);
  }
  context.restore();
  context.restore();
}
/** Draw the menu or the complete HUD; explicit state determines all animation. */
export function drawHud(native: Canvas2DContext, state: HudState): void {
  const ratio = Number.isFinite(state.pixelRatio) && state.pixelRatio! > 0 ? state.pixelRatio! : 1;
  state = { ...state, pixelRatio: ratio };
  const layout = getHudLayout(state.width, state.height, state.level, state.mobile, state.uiScale);
  if (state.menu) {
    drawMenu(native, layout.width, layout.height, state.status ?? '', ratio, state.animationTime ?? 0, state.menuSeed, state.menuPreview, state.menuPreviewState, state.interactiveMenu, state.petalDiscoveries ?? 0, state.menuState, state.menuPetalTypes, state.menuRespawn, state.separateMenuInput ? false : undefined);
    return;
  }
  const context = hudRenderer(native);
  context.save();
  context.save();
  const surface = getHudSurface(Math.round(layout.width * ratio), Math.round(layout.height * ratio));
  if (surface) {
    // HUD geometry is in CSS pixels; the offscreen pass receives its own DPR.
    const scaled = ratio === 1 ? layout : { ...layout, scale: f(layout.scale * ratio) };
    drawHudLayer(surface.context, state, scaled);
    context.save();
    context.setGlobalAlpha(0.85);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(surface.canvas, 0, 0);
    context.restore();
  }
  else {
    context.setGlobalAlpha(0.85);
    drawHudLayer(context, state, ratio === 1 ? layout : { ...layout, scale: f(layout.scale * ratio) }, false);
    context.setGlobalAlpha(1);
  }
  drawFlowerPanel(context, state, layout, ratio, state.death ? state.hudSlide ?? 0 : 0);
  if (!state.death)
    drawHotbarTooltip(context, state, layout, ratio);
  if (state.death || state.deathState)
    drawDeathOverlay(context, state, layout, ratio);
  context.restore();
  context.restore();
}
