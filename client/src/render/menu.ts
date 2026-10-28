/** Native clientFrame menu: preview world/HUD, then floating petals and UI.
 * Layout and pass ownership follow original func1095; traces only verify it.
 */
import type { Canvas2DContext } from './canvas2d/context.js';
import { createRasterCanvas, getRasterContext, drawLabel } from './canvas2d/text-cache.js';
import { wrapContext } from './canvas2d/context.js';
import { hudRenderer, drawMenuPreviewHud } from './hud.js';
import type { HudState } from './hud.js';
import { MenuAnimation, menuSeed, caretAlpha } from './menu-animation.js';
import { PETAL_INFO } from '../schema/petals.js';
import { drawPetalCard, drawPetalIcon } from './entity-art.js';
import { drawMenuPanels } from './menu-panels.js';
import { PETAL_GALLERY_TYPES, petalCellRect, mobDropRect, menuPanelRect, type MenuRenderState } from './menu-layout.js';
import { MOB_GALLERY } from '../schema/mob-gallery.js';
import { drawPetalTooltipAt } from './tooltip.js';

const f = Math.fround;

type PathOp = readonly [string, ...number[]];
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

/** Discord's two eyes, filled before the bubble. */
const DISCORD_EYES: readonly PathOp[] = [
  ['moveTo', 104.4, 103.9],
  ['bezierCurveTo', 98.7, 103.9, 94.2, 108.9, 94.2, 115],
  ['bezierCurveTo', 94.2, 121.1, 98.8, 126.1, 104.4, 126.1],
  ['bezierCurveTo', 110.1, 126.1, 114.6, 121.1, 114.6, 115],
  ['bezierCurveTo', 114.7, 108.9, 110.1, 103.9, 104.4, 103.9],
  ['closePath'],
  ['moveTo', 140.9, 103.9],
  ['bezierCurveTo', 135.2, 103.9, 130.7, 108.9, 130.7, 115],
  ['bezierCurveTo', 130.7, 121.1, 135.3, 126.1, 140.9, 126.1],
  ['bezierCurveTo', 146.6, 126.1, 151.1, 121.1, 151.1, 115],
  ['bezierCurveTo', 151.1, 108.9, 146.6, 103.9, 140.9, 103.9],
  ['closePath'],
];

/** Discord's speech bubble with the face cut out by the inner contour. */
const DISCORD_BUBBLE: readonly PathOp[] = [
  ['moveTo', 189.5, 20],
  ['lineTo', 55.5, 20],
  ['bezierCurveTo', 44.2, 20, 35, 29.2, 35, 40.6],
  ['lineTo', 35, 175.8],
  ['bezierCurveTo', 35, 187.2, 44.2, 196.4, 55.5, 196.4],
  ['lineTo', 168.9, 196.4],
  ['lineTo', 163.6, 177.9],
  ['lineTo', 176.4, 189.8],
  ['lineTo', 188.5, 201],
  ['lineTo', 210, 220],
  ['lineTo', 210, 40.6],
  ['bezierCurveTo', 210, 29.2, 200.8, 20, 189.5, 20],
  ['closePath'],
  ['moveTo', 150.9, 150.6],
  ['bezierCurveTo', 150.9, 150.6, 147.3, 146.3, 144.3, 142.5],
  ['bezierCurveTo', 157.4, 138.8, 162.4, 130.6, 162.4, 130.6],
  ['bezierCurveTo', 158.3, 133.3, 154.4, 135.2, 150.9, 136.5],
  ['bezierCurveTo', 145.9, 138.6, 141.1, 140, 136.4, 140.8],
  ['bezierCurveTo', 126.8, 142.6, 118, 142.1, 110.5, 140.7],
  ['bezierCurveTo', 104.8, 139.6, 99.9, 138, 95.8, 136.4],
  ['bezierCurveTo', 93.5, 135.5, 91, 134.4, 88.5, 133],
  ['bezierCurveTo', 88.2, 132.8, 87.9, 132.7, 87.6, 132.5],
  ['bezierCurveTo', 87.4, 132.4, 87.3, 132.3, 87.2, 132.2],
  ['bezierCurveTo', 85.4, 131.2, 84.4, 130.5, 84.4, 130.5],
  ['bezierCurveTo', 84.4, 130.5, 89.2, 138.5, 101.9, 142.3],
  ['bezierCurveTo', 98.9, 146.1, 95.2, 150.6, 95.2, 150.6],
  ['bezierCurveTo', 73.1, 149.9, 64.7, 135.4, 64.7, 135.4],
  ['bezierCurveTo', 64.7, 103.2, 79.1, 77.1, 79.1, 77.1],
  ['bezierCurveTo', 93.5, 66.3, 107.2, 66.6, 107.2, 66.6],
  ['lineTo', 108.2, 67.8],
  ['bezierCurveTo', 90.2, 73, 81.9, 80.9, 81.9, 80.9],
  ['bezierCurveTo', 81.9, 80.9, 84.1, 79.7, 87.8, 78],
  ['bezierCurveTo', 98.5, 73.3, 107, 72, 110.5, 71.7],
  ['bezierCurveTo', 111.1, 71.6, 111.6, 71.5, 112.2, 71.5],
  ['bezierCurveTo', 118.3, 70.7, 125.2, 70.5, 132.4, 71.3],
  ['bezierCurveTo', 141.9, 72.4, 152.1, 75.2, 162.5, 80.9],
  ['bezierCurveTo', 162.5, 80.9, 154.6, 73.4, 137.6, 68.2],
  ['lineTo', 139, 66.6],
  ['bezierCurveTo', 139, 66.6, 152.7, 66.3, 167.1, 77.1],
  ['bezierCurveTo', 167.1, 77.1, 181.5, 103.2, 181.5, 135.4],
  ['bezierCurveTo', 181.5, 135.4, 173, 149.9, 150.9, 150.6],
  ['closePath'],
];

