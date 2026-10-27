/** State-driven port of the archived clientFrame HUD pass (func1095).
 * Geometry is expressed in the source's ceil(viewport / uiScale) space.
 * No recorded commands or scenario-specific geometry are used at runtime.
 */
import type { Canvas2DContext } from './canvas2d/context.js';
import { wrapContext } from './canvas2d/context.js';
import { canvasAvailable, createRasterCanvas, getRasterContext, drawLabel, drawLabelBox, measureLabel } from './canvas2d/text-cache.js';
import type { LabelSpec, RasterCanvas, RasterContext2D } from './canvas2d/text-cache.js';
import { PETAL_INFO } from '../schema/petals.js';
import { drawPetalTooltipAt } from './tooltip.js';
import { drawPetalInstance, drawPetalIcon, drawPlayerFace } from './entity-art.js';
import { drawMenu } from './menu.js';
import type { MenuPreviewPass, MenuPreviewFrame } from './menu.js';
import type { MenuRenderState } from './menu-layout.js';
import { drawEvent14Effect } from './event-effects.js';
import type { Event14Effect } from './event-effects.js';
import { advanceSlotRecharge } from '../state/loadout.js';
import { petalSlotAnchor, type PetalMotion } from './petal-motion.js';

export interface FlowerEntry {
  readonly name: string;
  /** Authoritative score; leaderboard order follows this value. */
  readonly score: number;
  readonly local?: boolean;
  /** Presentation value produced by createHudState, after native smoothing. */
  readonly displayedScore?: number;
}

/** Snapshot of the death notification; elapsed time is supplied by the caller,
 * so rendering a frame twice never advances or replays an event. */
export interface HudDeathState {
  readonly elapsedMilliseconds: number;
  readonly killerName?: string;
  readonly respawnLevel?: number;
  /** Last death score (controller field 21). */
  readonly score?: number;
  readonly keptSlots?: readonly number[];
}

export interface HudState {
  readonly health: number;
  readonly maxHealth: number;
  readonly level: number;
  readonly chat?: readonly string[];
  readonly pixelRatio?: number;
  /** CSS viewport dimensions; the backing canvas includes pixelRatio. */
  readonly width?: number;
  readonly height?: number;
  readonly uiScale?: number;
  readonly mobile?: boolean;
  /** Equipped slots first (5/6/7/8 by level), then eight storage slots. */
  readonly slots?: readonly number[];
  readonly storageSlots?: readonly number[];
  /** Normalized field61 targets (0..1) supplied to createHudState, which
   * returns retained displayed fractions. drawHud squares those fractions
   * for the source func587 radial wipe. */
  readonly slotProgress?: readonly number[];
  /** Caller owns receipt/update/retirement. Active visuals replace their
   * static slot content; departing visuals draw alongside current contents.
   * drawHud never advances these states or draws a second world overlay. */
  readonly slotEffects?: readonly Event14Effect[];
  readonly slotMotions?: readonly Readonly<PetalMotion>[];
  readonly selectedSlot?: number;
  readonly inventoryOpen?: boolean;
  readonly hoveredSlot?: number;
  readonly draggedSlot?: number;
  readonly keyboardSlot?: number;
  /** Fade 0..1 for the native [1]..[8]/[T] inventory hints. */
  readonly keyboardHint?: number;
  readonly deleteAlpha?: number;
  /** Smooth position of the keyboard selection ring, in CSS pixels. */
  readonly keyboardHighlightX?: number;
  readonly keyboardHighlightY?: number;
  readonly keyboardHighlightSize?: number;
  readonly keyboardHighlightAlpha?: number;
  readonly pointerX?: number;
  readonly pointerY?: number;
  /** 0..1 drag-lift animation for the floating hotbar petal. */
  readonly dragProgress?: number;
  readonly dragX?: number;
  readonly dragY?: number;
  readonly dragAngle?: number;
  readonly dragSize?: number;
  /** Slot currently under the dragged petal; suppresses the ghost so the
   * petal visibly snaps into that slot. */
  readonly dragTargetSlot?: number | 'discard';
  /** 0..1 expansion of the movement-safe-area hint. */
  readonly hintExpand?: number;
  readonly petalDiscoveries?: number;
  readonly keyboardMovement?: boolean;
  readonly movementDisabled?: boolean;
  readonly menu?: boolean;
  readonly interactiveMenu?: boolean;
  /** Native menu still renders its world into a 1x1 offscreen surface. */
  readonly menuPreview?: MenuPreviewPass;
  /** A player received during the last menu pass already owns its hidden HUD. */
  readonly menuPreviewState?: HudState;
  readonly death?: boolean;
  readonly deathState?: HudDeathState;
  readonly status?: string;
  readonly animationTime?: number;
  readonly menuSeed?: number;
  /** Death→menu line: level and the items shown under "with:". */
  readonly menuRespawn?: { readonly level: number; readonly items: readonly number[] };
  /** Canvas-native menu panel state and discovered-petal pool. */
  readonly menuState?: MenuRenderState;
  readonly menuPetalTypes?: readonly number[];
  /** Authoritative normalized XP progress from snapshot field 58. */
  readonly levelProgress?: number;
  readonly flowers?: number;
  readonly flowerEntries?: readonly FlowerEntry[];
  readonly playerName?: string;
  readonly score?: number;
  /** Optional native score field transition (120 ms), supplied by the
   * receiver. receivedAt must be the score field's clock, not any packet. */
  readonly scoreTransition?: { readonly previous: number; readonly receivedAt: number };
  /** Map marker: normalized arena X, or playerX + arenaWidth. */
  readonly mapPosition?: number;
  readonly playerX?: number;
  readonly arenaWidth?: number;
}

const f = Math.fround;
const TAU = Math.PI * 2;
const clamp = (value: number, min = 0, max = 1): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

export interface HudFrameState {
  /** Advance presentation once for this frame, then pass the returned state
   * to drawHud. Supply the actual frame delta on the first call; subsequent
   * calls can derive it from nowMilliseconds. Repeated timestamps do not tick. */
  update(target: HudState, nowMilliseconds: number, deltaMilliseconds?: number): HudState;
  reset(): void;
}

/** Per-HUD presentation memory from clientFrame (func1095).
 * WAT 322313–322360 stores XP at 156932; 329792–329850 stores scores by
 * leaderboard rank at 7931252. Both start at zero, use a double-precision
 * exponential with an f32 frame delta, snap within 1e-7, then store f32.
 * Drawing stays pure: callers explicitly advance this state once per frame.
 */
