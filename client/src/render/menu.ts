/** Native clientFrame menu: preview world/HUD, then floating petals and UI.
 * Layout and pass ownership follow the menu animation; tests verify it.
 */
import type { Canvas2DContext } from './canvas2d/context.js';
import { createRasterCanvas, getRasterContext, drawLabel } from './canvas2d/text-cache.js';
import { wrapContext } from './canvas2d/context.js';
import { hudRenderer, drawMenuPreviewHud } from './hud.js';
import type { HudState } from './hud.js';
import { MenuAnimation, menuSeed, caretAlpha, type MenuInputPresentation } from './menu-animation.js';
import { PETAL_INFO } from '../schema/petals.js';
import { drawPetalCard, drawPetalInstance } from './entity-art.js';
import { drawMenuPanels } from './menu-panels.js';
import { PETAL_GALLERY_TYPES, petalCellRect, mobDropRect, menuPanelRect,
  menuRespawnCardAnchor, MENU_RESPAWN_CARD_SIZE, MENU_RESPAWN_TOOLTIP_Y, type MenuRenderState } from './menu-layout.js';
import { MOB_GALLERY } from '../schema/mob-gallery.js';
import { drawPetalTooltipAt } from './tooltip.js';

const f = Math.fround;

export interface MenuPreviewFrame {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  readonly nowMilliseconds: number;
  /** Native menu camera projection, before player zoom/follow. */
  readonly cameraX: number;
  readonly cameraY: number;
  readonly zoom: number;
}
export type MenuPreviewPass = (context: Canvas2DContext, frame: MenuPreviewFrame) => void | boolean;

let animation: MenuAnimation | undefined;

/** Rounded UI tab with a 5-unit corner radius. */
function tabPath(context: Canvas2DContext, left: number, right: number, top: number, bottom: number): void {
  context.beginPath();
  context.moveTo(left + 5, top);
  context.lineTo(right - 5, top);
  context.quadraticCurveTo(right, top, right, top + 5);
  context.lineTo(right, bottom - 5);
  context.quadraticCurveTo(right, bottom, right - 5, bottom);
  context.lineTo(left + 5, bottom);
  context.quadraticCurveTo(left, bottom, left, bottom - 5);
  context.lineTo(left, top + 5);
  context.quadraticCurveTo(left, top, left + 5, top);
  context.closePath();
}

let preview: { context: Canvas2DContext } | undefined;
const previewStates = new WeakMap<Canvas2DContext, { at: number; amount: number }>();
function previewContext(): Canvas2DContext | undefined {
  if (preview) return preview.context;
  const canvas = createRasterCanvas(1, 1);
  const native = canvas && getRasterContext(canvas);
  if (!native) return undefined;
  preview = { context: wrapContext(native) };
  return preview.context;
}
/** The menu branch. The world callback owns the native
 * world pass, including its composite and balanced saves. It receives the
 * cleared 1x1 renderer; viewport dimensions remain those of the main canvas.
 * Main canvas identity/clear belongs to the frame owner, as for gameplay.
 */