/** Reddit's alien glyph (24 x 22). */
const REDDIT_ALIEN: readonly PathOp[] = [
  ['moveTo', 24, 11.779],
  ['bezierCurveTo', 24, 10.32, 22.808, 9.134, 21.343, 9.134],
  ['bezierCurveTo', 20.628, 9.134, 19.98, 9.42, 19.503, 9.88],
  ['bezierCurveTo', 17.693, 8.689, 15.244, 7.931, 12.532, 7.834],
  ['lineTo', 14.015, 3.165],
  ['lineTo', 18.031, 4.106],
  ['lineTo', 18.025, 4.164],
  ['bezierCurveTo', 18.025, 5.357, 19, 6.327, 20.199, 6.327],
  ['bezierCurveTo', 21.397, 6.327, 22.371, 5.357, 22.371, 4.164],
  ['bezierCurveTo', 22.371, 2.971, 21.396, 2, 20.199, 2],
  ['bezierCurveTo', 19.279, 2, 18.495, 2.574, 18.178, 3.379],
  ['lineTo', 13.849, 2.364],
  ['bezierCurveTo', 13.66, 2.318, 13.468, 2.427, 13.409, 2.613],
  ['lineTo', 11.755, 7.82],
  ['bezierCurveTo', 8.917, 7.854, 6.346, 8.618, 4.455, 9.845],
  ['bezierCurveTo', 3.981, 9.407, 3.352, 9.133, 2.656, 9.133],
  ['bezierCurveTo', 1.191, 9.133, 0, 10.32, 0, 11.779],
  ['bezierCurveTo', 0, 12.749, 0.533, 13.59, 1.317, 14.05],
  ['bezierCurveTo', 1.265, 14.332, 1.231, 14.617, 1.231, 14.907],
  ['bezierCurveTo', 1.231, 18.818, 6.039, 22, 11.95, 22],
  ['bezierCurveTo', 17.861, 22, 22.67, 18.818, 22.67, 14.907],
  ['bezierCurveTo', 22.67, 14.633, 22.641, 14.363, 22.595, 14.097],
  ['bezierCurveTo', 23.427, 13.65, 24, 12.785, 24, 11.779],
  ['closePath'],
  ['moveTo', 6.776, 13.595],
  ['bezierCurveTo', 6.776, 12.727, 7.486, 12.02, 8.358, 12.02],
  ['bezierCurveTo', 9.23, 12.02, 9.939, 12.727, 9.939, 13.595],
  ['bezierCurveTo', 9.939, 14.463, 9.23, 15.169, 8.358, 15.169],
  ['bezierCurveTo', 7.486, 15.169, 6.776, 14.463, 6.776, 13.595],
  ['closePath'],
  ['moveTo', 15.837, 18.264],
  ['bezierCurveTo', 15.04, 19.057, 13.789, 19.443, 12.013, 19.443],
  ['lineTo', 12, 19.44],
  ['lineTo', 11.987, 19.443],
  ['bezierCurveTo', 10.21, 19.443, 8.959, 19.057, 8.163, 18.264],
  ['bezierCurveTo', 8.018, 18.12, 8.018, 17.885, 8.163, 17.741],
  ['bezierCurveTo', 8.308, 17.596, 8.544, 17.596, 8.689, 17.741],
  ['bezierCurveTo', 9.339, 18.388, 10.418, 18.702, 11.987, 18.702],
  ['lineTo', 12, 18.705],
  ['lineTo', 12.013, 18.702],
  ['bezierCurveTo', 13.582, 18.702, 14.661, 18.387, 15.311, 17.74],
  ['bezierCurveTo', 15.456, 17.595, 15.692, 17.596, 15.837, 17.74],
  ['bezierCurveTo', 15.982, 17.885, 15.982, 18.119, 15.837, 18.264],
  ['closePath'],
  ['moveTo', 15.648, 15.169],
  ['bezierCurveTo', 14.776, 15.169, 14.067, 14.463, 14.067, 13.595],
  ['bezierCurveTo', 14.067, 12.727, 14.776, 12.02, 15.648, 12.02],
  ['bezierCurveTo', 16.52, 12.02, 17.229, 12.727, 17.229, 13.595],
  ['bezierCurveTo', 17.229, 14.463, 16.52, 15.169, 15.648, 15.169],
  ['closePath'],
];