export function createHudState(): HudFrameState {
  let progress = 0;
  const scores: number[] = [];
  const recharges: number[] = [];
  const rechargeTypes: (number | undefined)[] = [];
  let lastTime: number | undefined;
  return {
    reset() { progress = 0; scores.length = 0; recharges.length = 0; rechargeTypes.length = 0; lastTime = undefined; },
    update(target, nowMilliseconds, deltaMilliseconds) {
      const now = Number.isFinite(nowMilliseconds) ? nowMilliseconds : lastTime ?? 0;
      const repeated = lastTime !== undefined && now <= lastTime;
      const elapsed = repeated ? 0 : deltaMilliseconds ?? (lastTime === undefined ? 0 : now - lastTime);
      const delta = f(Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0);
      const amount = clamp(1 - Math.pow(0.8, delta * 0.06));
      lastTime = Math.max(lastTime ?? now, now);
      if (target.menu) return target;
      const approach = (current: number, value: number): number =>
        repeated ? current : f(Math.abs(current - value) < 1e-7 ? value : current + amount * (value - current));
      if (target.levelProgress !== undefined) progress = approach(progress, f(clamp(target.levelProgress)));
      let score = target.score ?? 0;
      if (target.scoreTransition) {
        const previous = f(target.scoreTransition.previous);
        // clientFrame samples the receiver's local score transition before
        // casting it to uint32 for the leaderboard's second smoothing pass.
        score = f(previous + f(f(score) - previous)
          * clamp((now - target.scoreTransition.receivedAt) / 120));
      }
      const sampled = { ...target, score };
      const entries = flowerEntries(sampled).map((entry, index) => {
        const value = Number.isFinite(entry.score) ? Math.max(0, Math.min(0xffffffff, Math.trunc(entry.score))) : 0;
        const displayedScore = approach(scores[index] ?? 0, value);
        scores[index] = displayedScore;
        return { ...entry, displayedScore };
      });
      const slotProgress = target.slotProgress?.map((value, index) => {
        const type = target.slots?.[index];
        if (!repeated) {
          if (type !== rechargeTypes[index]) { recharges[index] = 1; rechargeTypes[index] = type; }
          recharges[index] = advanceSlotRecharge(recharges[index] ?? 1, value, delta);
        }
        return recharges[index] ?? 1;
      });
      return { ...target, levelProgress: progress, flowerEntries: entries, slotProgress };
    },
  };
}

export function equippedSlotCount(level = 1): number {
  return level < 15 ? 5 : level < 30 ? 6 : level < 45 ? 7 : 8;
}

export interface HudLayout {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly equippedCount: number;
  readonly equippedX: number;
  readonly equippedY: number;
  readonly storageX: number;
  readonly storageY: number;
}

/** Source clientFrame uses 0.000521 / 0.000926, a desktop 0.7 floor,
 * ceil() for UI bounds and integer division for row centering. */
export function getHudLayout(width = 1280, height = 720, level = 1,
                             mobile = false, uiScale?: number): HudLayout {
  const viewportWidth = Math.max(1, Number.isFinite(width) ? width : 1280);
  const viewportHeight = Math.max(1, Number.isFinite(height) ? height : 720);
  const auto = Math.min(viewportWidth * 0.000521, viewportHeight * 0.000926);
  const requestedScale = f(uiScale ?? NaN);
  const scale = Number.isFinite(requestedScale) && requestedScale > 0
    ? requestedScale : f(mobile ? auto : Math.max(0.7, auto));
  const logicalWidth = Math.ceil(f(viewportWidth / scale));
  const logicalHeight = Math.ceil(f(viewportHeight / scale));
  const equippedCount = equippedSlotCount(level);
  const center = Math.trunc(logicalWidth / 2);
  return {
    width: viewportWidth, height: viewportHeight, scale, logicalWidth, logicalHeight, equippedCount,
    equippedX: mobile ? 45 : center - (equippedCount * 70 + (equippedCount - 1) * 20) * 0.5 + 35,
    equippedY: logicalHeight - (mobile ? 110 : 145),
    storageX: mobile ? 35 : center - (8 * 15 + 9 * 50) * 0.5 + 25,
    storageY: logicalHeight - (mobile ? 35 : 70),
  };
}

type Matrix = readonly [number, number, number, number, number, number];
interface HudContext extends Canvas2DContext {
  getTransform(): readonly [number, number, number, number, number, number];
  setGlobalCompositeOperation(operation: GlobalCompositeOperation): void;
  stroke(path?: Path2D): void;
}

/** The native renderer keeps a logical f32 matrix and flushes only before an
 * operation that consumes it. Text blits restore that logical matrix without
 * emitting a native save/restore pair for every label (text.mjs func443).
 */
export function hudRenderer(native: Canvas2DContext): HudContext {
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  // The caller's native matrix can still be the world pass's cached matrix.
  let flushed: Matrix = [NaN, NaN, NaN, NaN, NaN, NaN];
  const states: { matrix: Matrix; flushed: Matrix }[] = [];
  const flush = (): void => {
    if (matrix.some((value, index) => value !== flushed[index])) {
      native.setTransform(...matrix);
      flushed = matrix;
    }
  };
  const context: HudContext = {
    save() { native.save(); states.push({ matrix, flushed }); },
    restore() {
      native.restore();
      const state = states.pop();
      if (state) { matrix = state.matrix; flushed = state.flushed; }
    },
    setTransform(a, b, c, d, e, g) { matrix = [f(a), f(b), f(c), f(d), f(e), f(g)]; },
    transform(a, b, c, d, x, y) {
      const [ma, mb, mc, md, mx, my] = matrix;
      matrix = [f(f(ma * a) + f(mc * b)), f(f(mb * a) + f(md * b)),
        f(f(ma * c) + f(mc * d)), f(f(mb * c) + f(md * d)),
        f(mx + f(f(ma * x) + f(mc * y))), f(my + f(f(mb * x) + f(md * y)))];
    },
    getTransform() { return matrix; },
    beginPath: () => native.beginPath(), closePath: () => native.closePath(),
    rect: (...args) => { flush(); native.rect(...args); },
    moveTo: (...args) => { flush(); native.moveTo(...args); },
    lineTo: (...args) => { flush(); native.lineTo(...args); },
    quadraticCurveTo: (...args) => { flush(); native.quadraticCurveTo(...args); },
    bezierCurveTo: (...args) => { flush(); native.bezierCurveTo(...args); },
    arc: (...args) => { flush(); native.arc(...args); },
    ellipse: (...args) => { flush(); native.ellipse(...args); },
    fill: path => { flush(); native.fill(path); },
    stroke: path => { flush(); (native as HudContext).stroke(path); },
    clip: () => { flush(); native.clip(); },
    fillRect: (...args) => { flush(); native.fillRect(...args); },
    strokeRect: (...args) => { flush(); native.strokeRect(...args); },
    clearRect: (...args) => { flush(); native.clearRect(...args); },
    setFillRgb: (...args) => native.setFillRgb(...args),
    setStrokeRgb: (...args) => native.setStrokeRgb(...args),
    setGlobalAlpha: alpha => native.setGlobalAlpha(alpha),
    setLineWidth: width => native.setLineWidth(width),
    setLineJoin: join => native.setLineJoin(join),
    setLineCap: cap => native.setLineCap(cap),
    setFont: font => native.setFont(font),
    fillText: (...args) => { flush(); native.fillText(...args); },
    strokeText: (...args) => { flush(); native.strokeText(...args); },
    measureText: text => native.measureText(text),
    drawImage: (image, ...args) => { flush(); native.drawImage(image, ...args); },
    setGlobalCompositeOperation(operation) {
      const setter = (native as Partial<HudContext>).setGlobalCompositeOperation;
      if (typeof setter === 'function') setter.call(native, operation);
    },
  };
  return context;
}