export function drawMenu(native: Canvas2DContext, width: number, height: number,
                         status: string, pixelRatio = 1, now = 0, seed?: number,
                         worldPass?: MenuPreviewPass, previewState?: HudState, interactive = false,
                         petalDiscoveries = 0, menuState?: MenuRenderState,
                         petalTypes?: readonly number[],
                         respawn?: { readonly level: number; readonly items: readonly number[] },
                         input?: MenuInputPresentation | false): void {
  const scale = f(Math.max(0.7, f(Math.max(width * 0.000521, height * 0.000926))));
  const ui = f(scale * pixelRatio), raster = f(ui * 2.4);
  const w = Math.ceil(f(width / scale)), h = Math.ceil(f(height / scale));
  const context = hudRenderer(native);
  context.setGlobalCompositeOperation('source-over');
  context.setFillRgb(30, 167, 97);
  context.setTransform(f(width * pixelRatio), 0, 0, f(height * pixelRatio), 0, 0);
  context.fillRect(0, 0, 1, 1);
  const offscreen = previewContext();
  const frame: MenuPreviewFrame = { width, height, pixelRatio, nowMilliseconds: now,
    cameraX: 0, cameraY: 0, zoom: f(Math.max(width / 1920, height / 1080)) };
  let ready = false;
  if (offscreen) {
    offscreen.clearRect(0, 0, 1, 1);
    ready = worldPass?.(offscreen, frame) !== false && worldPass !== undefined;
  }
  context.save();
  let presentation = previewStates.get(native);
  if (!presentation || now < presentation.at) presentation = { at: 0, amount: 0 };
  const delta = f(Math.max(0, now - presentation.at));
  presentation.at = now;
  if (offscreen && ready) {
    presentation.amount = f(presentation.amount + (1 - presentation.amount) * Math.max(0, Math.min(1, 1 - Math.pow(0.95, delta * 0.06))));
    drawMenuPreviewHud(offscreen, frame, presentation.amount, previewState);
  }
  previewStates.set(native, presentation);
  context.save(); context.save();
  context.setFillRgb(30, 167, 97);
  context.setTransform(f(ui * w), 0, 0, f(ui * h), 0, 0);
  context.fillRect(0, 0, 1, 1);

  if (animation === undefined || (seed !== undefined && animation.seed !== seed))
    animation = new MenuAnimation(seed ?? menuSeed());
  animation.setPetals(petalTypes ?? [1]);
  for (const { scale: flowerScale, x, y, type } of animation.sample(now, width, height)) {
    if (type === 1) {
      context.save(); context.beginPath();
      context.setTransform(f(flowerScale * pixelRatio), 0, 0, f(flowerScale * pixelRatio), f(x * pixelRatio), f(y * pixelRatio));
      context.arc(0, 0, 10, 0, Math.PI * 2);
      context.setFillRgb(255, 255, 255); context.setStrokeRgb(207, 207, 207); context.setLineWidth(3);
      context.fill(); context.stroke(); context.restore();
    } else {
      context.save();
      context.setTransform(f(flowerScale * pixelRatio), 0, 0, f(flowerScale * pixelRatio), f(x * pixelRatio), f(y * pixelRatio));
      // The original menu owns one catalogue visual per floating object.
      // Slot multiplicity belongs to cards; Peas' cluster is one visual.
      drawPetalInstance(context, type);
      context.restore();
    }
  }
  const base = (): void => context.setTransform(ui, 0, 0, ui, 0, 0);
  const label = (text: string, font: number, x: number, y: number, centered = true): void => {
    drawLabel(context, { text, font, rasterScale: raster }, x,
      centered ? y : f(y + f(f(font * 1.4) * 0.5)), 1, false);
  };
  base();
  const centerX = Math.trunc(w / 2);
  if (respawn) {
    // Original menu respawn block: centered under the name input. The item
    // row uses the same 60-unit cards and 70-unit pitch as the galleries.
    const items = respawn.items.filter(type => PETAL_INFO[type]);
    // String 23467 ("... with:") is selected only when the survivor count is
    // nonzero; otherwise the original draws 18891 ("...at level %d").
    const survivors = items.length > 0 ? ' with:' : '';
    label(`You will respawn at level ${respawn.level}${survivors}`,
      16, centerX, f(h / 2 + 65.7));
    for (const [index, type] of items.entries()) {
      const anchor = menuRespawnCardAnchor(index, items.length, w, h);
      context.save();
      context.setTransform(ui, 0, 0, ui, f(ui * anchor.x), f(ui * anchor.y));
      drawPetalCard(context, type, MENU_RESPAWN_CARD_SIZE, `menu-respawn:${type}`);
      context.restore();
    }
  } else {
    let howY = Math.trunc(h / 2) + 100;
    label('How to play', 30, centerX, howY);
    howY = f(howY + f(30 * 1.4)); label('Use mouse to move', 16, centerX, howY);
    howY = f(howY + f(16 * 1.4)); label('Left click to attack', 16, centerX, howY);
    howY = f(howY + f(16 * 1.4)); label('Right click to defend', 16, centerX, howY);
  }
  label('florr.io', 80, centerX, Math.trunc(h / 4));

  // Connecting warning remains a submitted bitmap even at zero opacity.
  base(); context.save(); context.setGlobalAlpha(0);
  label('Connecting...', 48, f(w * 0.5), -200); context.restore();
  if (input !== false) paintMenuInput(context, width, height, status, pixelRatio, now, interactive, input);

  base();
  context.setLineJoin('round');
  for (const [text, left, right, textX] of [
    ['Settings', 10, 110, 60], ['Petals', 120, 220, 160], ['Mobs', 230, 330, 280], ['Changelog', 340, 460, 400],
  ] as const) {
    context.setLineWidth(5); tabPath(context, left, right, h - 45, h - 10);
    const active = menuState?.panel === text;
    context.setFillRgb(active ? 81 : 90, active ? 143 : 159, active ? 197 : 219);
    context.fill(); context.setStrokeRgb(73, 129, 177); context.stroke();
    label(text, 16, textX, f(h - 27.5));
    if (text === 'Petals') {
      const total = Object.keys(PETAL_INFO).filter(type => Number(type) > 0).length || 1;
      const proportion = Math.max(0, Math.min(1, petalDiscoveries / total));
      context.beginPath(); context.arc(203, f(h - 27.5), 10, -Math.PI / 2, Math.PI * 1.5);
      context.setFillRgb(45, 79, 109); context.fill();
      context.beginPath(); context.arc(203, f(h - 27.5), 8, -Math.PI / 2,
        f(-Math.PI / 2 + proportion * Math.PI * 2));
      context.lineTo(203, f(h - 27.5)); context.closePath();
      context.setFillRgb(172, 207, 237); context.fill();
    }
  }
  if (menuState) { drawMenuPanels(context, menuState, h, raster); base(); }
  else for (let panel = 0; panel < 4; panel++) { context.save(); context.restore(); }
  context.restore(); context.restore(); context.restore();
  const tooltips = menuState?.petalTooltips ?? (menuState?.hoveredPetal ? [{ type: menuState.hoveredPetal, alpha: 1 }] : []);
  for (const tooltip of tooltips) {
    if (menuState?.panel !== 'Petals' || tooltip.alpha <= 0) continue;
    context.save();
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const cell = petalCellRect(PETAL_GALLERY_TYPES.indexOf(tooltip.type), h, menuState.panelAlphas?.Petals ?? 1);
    drawPetalTooltipAt(context, tooltip.type, (cell.x + cell.width / 2) * scale,
      (cell.y - menuState.scroll.Petals + cell.height / 2 - 40) * scale,
      width, height, scale, pixelRatio, tooltip.alpha);
    context.restore();
  }
  for (const tooltip of menuState?.mobDropTooltips ?? []) {
    if (menuState?.panel !== 'Mobs' || tooltip.alpha <= 0) continue;
    const drop = MOB_GALLERY[tooltip.mob]?.drops[tooltip.index];
    if (!drop || !menuState.discoveries.includes(drop.petalTypeId)) continue;
    const cell = mobDropRect(tooltip.mob, tooltip.index, h, menuState.mobs);
    const offset = menuPanelRect('Mobs', h, menuState.panelAlphas?.Mobs ?? 1).y - menuPanelRect('Mobs', h).y;
    context.save(); context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawPetalTooltipAt(context, drop.petalTypeId, (cell.x + 24.5) * scale,
      (cell.y + 24.5 - 28 - menuState.scroll.Mobs + offset) * scale,
      width, height, scale, pixelRatio, tooltip.alpha);
    context.restore();
  }
}