function replayPath(context: Pick<Canvas2DContext, 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath'>,
                    ops: readonly PathOp[]): void {
  for (const op of ops) {
    const name = op[0];
    if (name === 'moveTo') context.moveTo(op[1], op[2]);
    else if (name === 'lineTo') context.lineTo(op[1], op[2]);
    else if (name === 'quadraticCurveTo') context.quadraticCurveTo(op[1], op[2], op[3], op[4]);
    else if (name === 'bezierCurveTo') context.bezierCurveTo(op[1], op[2], op[3], op[4], op[5], op[6]);
    else if (name === 'closePath') context.closePath();
  }
}

/** Rounded 80x80 social button path centred on the current transform origin. */
function roundedButton(context: Canvas2DContext): void {
  context.beginPath();
  context.moveTo(-35, -40);
  context.lineTo(35, -40);
  context.quadraticCurveTo(40, -40, 40, -35);
  context.lineTo(40, 35);
  context.quadraticCurveTo(40, 40, 35, 40);
  context.lineTo(-35, 40);
  context.quadraticCurveTo(-40, 40, -40, 35);
  context.lineTo(-40, -35);
  context.quadraticCurveTo(-40, -40, -35, -40);
  context.closePath();
}

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
let discordEyes: Path2D | undefined, discordBubble: Path2D | undefined;
function filledPath(context: Canvas2DContext, ops: readonly PathOp[], existing?: Path2D): Path2D | undefined {
  if (typeof Path2D !== 'undefined') {
    const path = existing ?? new Path2D();
    if (!existing) replayPath(path, ops);
    context.fill(path);
    return path;
  }
  context.beginPath(); replayPath(context, ops); context.fill();
  return undefined;
}

/** Original clientFrame's menu branch. The world callback owns the native
 * world pass, including its composite and balanced saves. It receives the
 * cleared 1x1 renderer; viewport dimensions remain those of the main canvas.
 * Main canvas identity/clear belongs to the frame owner, as for gameplay.
 */