function roundedRect(context: Pick<Canvas2DContext, 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'closePath'>,
                     x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y); context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r); context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function baseTransform(context: Canvas2DContext, layout: HudLayout, ratio = 1,
                       x = 0, y = 0, zoom = 1): void {
  const scale = f(layout.scale * ratio);
  context.setTransform(f(scale * zoom), 0, 0, f(scale * zoom), f(scale * x), f(scale * y));
}

function label(context: Canvas2DContext, text: string, font: number, raster: number,
               x: number, y: number, scale = 1, style?: Partial<LabelSpec>): void {
  drawLabel(context, { text, font, rasterScale: raster, ...style }, x, y, scale, false);
}

function unitRect(context: Canvas2DContext, scale: number,
                  x: number, y: number, width: number, height: number): void {
  context.setTransform(f(scale * f(width)), 0, 0, f(scale * f(height)), f(scale * f(x)), f(scale * f(y)));
  context.fillRect(0, 0, 1, 1);
}

let mapBorder: Path2D | undefined;
function drawMap(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  const left = layout.logicalWidth - (state.mobile ? 350 : 300);
  const top = layout.logicalHeight - 120;
  context.save(); context.setLineCap('round'); context.setLineJoin('round'); context.save();
  const colors = [[30, 167, 97], [167, 167, 30], [167, 39, 30], [85, 85, 85]] as const;
  for (let index = 0; index < 4; index++) {
    const [red, green, blue] = colors[index];
    context.setFillRgb(red, green, blue);
    unitRect(context, layout.scale, left + index * 75, top,
      index === 2 ? 74.999985 : index === 3 ? 25.000006 : 75, 40);
  }
  baseTransform(context, layout, 1, left, top);
  for (const [text, center] of [['Easy', 37.5], ['Medium', 112.500008], ['Hard', 187.5], ['?', 237.5]] as const) {
    label(context, text, 14, raster, center, 20);
  }
  context.beginPath();
  const normalized = state.mapPosition ?? (state.playerX !== undefined && (state.arenaWidth ?? 0) > 0
    ? state.playerX / state.arenaWidth! + 0.5 : 0);
  context.arc(clamp(normalized) * 250 < 20 ? 20 : Math.min(230, clamp(normalized) * 250), 20, 15, 0, TAU);
  context.setFillRgb(255, 231, 99); context.setStrokeRgb(211, 189, 70); context.setLineWidth(4);
  context.fill(); context.stroke(); context.setLineWidth(5); context.setStrokeRgb(51, 51, 51);
  if (typeof Path2D !== 'undefined') {
    if (!mapBorder) { mapBorder = new Path2D(); roundedRect(mapBorder, 0, 0, 250, 40, 5); }
    context.stroke(mapBorder);
  } else { context.beginPath(); roundedRect(context, 0, 0, 250, 40, 5); context.stroke(); }
  context.restore(); baseTransform(context, layout);
  label(context, 'Map', 24, raster, left + 125, top - 15);
  context.restore();
}

function drawLevelBar(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  const progress = clamp(state.levelProgress ?? 0);
  const y = layout.logicalHeight - 110;
  context.save(); context.setLineCap('round'); context.beginPath(); baseTransform(context, layout);
  context.moveTo(0, y); context.lineTo(300, y); context.setLineWidth(40);
  context.setStrokeRgb(51, 51, 51); context.stroke();
  context.setGlobalAlpha(clamp(progress * 30)); context.setLineWidth(clamp(progress * 30) * 34);
  context.beginPath(); context.moveTo(0, y); context.lineTo(f(f(progress) * 300), y);
  context.setStrokeRgb(245, 255, 101); context.stroke(); context.setGlobalAlpha(1);
  label(context, `Lvl ${state.level} Flower`, 16, raster, 150, y);
  const next = state.level < 15 ? 15 : state.level < 30 ? 30 : state.level < 45 ? 45 : undefined;
  if (!state.mobile && next !== undefined) label(context, `Extra petal slot at level ${next}`, 14, raster, 150, y + 32);
  context.restore();
}

function drawHint(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  if (state.mobile || state.keyboardMovement) return;
  const center = Math.trunc(layout.logicalWidth / 2);
  const y = layout.logicalHeight;
  const amount = clamp(state.hintExpand ?? (state.movementDisabled ? 1 : 0));
  const width = 300 + 330 * amount;
  const height = 35 + 157 * amount;
  const radius = 10 + 10 * amount;
  const left = center - width / 2, right = center + width / 2, top = y - height;
  context.save(); context.setLineJoin('round'); context.setGlobalAlpha(0.5); context.setFillRgb(0, 0, 0);
  context.beginPath(); baseTransform(context, layout);
  if (amount <= 0.001) {
    // Keep the native small-pill path verbatim (including its redundant
    // bottom corner quadratics); the HUD trace pins every command.
    context.moveTo(center - 140, y - 35); context.lineTo(center + 140, y - 35);
    context.quadraticCurveTo(center + 150, y - 35, center + 150, y - 25);
    context.lineTo(center + 150, y); context.quadraticCurveTo(center + 150, y, center + 150, y);
    context.lineTo(center - 150, y); context.quadraticCurveTo(center - 150, y, center - 150, y);
    context.lineTo(center - 150, y - 25); context.quadraticCurveTo(center - 150, y - 35, center - 140, y - 35);
  } else {
    context.moveTo(left + radius, top); context.lineTo(right - radius, top);
    context.quadraticCurveTo(right, top, right, top + radius);
    context.lineTo(right, y); context.lineTo(left, y); context.lineTo(left, top + radius);
    context.quadraticCurveTo(left, top, left + radius, top);
  }
  context.closePath();
  context.fill(); context.setGlobalAlpha(1);
  context.setGlobalAlpha(1 - amount);
  label(context, 'Move mouse here to disable movement', 14, raster, center, y - 16);
  context.setGlobalAlpha(1); context.setGlobalAlpha(amount);
  label(context, 'You can also use [Q] and [E] to modify the inventory', 14, raster, center, y - 16);
  context.setGlobalAlpha(1);
  // The hotbar shares this save with the movement hint in clientFrame.
}