/** Survivor-card tooltips belong to the menu's final queue, after the input
 * pass; they are not part of drawMenu's panel layer. */
export function drawMenuRespawnTooltips(native: Canvas2DContext, width: number, height: number,
                                        pixelRatio: number,
                                        respawn: { readonly level: number; readonly items: readonly number[] } | undefined,
                                        menuState: MenuRenderState | undefined): void {
  if (!respawn || !menuState?.respawnTooltips?.length) return;
  const items = respawn.items.filter(type => PETAL_INFO[type]);
  if (!items.length) return;
  const scale = f(Math.max(0.7, f(Math.max(width * 0.000521, height * 0.000926))));
  const w = Math.ceil(f(width / scale)), h = Math.ceil(f(height / scale));
  const context = hudRenderer(native);
  context.save();
  for (const tooltip of menuState.respawnTooltips) {
    if (tooltip.alpha <= 0.0001 || tooltip.index < 0 || tooltip.index >= items.length) continue;
    const type = items[tooltip.index];
    if (type !== tooltip.type) continue;
    const anchor = menuRespawnCardAnchor(tooltip.index, items.length, w, h);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawPetalTooltipAt(context, type, anchor.x * scale,
      f(anchor.y + MENU_RESPAWN_TOOLTIP_Y) * scale,
      width, height, scale, pixelRatio, tooltip.alpha);
  }
  context.restore();
}