export function drawMenu(native: Canvas2DContext, width: number, height: number,
                         status: string, pixelRatio = 1, now = 0, seed?: number,
                         worldPass?: MenuPreviewPass, previewState?: HudState, interactive = false,
                         petalDiscoveries = 0, menuState?: MenuRenderState,
                         petalTypes?: readonly number[],
                         respawn?: { readonly level: number; readonly items: readonly number[] }): void {
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
      drawPetalIcon(context, type);
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
    const pitch = 70, size = 60;
    let cardX = centerX - f((items.length - 1) * pitch / 2);
    for (const type of items) {
      context.save();
      context.setTransform(ui, 0, 0, ui, f(ui * cardX), f(ui * f(h / 2 + 114.5)));
      drawPetalCard(context, type, size, `menu-respawn:${type}`);
      context.restore();
      cardX = f(cardX + pitch);
    }
  } else {
    let howY = Math.trunc(h / 2) + 100;
    label('How to play', 30, centerX, howY);
    howY = f(howY + f(30 * 1.4)); label('Use mouse to move', 16, centerX, howY);
    howY = f(howY + f(16 * 1.4)); label('Left click to attack', 16, centerX, howY);
    howY = f(howY + f(16 * 1.4)); label('Right click to defend', 16, centerX, howY);
  }
  label('florr.io', 80, centerX, Math.trunc(h / 4));

  for (const discord of [true, false]) {
    context.save(); context.setLineJoin('round'); context.setLineWidth(5);
    context.setTransform(f(ui * 0.5), 0, 0, f(ui * 0.5), f(ui * (w - (discord ? 40 : 90))), f(ui * 40));
    roundedButton(context);
    context.setFillRgb(...(discord ? [114, 137, 218] : [255, 69, 0]) as [number, number, number]); context.fill();
    context.setStrokeRgb(...(discord ? [92, 111, 177] : [207, 56, 0]) as [number, number, number]); context.stroke();
    context.setFillRgb(255, 255, 255); context.save();
    if (discord) {
      context.setTransform(f(ui * 0.125), 0, 0, f(ui * 0.125),
        f(f(ui * (w - 40)) + f(f(ui * 0.5) * -30.625)), f(f(ui * 40) + f(f(ui * 0.5) * -30)));
      discordEyes = filledPath(context, DISCORD_EYES, discordEyes);
      discordBubble = filledPath(context, DISCORD_BUBBLE, discordBubble);
    } else {
      context.setTransform(ui, 0, 0, ui,
        f(f(ui * (w - 90)) + f(f(ui * 0.5) * -25)), f(f(ui * 40) + f(f(ui * 0.5) * -25)));
      filledPath(context, REDDIT_ALIEN);
    }
    context.restore(); context.restore();
  }
  // Connecting warning remains a submitted bitmap even at zero opacity.
  base(); context.save(); context.setGlobalAlpha(0);
  label('Connecting...', 48, f(w * 0.5), -200); context.restore();
  context.save(); context.setGlobalAlpha(1); base();
  const inputCenterX = f(w * 0.5), inputY = Math.trunc(h / 4) + 200;
  label('This pretty little flower is called...', 20, inputCenterX, f(inputY + f(20 * -1.4) * 1.1), false);
  label(/error|unavailable|timeout|failed|closed|refused/i.test(status) ? status : '(press enter to spawn)',
    14, inputCenterX, inputY + 55, false);
  const left = f(inputCenterX - 200);
  context.save(); context.setLineJoin('round'); context.setFillRgb(238, 238, 238);
  context.setTransform(f(ui * 400), 0, 0, f(ui * 50), f(ui * left), f(ui * inputY)); context.fillRect(0, 0, 1, 1);
  context.setStrokeRgb(0, 0, 0); context.setLineWidth(5);
  context.setTransform(ui, 0, 0, ui, f(ui * left), f(ui * inputY)); context.strokeRect(0, 0, 400, 50);
  context.save(); context.setLineCap('square'); context.beginPath(); base();
  context.rect(f(left + 5), inputY + 5, 390, 40); context.clip(); context.restore();
  context.save(); context.setGlobalAlpha(interactive ? 0 : caretAlpha(now)); context.beginPath();
  context.setTransform(ui, 0, 0, ui, f(ui * f(left + 5)), f(ui * (inputY + 5)));
  context.moveTo(0, 4); context.lineTo(0, 36); context.setLineWidth(3); context.setStrokeRgb(0, 0, 0); context.stroke();
  context.setLineWidth(2); context.setStrokeRgb(255, 255, 255); context.stroke();
  context.restore(); context.restore(); context.restore();

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