const RARITY_RGB: readonly (readonly [number, number, number])[] = Array.from({ length: 6 }, (_, rarity) => [
  Number(245047318478718n >> BigInt(rarity * 8) & 255n),
  Number(34218529646319n >> BigInt(rarity * 8) & 255n),
  Number(111187557834093n >> BigInt(rarity * 8) & 255n),
]);

function emptySlot(context: HudContext, layout: HudLayout, x: number, y: number, size: number,
                   discard = false): void {
  const line = f(size / 12);
  context.save(); context.setGlobalAlpha(0.8); context.setFillRgb(255, discard ? 119 : 255, discard ? 119 : 255);
  unitRect(context, layout.scale, f(x - size / 2 + line), f(y - size / 2 + line), f(size - f(line + line)), f(size - f(line + line)));
  context.beginPath(); baseTransform(context, layout);
  const side = f(size - line), half = f(side * 0.5);
  context.rect(f(x - half), f(y - half), side, side); context.setLineWidth(line);
  context.setStrokeRgb(207, discard ? 96 : 207, discard ? 96 : 207); context.stroke(); context.restore();
}

function filledSlot(context: HudContext, type: number, x: number, y: number, size: number,
                    layout: HudLayout, raster: number, progress = 1, owner?: string,
                    angle = 0): void {
  if (!type || !PETAL_INFO[type]) return;
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
      if (property === 'getTransform') return () => matrix;
      if (property === 'save') return () => { stack.push(matrix); target.save(); };
      if (property === 'restore') return () => { matrix = stack.pop() ?? matrix; target.restore(); };
      if (property === 'setTransform') return (a: number, b: number, c: number, d: number, e: number, g: number) => {
        matrix = [a, b, c, d, e, g];
        target.setTransform(f(cosine * a - sine * b), f(sine * a + cosine * b),
          f(cosine * c - sine * d), f(sine * c + cosine * d),
          f(cx + cosine * (e - cx) - sine * (g - cy)), f(cy + sine * (e - cx) + cosine * (g - cy)));
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    filledSlot(rotated, type, x, y, size, layout, raster, progress, owner);
    return;
  }
  context.save(); context.setGlobalAlpha(1); context.save(); context.save(); context.setFillRgb(...rgb);
  unitRect(context, layout.scale, f(x - half), f(y - half), side, side);
  const recharge = clamp(progress);
  const rechargeAngle = f(recharge * recharge * TAU);
  if (rechargeAngle < TAU * 0.99999) {
    // func587: rotating sector clipped before the border and petal art.
    context.save(); context.setGlobalAlpha(1); context.beginPath();
    baseTransform(context, layout, 1, x, y);
    context.moveTo(0, -5); context.arc(0, -5, size * 2, rechargeAngle * 5.7, rechargeAngle * 4.7 + TAU, false);
    context.clip(); context.setFillRgb(...rgb.map(value => Math.round(value * 0.64)) as [number, number, number]);
    const inner = f(size - f(f(size / 12) * 2));
    unitRect(context, layout.scale, f(x - inner / 2), f(y - inner / 2), inner, inner);
    context.restore();
  }
  context.beginPath(); baseTransform(context, layout, 1, x, y); context.rect(-half, -half, side, side);
  context.setLineWidth(f(size / 12)); context.setStrokeRgb(...rgb.map(value => Math.round(value * 0.81)) as [number, number, number]);
  context.stroke(); baseTransform(context, layout, 1, x, y - 5);
  drawPetalIcon(context, type, size / 70);
  context.restore(); context.setTransform(1, 0, 0, 1, 0, 0);
  // Petal labels are styled after applying the slot scale: their logical
  // font is already in screen pixels, unlike the other HUD labels.
  const font = f(f(14 * size / 70) * layout.scale);
  const logicalFont = f(14 * size / 70);
  const width = f(f(measureLabel(PETAL_INFO[type].name, logicalFont)
    + Math.trunc(f(logicalFont * 0.12) * 2) * 2) * layout.scale);
  const height = f(f(logicalFont * 1.4) * layout.scale);
  drawLabelBox(context, { text: PETAL_INFO[type].name, font, cacheKey: owner,
    rasterScale: raster / layout.scale * 0.8825833333333333 },
    f(f(layout.scale * x) - f(width * 0.5)),
    f(f(layout.scale * f(y + size * 17 / 70)) - f(height * 0.5)), width, height, false);
  context.restore();
  context.restore();
}

/** The source's equipped row and eight storage slots share a slot index, but
 * an explicit storage snapshot takes precedence over flattened slot data. */
function hotbarPetal(state: HudState, layout: HudLayout, slot: number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot >= layout.equippedCount + 8) return 0;
  if (slot < layout.equippedCount) return state.slots === undefined ? 1 : state.slots[slot] ?? 0;
  return state.storageSlots === undefined ? state.slots?.[slot] ?? 0
    : state.storageSlots[slot - layout.equippedCount] ?? 0;
}