/** Kept separate from the captured menu iris so the input can continue its
 * native upward motion over gameplay, and descend on returning to the menu. */
export function drawMenuInput(native: Canvas2DContext, width: number, height: number,
                              status: string, pixelRatio = 1, now = 0, interactive = false,
                              presentation?: MenuInputPresentation): void {
  paintMenuInput(hudRenderer(native), width, height, status, pixelRatio, now, interactive, presentation);
}

function paintMenuInput(context: ReturnType<typeof hudRenderer>, width: number, height: number,
                        status: string, pixelRatio: number, now: number, interactive: boolean,
                        presentation?: MenuInputPresentation): void {
  const scale = f(Math.max(0.7, f(Math.max(width * 0.000521, height * 0.000926))));
  const ui = f(scale * pixelRatio), raster = f(ui * 2.4);
  const w = Math.ceil(f(width / scale)), h = Math.ceil(f(height / scale));
  const opacity = presentation?.opacity ?? 1;
  const shift = f(ui * (presentation?.offsetY ?? 0));
  const base = (): void => context.setTransform(ui, 0, 0, ui, 0, shift);
  const label = (text: string, font: number, x: number, y: number): void => {
    drawLabel(context, { text, font, rasterScale: raster }, x,
      f(y + f(f(font * 1.4) * 0.5)), 1, false);
  };
  context.save(); context.setGlobalAlpha(opacity); base();
  const inputCenterX = f(w * 0.5), inputY = presentation?.inputY ?? Math.trunc(h / 4) + 200;
  label('This pretty little flower is called...', 20, inputCenterX, f(inputY + f(20 * -1.4) * 1.1));
  label(/error|unavailable|timeout|failed|closed|refused/i.test(status) ? status : '(press enter to spawn)',
    14, inputCenterX, inputY + 55);
  const left = f(inputCenterX - 200);
  context.save(); context.setLineJoin('round'); context.setFillRgb(238, 238, 238);
  context.setTransform(f(ui * 400), 0, 0, f(ui * 50), f(ui * left), f(f(ui * inputY) + shift)); context.fillRect(0, 0, 1, 1);
  context.setStrokeRgb(0, 0, 0); context.setLineWidth(5);
  context.setTransform(ui, 0, 0, ui, f(ui * left), f(f(ui * inputY) + shift)); context.strokeRect(0, 0, 400, 50);
  context.save(); context.setLineCap('square'); context.beginPath(); base();
  context.rect(f(left + 5), inputY + 5, 390, 40); context.clip(); context.restore();
  context.save(); context.setGlobalAlpha(interactive ? 0 : opacity * caretAlpha(now)); context.beginPath();
  context.setTransform(ui, 0, 0, ui, f(ui * f(left + 5)), f(f(ui * (inputY + 5)) + shift));
  context.moveTo(0, 4); context.lineTo(0, 36); context.setLineWidth(3); context.setStrokeRgb(0, 0, 0); context.stroke();
  context.setLineWidth(2); context.setStrokeRgb(255, 255, 255); context.stroke();
  context.restore(); context.restore(); context.restore();
}