function drawHotbar(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  const motions = new Map(state.slotMotions?.map(motion => [motion.slot, motion]));
  const drawSlot = (slot: number, x: number, y: number, size: number, progress = 1): void => {
    const motion = motions.get(slot);
    filledSlot(context, motion?.type ?? hotbarPetal(state, layout, slot), motion?.x ?? x,
      motion?.y ?? y, motion?.size ?? size, layout, raster, progress, `hotbar:${slot}`, motion?.angle ?? 0);
  };
  const effects = new Map<number, Event14Effect>();
  for (const effect of state.slotEffects ?? []) {
    if (effect.phase === 'arriving' || effect.phase === 'settled') effects.set(effect.index, effect);
  }
  // layout.scale already includes this HUD surface's DPR. Effect positions
  // remain in native logical units, so apply that scale exactly once.
  const effectViewport = { width: layout.width, height: layout.height, level: state.level,
    mobile: state.mobile, uiScale: layout.scale, pixelRatio: 1 };
  for (let index = 0; index < layout.equippedCount; index++) emptySlot(context, layout,
    layout.equippedX + index * 90, layout.equippedY, 70);
  for (let index = 0; index <= 8; index++) emptySlot(context, layout,
    layout.storageX + index * 65, layout.storageY, 50, index === 8);
  const draggedType = state.draggedSlot === undefined ? 0 : hotbarPetal(state, layout, state.draggedSlot);
  for (let index = 0; index < layout.equippedCount; index++) {
    if (state.draggedSlot === index && !state.slotMotions) continue;
    if (!state.slotMotions && state.dragTargetSlot === index && draggedType) {
      filledSlot(context, draggedType, layout.equippedX + index * 90,
        layout.equippedY, 70, layout, raster, 1, `drag-target:${index}`);
      continue;
    }
    const effect = effects.get(index);
    if (effect) { drawEvent14Effect(context, effect, effectViewport); continue; }
    if (state.slotMotions) continue;
    drawSlot(index, layout.equippedX + index * 90, layout.equippedY, 70, state.slotProgress?.[index] ?? 1);
  }
  for (let index = 0; index < 8; index++) {
    const slot = layout.equippedCount + index;
    if (state.draggedSlot === slot && !state.slotMotions) continue;
    if (!state.slotMotions && state.dragTargetSlot === slot && draggedType) {
      filledSlot(context, draggedType, layout.storageX + index * 65, layout.storageY, 50, layout, raster, 1, `drag-target:${slot}`);
      continue;
    }
    const effect = effects.get(slot);
    if (effect) { drawEvent14Effect(context, effect, effectViewport); continue; }
    if (state.slotMotions) continue;
    drawSlot(slot, layout.storageX + index * 65, layout.storageY, 50);
  }
  if (!state.slotMotions && state.dragTargetSlot === 'discard' && draggedType) {
    filledSlot(context, draggedType, layout.storageX + 8 * 65, layout.storageY, 50, layout, raster, 1, 'drag-target:discard');
  }
  for (const effect of state.slotEffects ?? []) {
    if (effect.phase === 'departing') drawEvent14Effect(context, effect, effectViewport);
  }
  const hint = clamp(state.keyboardHint ?? 0);
  if (hint > 0) {
    context.save(); baseTransform(context, layout); context.setGlobalAlpha(hint);
    for (let index = 0; index < layout.equippedCount; index++)
      label(context, `[${index + 1}]`, 14, raster, layout.equippedX + index * 90,
        layout.equippedY - 55 - (1 - hint) * 5);
    label(context, '[T]', 14, raster, layout.storageX + 8 * 65, layout.storageY - 55 - (1 - hint) * 5);
    context.setGlobalAlpha(1); context.restore();
  }
  const deleteAlpha = clamp(state.deleteAlpha ?? (state.draggedSlot !== undefined ? 1 : hint));
  if (deleteAlpha > 0.0001) {
    context.save(); baseTransform(context, layout); context.setGlobalAlpha(deleteAlpha);
    label(context, 'Delete', 11, raster, layout.storageX + 8 * 65, layout.storageY);
    context.restore();
  }
  // Native clientFrame draws ordinary cards, retired cards, then the retained
  // drag list. The Delete label belongs to the empty background pass.
  for (const motion of state.slotMotions ?? []) {
    if ((!motion.retired && effects.has(motion.slot)) || motion.opacity <= 0 || motion.size <= 0) continue;
    const inherited = context.getGlobalAlpha?.() ?? 1;
    const alpha = inherited * motion.opacity;
    const faded = new Proxy(context, { get(target, property) {
      if (property === 'setGlobalAlpha') return (value: number) => target.setGlobalAlpha(value * alpha);
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    filledSlot(faded, motion.type, motion.x, motion.y, motion.size, layout, raster,
      motion.retired ? 1 : state.slotProgress?.[motion.slot] ?? 1, `hotbar:${motion.slot}`, motion.angle);
  }
  if (!state.slotMotions && state.draggedSlot !== undefined && state.dragTargetSlot === undefined) {
    const type = hotbarPetal(state, layout, state.draggedSlot);
    const progress = clamp(state.dragProgress ?? 1);
    const lifted = state.dragSize ?? f(70 + 14 * (1 - Math.pow(1 - progress, 3)));
    const angle = state.dragAngle ?? 0;
    if (state.dragX !== undefined && state.dragY !== undefined) {
      const cssScale = layout.scale / (state.pixelRatio ?? 1);
      filledSlot(context, type, state.dragX / cssScale, state.dragY / cssScale, lifted, layout,
        raster, 1, `dragged:${state.draggedSlot}`, angle);
    } else if (state.pointerX !== undefined && state.pointerY !== undefined) {
      const cssScale = layout.scale / (state.pixelRatio ?? 1);
      filledSlot(context, type, state.pointerX / cssScale, state.pointerY / cssScale, lifted,
        layout, raster, 1, `dragged:${state.draggedSlot}`, angle);
    }
  }
  if (!state.mobile && !state.keyboardMovement) context.restore();
}

/** Wrap description text using real font metrics; no text is truncated into a
 * single line or allowed to overflow the viewport at the right/bottom edge. */
function drawHotbarTooltip(context: HudContext, state: HudState, layout: HudLayout, ratio: number): void {
  if (state.slotMotions && !state.inventoryOpen) {
    const scale = layout.scale / ratio;
    for (const motion of state.slotMotions) {
      if (motion.tooltipAlpha <= 0) continue;
      context.save(); context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawPetalTooltipAt(context, motion.type, motion.x * scale,
        (motion.y - motion.size / 2 - 10) * scale,
        layout.width, layout.height, layout.scale, ratio, motion.tooltipAlpha);
      context.restore();
    }
    return;
  }
  const hovered = state.hoveredSlot;
  if (hovered === undefined || hovered < 0 || !Number.isInteger(hovered)
      || hovered >= (state.inventoryOpen ? 16 : layout.equippedCount + 8)
      || state.draggedSlot !== undefined) return;
  const type = state.inventoryOpen ? state.slots?.[hovered] ?? 0 : hotbarPetal(state, layout, hovered);
  if (!type) return;
  context.save();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const motion = state.slotMotions?.find(value => value.slot === hovered);
  const anchor = motion ?? petalSlotAnchor(layout, hovered);
  const scale = layout.scale / ratio;
  const inventoryX = layout.width / 2 - 198 + 12 + hovered % 6 * 62 + 28;
  const inventoryY = layout.height / 2 - 125 + 44 + Math.floor(hovered / 6) * 62;
  drawPetalTooltipAt(context, type, state.inventoryOpen ? inventoryX : anchor.x * scale,
    state.inventoryOpen ? inventoryY - 10 * scale : (anchor.y - anchor.size / 2 - 10) * scale,
    layout.width, layout.height, layout.scale, ratio);
  context.restore();
}

/** Retain the explicit expanded-inventory interaction used by the app, while
 * the source's eight-slot storage row remains visible without opening it. */
function drawInventory(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  if (!state.inventoryOpen) return;
  const cell = 56, gap = 6, columns = 6;
  const panelWidth = 396, panelHeight = 250;
  const x = layout.width / 2 - panelWidth / 2, y = layout.height / 2 - panelHeight / 2;
  const ratio = state.pixelRatio ?? 1;
  context.save(); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.setGlobalAlpha(0.94); context.setFillRgb(28, 30, 28);
  context.fillRect(x, y, panelWidth, panelHeight); context.setGlobalAlpha(1); context.setStrokeRgb(220, 225, 220);
  context.setLineWidth(2); context.strokeRect(x, y, panelWidth, panelHeight);
  label(context, 'Inventory', 20, raster, x + panelWidth / 2, y + 21);
  for (let index = 0; index < 16; index++) {
    const left = x + 12 + index % columns * (cell + gap), top = y + 44 + Math.floor(index / columns) * (cell + gap);
    context.setGlobalAlpha(0.88); context.setFillRgb(35, 40, 38); context.fillRect(left, top, cell, cell);
    context.setGlobalAlpha(1); context.setStrokeRgb(...(index === state.selectedSlot ? [255, 245, 180] : [200, 205, 200]) as [number, number, number]);
    context.setLineWidth(index === state.selectedSlot ? 3 : 1.5); context.strokeRect(left, top, cell, cell);
    const type = state.slots?.[index] ?? 0;
    if (type) {
      context.save(); context.setTransform(ratio, 0, 0, ratio, ratio * (left + cell / 2), ratio * (top + cell / 2)); drawPetalIcon(context, type, 1); context.restore();
    }
  }
  context.restore();
}

function drawChat(context: HudContext, state: HudState, layout: HudLayout, raster: number): void {
  const lines = state.chat?.slice(-6) ?? [];
  if (!lines.length) return;
  const ratio = state.pixelRatio ?? 1;
  context.save(); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.setGlobalAlpha(0.8); context.setFillRgb(0, 0, 0);
  context.fillRect(16, layout.height - 118 - lines.length * 18, Math.min(460, layout.width - 32), lines.length * 18 + 8);
  context.setGlobalAlpha(1);
  lines.forEach((text, index) => label(context, text, 15, raster, 246, layout.height - 110 - (lines.length - 1 - index) * 18));
  context.restore();
}

let hudSurface: { canvas: RasterCanvas; context: HudContext } | undefined;
function wrapHudSurface(native: RasterContext2D): HudContext {
  // These native operations also work until the shared context adapter grows
  // the optional path/composite methods used by the original HUD.
  const bridge = {
    ...wrapContext(native),
    setFillRgb(r: number, g: number, b: number) {
      native.fillStyle = `#${[r, g, b].map(value => (value & 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    },
    setStrokeRgb(r: number, g: number, b: number) {
      native.strokeStyle = `#${[r, g, b].map(value => (value & 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    },
    stroke(path?: Path2D) { if (path) native.stroke(path); else native.stroke(); },
    setGlobalCompositeOperation(operation: GlobalCompositeOperation) { native.globalCompositeOperation = operation; },
  };
  return hudRenderer(bridge);
}

function getHudSurface(width: number, height: number): typeof hudSurface {
  if (!canvasAvailable()) return undefined;
  if (hudSurface && hudSurface.canvas.width === width && hudSurface.canvas.height === height) return hudSurface;
  const canvas = createRasterCanvas(width, height);
  if (!canvas) return undefined;
  const native = getRasterContext(canvas);
  if (!native) return undefined;
  hudSurface = { canvas, context: wrapHudSurface(native) };
  return hudSurface;
}

function drawHudLayer(context: HudContext, state: HudState, layout: HudLayout, clear = true): void {
  const raster = f(layout.scale * 2.4);
  if (clear) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    // resizeCanvas and clearCanvas both clear in the archived source.
    for (let pass = 0; pass < 2; pass++) {
      context.clearRect(0, 0, Math.round(layout.width * (state.pixelRatio ?? 1)), Math.round(layout.height * (state.pixelRatio ?? 1)));
      context.setGlobalCompositeOperation('source-over');
    }
  }
  context.save(); baseTransform(context, layout);
  drawLabelBox(context, { text: 'florr.io', font: 32, rasterScale: raster },
    15, 15, f(measureLabel('florr.io', 32) + 14), f(32 * 1.4), false);
  // Original763's dead-body branch draws only the logo and flower panel; the
  // map, level bar, hint and normal hotbar are absent.
  if (state.death) { context.restore(); return; }
  drawMap(context, state, layout, raster); drawLevelBar(context, state, layout, raster);
  drawHint(context, state, layout, raster); drawHotbar(context, state, layout, raster);
  drawInventory(context, state, layout, raster); drawChat(context, state, layout, raster); context.restore();
}

let panelSurface: { canvas: RasterCanvas; key: string } | undefined;
function flowerEntries(state: HudState): readonly FlowerEntry[] {
  return state.flowerEntries === undefined
    ? [{ name: state.playerName ?? 'Unnamed Flower', score: state.score ?? 0, local: true }]
    : state.flowerEntries.slice().sort((a, b) => b.score - a.score).slice(0, 10);
}

/** Source format strings at 15745/14099/13648: %.0f, %.1fk, %.1fm.
 * The archived func1983 rounds half-integers down at precision zero;
 * its one-decimal abbreviation path rounds exact ties to even. */
function formatScore(score: number): string {
  const absolute = Math.abs(score);
  const value = absolute < 1000 ? absolute : absolute < 1e6 ? absolute * 0.001 : absolute * 0.000001;
  const places = absolute < 1000 ? 0 : 1;
  const power = places === 0 ? 1 : 10;
  const scaled = value * power, floor = Math.floor(scaled);
  // At one decimal place only quarter-integers are exact binary ties.
  // Multiplying by ten can erase which side of a midpoint the double was
  // on (2450 * .001 is above 2.45), so otherwise round the original value.
  const exactTie = scaled - floor === 0.5 && (places === 0 || Number.isInteger(value * 4));
  const roundedTie = floor + (places === 0 ? 0 : floor % 2);
  const formatted = exactTie ? (roundedTie / power).toFixed(places) : value.toFixed(places);
  return `${score < 0 ? '-' : ''}${formatted}${absolute < 1000 ? '' : absolute < 1e6 ? 'k' : 'm'}`;
}

function scoreFraction(entry: FlowerEntry, leader: FlowerEntry | undefined): number {
  const fraction = f((entry.displayedScore ?? entry.score) / (leader?.displayedScore ?? leader?.score ?? 0));
  return Number.isFinite(fraction) ? clamp(fraction) : 1;
}

function drawPanelContent(context: HudContext, entries: readonly FlowerEntry[], scale: number,
                          x: number, y: number): void {
  context.setGlobalAlpha(1); context.setLineJoin('round'); context.setLineCap('round');
  context.save(); context.setTransform(scale, 0, 0, scale, x, y);
  context.beginPath(); roundedRect(context, 0, 0, 200, 276, 5); context.setFillRgb(85, 85, 85); context.setStrokeRgb(69, 69, 69); context.setLineWidth(6); context.fill(); context.stroke();
  entries.forEach((entry, index) => {
    const displayedScore = entry.displayedScore ?? entry.score;
    const y = 59 + index * 22;
    context.beginPath(); context.moveTo(20, y); context.lineTo(180, y); context.setLineWidth(20); context.setStrokeRgb(68, 68, 68); context.stroke();
    const fraction = scoreFraction(entry, entries[0]);
    context.beginPath(); context.moveTo(20, y); context.lineTo(20 + 160 * fraction, y); context.setLineWidth(16);
    context.setStrokeRgb(...(entry.local ? [255, 252, 97] : [210, 210, 210]) as [number, number, number]); context.stroke();
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
    drawLabelBox(context, { text: score, font: 13, rasterScale, projectedScale, cacheKey: `flower-score:${index}` },
      f(f(left + nameWidth) - 3), top, scoreWidth, height, false);
  });
  // func1132 draws the header last, with square lower corners.
  context.beginPath();
  context.moveTo(5, 0); context.lineTo(195, 0); context.quadraticCurveTo(200, 0, 200, 5);
  context.lineTo(200, 40); context.lineTo(0, 40); context.lineTo(0, 5);
  context.quadraticCurveTo(0, 0, 5, 0); context.closePath();
  context.setFillRgb(85, 187, 85); context.setStrokeRgb(69, 151, 69); context.setLineWidth(6); context.fill(); context.stroke();
  context.restore();
}

function drawFlowerPanel(context: HudContext, state: HudState, layout: HudLayout, ratio: number): void {
  const entries = flowerEntries(state), count = state.flowers ?? state.flowerEntries?.length ?? 1;
  context.save();
  const x = layout.logicalWidth - 230;
  if (canvasAvailable()) {
    // The native panel cache compares displayed strings and score fractions,
    // rather than invalidating on each fractional step toward a score target.
    const key = JSON.stringify([entries.map(entry => [entry.name, entry.local,
      formatScore(entry.displayedScore ?? entry.score), scoreFraction(entry, entries[0])]), ratio, layout.scale]);
    if (!panelSurface || panelSurface.key !== key) {
      const canvas = createRasterCanvas(Math.ceil(242 * layout.scale * ratio), Math.ceil(325.6 * layout.scale * ratio));
      const native = canvas ? getRasterContext(canvas) : null;
      if (canvas && native) { drawPanelContent(wrapHudSurface(native), entries, f(layout.scale * 1.1 * ratio), f(layout.scale * 11 * ratio), f(layout.scale * 11 * ratio)); panelSurface = { canvas, key }; }
    }
    if (panelSurface) {
      context.setTransform(f(layout.scale * ratio * 220), 0, 0, f(layout.scale * ratio * 296), f(layout.scale * ratio * x), f(layout.scale * ratio * 10));
      context.drawImage(panelSurface.canvas, 0, 0, f(242 * layout.scale * ratio), f(325.6 * layout.scale * ratio), 0, 0, 1, 1);
    }
  } else {
    const scale = f(layout.scale * ratio);
    drawPanelContent(context, entries, scale, f(scale * (x + 10)), f(scale * 20));
  }
  baseTransform(context, layout, ratio, x, 10);
  label(context, `${count} ${count === 1 ? 'Flower' : 'Flowers'}`, 18, f(f(layout.scale * ratio) * 2.4), 110, 30);
  context.restore();
}

function drawDeathOverlay(context: HudContext, state: HudState, layout: HudLayout, ratio: number): void {
  // clientFrame interpolates 159188 toward 1 with pow(.95, dt * .06).
  const elapsed = state.deathState?.elapsedMilliseconds;
  const amount = f(elapsed === undefined ? 1 : 1 - Math.pow(0.95, Math.max(0, Number.isFinite(elapsed) ? elapsed : 0) * 0.06));
  context.save(); baseTransform(context, layout, ratio); context.setFillRgb(0, 0, 0); context.setGlobalAlpha(amount * 0.25);
  context.fillRect(0, 0, layout.logicalWidth, layout.logicalHeight); context.setGlobalAlpha(1);
  const centerX = Math.trunc(layout.logicalWidth / 2);
  const centerY = Math.trunc(layout.logicalHeight / 2) - 7.857143;
  const raster = f(f(layout.scale * ratio) * 2.4);
  baseTransform(context, layout, ratio, centerX, centerY);
  // clientFrame draws the retained petals behind the dead flower, then the
  // dead face at 1.5x, rotated -0.2 radians. Artwork stays in entity-art.
  // Five generic Basic petals ring the dead face: three behind it and two in
  // front. The client draws them even when the retained inventory differs.
  const behind = [[-48, 7.5], [-15, -22.5], [45, -7.5]] as const;
  const front = [[-15, 45], [52.5, 30]] as const;
  for (const [x, y] of behind) {
    context.save(); baseTransform(context, layout, ratio, centerX + x, centerY + y, 1.5);
    drawPetalInstance(context, 1, 10); context.restore();
  }
  context.save();
  const faceScale = f(f(layout.scale * ratio) * 1.5);
  context.setTransform(f(faceScale * 0.980067), f(faceScale * -0.198669),
    f(faceScale * 0.198669), f(faceScale * 0.980067),
    f(f(layout.scale * ratio) * centerX), f(f(layout.scale * ratio) * centerY));
  drawPlayerFace(context, { dead: true }); context.restore();
  label(context, 'You were destroyed by:', 18, raster, 0, -120);
  label(context, state.deathState?.killerName ?? 'A mysterious entity', 24, raster, 0, -90);
  label(context, state.mobile ? '(tap to continue)' : '(press enter to continue)', 18, raster, 0, 90);
  for (const [x, y] of front) {
    context.save(); baseTransform(context, layout, ratio, centerX + x, centerY + y, 1.5);
    drawPetalInstance(context, 1, 10); context.restore();
  }
  const kept = state.deathState?.keptSlots ?? [];
  const scaled = ratio === 1 ? layout : { ...layout, scale: f(layout.scale * ratio) };
  let left = 20;
  for (let index = 0; index < layout.equippedCount; index += 1) {
    const type = kept[index] ?? 0;
    filledSlot(context, type, left + 30, layout.logicalHeight - 37.142857, 60, scaled, raster, 1, `retained:${index}`);
    left += 70;
  }
  // Original763 prints the retained death statistics at the bottom-left in
  // the HUD's logical space, independent of the sliding item row.
  baseTransform(context, layout, ratio);
  const statsRaster = f(f(layout.scale * ratio) * 2.4);
  for (const [text, font, top] of [
    ['Stats', 24, layout.logicalHeight - 152.142857],
    [`Points: ${formatScore(state.deathState?.score ?? 0)}`, 16, layout.logicalHeight - 118.142857],
    [`Level: ${state.deathState?.respawnLevel ?? state.level ?? 1}`, 16, layout.logicalHeight - 96.142857],
  ] as const) {
    drawLabelBox(context, { text, font, rasterScale: statsRaster }, 20, top,
      f(measureLabel(text, font) + Math.trunc(f(f(font * 0.12) * 2)) * 2), f(font * 1.4), false);
  }
  context.restore();
}

/** Native menu's second clear of renderer7926712, followed by its HUD/death
 * branch. That renderer retains identity, independently of the main UI scale;
 * only the logo layer uses the UI scale. amount is persistent presentation
 * state advanced by the menu owner only while world metadata is available.
 */
export function drawMenuPreviewHud(native: Canvas2DContext, frame: MenuPreviewFrame, amount: number,
                                   playerState?: HudState): void {
  native.clearRect(0, 0, 1, 1); native.setGlobalCompositeOperation?.('source-over');
  const context = hudRenderer(native);
  const layout = getHudLayout(frame.width, frame.height);
  const ratio = frame.pixelRatio;
  context.save();
  const surface = getHudSurface(1, 1);
  if (surface) {
    const logo = surface.context;
    for (let pass = 0; pass < 2; pass++) {
      logo.setTransform(1, 0, 0, 1, 0, 0); logo.clearRect(0, 0, 1, 1); logo.setGlobalCompositeOperation('source-over');
    }
    if (playerState) {
      drawHudLayer(logo, playerState, ratio === 1 ? layout : { ...layout, scale: f(layout.scale * ratio) }, false);
    } else {
      logo.save(); baseTransform(logo, layout, ratio);
      drawLabelBox(logo, { text: 'florr.io', font: 32, rasterScale: f(f(layout.scale * ratio) * 2.4) },
        15, 15, f(measureLabel('florr.io', 32) + 14), f(32 * 1.4), false);
      logo.restore();
    }
    context.save(); context.setGlobalAlpha(0.85); context.drawImage(surface.canvas, 0, 0); context.restore();
  }
  // func1095 uses the unscaled offscreen renderer for the remaining HUD.
  const hidden = { ...layout, scale: ratio };
  drawFlowerPanel(context, playerState ?? { health: 0, maxHealth: 100, level: 1, flowers: 0, flowerEntries: [] }, hidden, 1);
  if (playerState) { context.restore(); return; }
  context.save(); context.setFillRgb(0, 0, 0); context.setGlobalAlpha(amount * 0.25);
  unitRect(context, ratio, 0, 0, layout.logicalWidth, layout.logicalHeight); context.setGlobalAlpha(1);
  const x = Math.trunc(layout.logicalWidth / 2);
  const offset = f(f(1 - amount) * layout.logicalHeight);
  const y = f(Math.trunc(layout.logicalHeight / 2) - offset);
  // Empty retained-petal groups still submit their state scopes.
  context.save(); context.restore(); context.save();
  const cosine = f(Math.cos(-0.2)), sine = f(Math.sin(-0.2));
  context.setTransform(f(ratio * f(1.5 * cosine)), f(ratio * f(1.5 * sine)),
    f(ratio * f(-1.5 * sine)), f(ratio * f(1.5 * cosine)), f(ratio * x), f(ratio * y));
  drawPlayerFace(context, { dead: true }); context.restore();
  context.save(); context.restore();
  context.setTransform(ratio, 0, 0, ratio, f(ratio * x), f(ratio * y));
  const raster = f(ratio * 2.4);
  label(context, 'You were destroyed by:', 18, raster, 0, -120);
  label(context, 'A mysterious entity', 24, raster, 0, -90);
  label(context, '(press enter to continue)', 18, raster, 0, 90);
  context.setTransform(ratio, 0, 0, ratio, 0, f(ratio * offset));
  for (const [text, font, top] of [['Stats', 24, layout.logicalHeight - 160],
    ['Points: 0', 16, layout.logicalHeight - 126], ['Level: 0', 16, layout.logicalHeight - 104]] as const) {
    // Stats labels are left/top aligned, unlike drawTextLabel's centering.
    drawLabelBox(context, { text, font, rasterScale: raster }, 20, top,
      f(measureLabel(text, font) + Math.trunc(f(f(font * 0.12) * 2)) * 2), f(font * 1.4), false);
  }
  context.restore(); context.restore();
}

/** Draw the menu or the complete HUD; explicit state determines all animation. */
export function drawHud(native: Canvas2DContext, state: HudState): void {
  const ratio = Number.isFinite(state.pixelRatio) && state.pixelRatio! > 0 ? state.pixelRatio! : 1;
  state = { ...state, pixelRatio: ratio };
  const layout = getHudLayout(state.width, state.height, state.level, state.mobile, state.uiScale);
  if (state.menu) {
    drawMenu(native, layout.width, layout.height, state.status ?? '', ratio, state.animationTime ?? 0,
      state.menuSeed, state.menuPreview, state.menuPreviewState, state.interactiveMenu, state.petalDiscoveries ?? 0,
      state.menuState, state.menuPetalTypes, state.menuRespawn); return;
  }
  const context = hudRenderer(native);
  context.save(); context.save();
  const surface = getHudSurface(Math.round(layout.width * ratio), Math.round(layout.height * ratio));
  if (surface) {
    // HUD geometry is in CSS pixels; the offscreen pass receives its own DPR.
    const scaled = ratio === 1 ? layout : { ...layout, scale: f(layout.scale * ratio) };
    drawHudLayer(surface.context, state, scaled);
    context.save(); context.setGlobalAlpha(0.85); context.setTransform(1, 0, 0, 1, 0, 0); context.drawImage(surface.canvas, 0, 0); context.restore();
  } else {
    context.setGlobalAlpha(0.85);
    drawHudLayer(context, state, ratio === 1 ? layout : { ...layout, scale: f(layout.scale * ratio) }, false);
    context.setGlobalAlpha(1);
  }
  drawFlowerPanel(context, state.death
    ? { ...state, flowers: 0, flowerEntries: [] }
    : state, layout, ratio);
  if (!state.death) drawHotbarTooltip(context, state, layout, ratio);
  if (state.death || state.deathState) drawDeathOverlay(context, state, layout, ratio);
  context.restore(); context.restore();
}
