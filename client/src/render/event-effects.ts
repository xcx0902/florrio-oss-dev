/** Snapshot event 14: a collected petal becomes its HUD slot visual.
 * Decoder defaults/payload: snapshot-decoder.mjs 288–320, 465–505.
 * Flight/retirement: original func803, slot attachment func1101, and the
 * clientFrame retired-list cleanup. render-frame's similarly named pass
 * draws the world pickup marker, not this screen-space transfer.
 */
import type { Canvas2DContext } from './canvas2d/context.js';
import { wrapContext } from './canvas2d/context.js';
import { createRasterCanvas, getRasterContext, drawLabel, getLabel } from './canvas2d/text-cache.js';
import type { RasterCanvas } from './canvas2d/text-cache.js';
import { drawPetalIcon } from './entity-art.js';
import { getHudLayout } from './hud.js';
import { PETAL_INFO } from '../schema/petals.js';

export interface Event14Payload {
  readonly index: number;
  readonly type: number;
  /** Native decoder screen units: CSS pixels divided by the HUD UI scale.
   * The caller projects the pickup once, at receipt; camera motion does not
   * subsequently move the transfer's starting point. */
  readonly startScreenX: number;
  readonly startScreenY: number;
  readonly recharge?: number;
}

export interface Event14Viewport {
  readonly width?: number;
  readonly height?: number;
  readonly level?: number;
  readonly mobile?: boolean;
  readonly uiScale?: number;
  readonly pixelRatio?: number;
  /** Logical renderer translation shared with the hotbar during death. */
  readonly offsetY?: number;
}

export interface Event14Frame extends Event14Viewport {
  readonly nowMilliseconds: number;
  /** Actual first-frame delta; later calls can derive it from the clock. */
  readonly deltaMilliseconds?: number;
  /** False when the slot no longer owns this petal. Native slot visuals do
   * not have an arbitrary lifetime: they fade/shrink only after retirement. */
  readonly active?: boolean;
  readonly recharge?: number;
}

export interface Event14Effect {
  readonly index: number;
  readonly type: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  recharge: number;
  rechargeFade: number;
  targetRecharge: number;
  slotX: number | undefined;
  slotY: number | undefined;
  phase: 'arriving' | 'settled' | 'departing' | 'done';
  lastTime: number | undefined;
  retiredFrames: number;
}

const f = Math.fround;
// Each native803 owns its label bitmap, including a retired visual and its
// replacement at the same slot. Repeated draws of one effect reuse its owner.
const labelOwners = new WeakMap<Event14Effect, string>();
let nextLabelOwner = 0;
function labelOwner(effect: Event14Effect): string {
  let owner = labelOwners.get(effect);
  if (owner === undefined) {
    owner = `event14:${effect.index}:${nextLabelOwner++}`;
    labelOwners.set(effect, owner);
  }
  return owner;
}
const clamp = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const amount = (base: number, delta: number): number => clamp(1 - Math.pow(base, f(delta) * 0.06));
const approach = (current: number, target: number, step: number): number =>
  f(Math.abs(current - target) < 1e-7 ? target : current + (target - current) * step);

/** Fresh native visual: zero size/opacity, decoded position and recharge. */
export function createEvent14Effect(payload: Event14Payload): Event14Effect {
  if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index >= 16) {
    throw new RangeError('Event 14 index must identify one of the sixteen petal slots');
  }
  if (payload.type <= 0 || !PETAL_INFO[payload.type] || !Number.isInteger(payload.type)) {
    throw new RangeError('Event 14 requires a known petal type');
  }
  if (!Number.isFinite(payload.startScreenX) || !Number.isFinite(payload.startScreenY)) {
    throw new RangeError('Event 14 requires finite projected screen coordinates');
  }
  return { index: payload.index, type: payload.type, x: f(payload.startScreenX), y: f(payload.startScreenY),
    size: 0, opacity: 0, recharge: f(clamp(payload.recharge ?? 1)), rechargeFade: 0,
    targetRecharge: f(clamp(payload.recharge ?? 1)), slotX: undefined, slotY: undefined,
    phase: 'arriving', lastTime: undefined, retiredFrames: 0 };
}

/** Advance once per frame; return false when native retirement is complete.
 * Positions, size and opacity use pow(.8, f32(delta) * .06), with f32 stores.
 * No recorded positions, sample fractions, elapsed-time TTL or hit pulses.
 */
export function updateEvent14Effect(effect: Event14Effect, frame: Event14Frame): boolean {
  if (effect.phase === 'done') return false;
  const now = Number.isFinite(frame.nowMilliseconds) ? frame.nowMilliseconds : effect.lastTime ?? 0;
  if (effect.lastTime !== undefined && now <= effect.lastTime) return true;
  const elapsed = frame.deltaMilliseconds ?? (effect.lastTime === undefined ? 0 : now - effect.lastTime);
  const delta = f(Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0);
  effect.lastTime = now;
  const layout = getHudLayout(frame.width, frame.height, frame.level, frame.mobile, frame.uiScale);
  const equipped = effect.index < layout.equippedCount;
  const storageIndex = effect.index - layout.equippedCount;
  const validSlot = effect.index < layout.equippedCount + 8;
  if (frame.active === false || !validSlot) effect.phase = 'departing';
  const active = effect.phase !== 'departing';
  const x = f(equipped ? layout.equippedX + effect.index * 90 : layout.storageX + storageIndex * 65);
  const y = f(equipped ? layout.equippedY : layout.storageY);
  const step = amount(0.8, delta);
  const before = [effect.x, effect.y, effect.size, effect.opacity];
  if (active || effect.slotX === undefined) { effect.slotX = x; effect.slotY = y; }
  // Retired objects keep their last slot anchor while shrinking out.
  if (validSlot) {
    effect.x = approach(effect.x, effect.slotX, step);
    effect.y = approach(effect.y, effect.slotY!, step);
  }
  effect.size = approach(effect.size, active ? equipped ? 70 : 50 : 0, step);
  effect.opacity = approach(effect.opacity, active ? 1 : 0, step);
  if (frame.recharge !== undefined) effect.targetRecharge = f(clamp(frame.recharge));
  const recharge = equipped ? effect.targetRecharge : 1;
  // Native func587 resets a falling recharge immediately, then smooths up.
  effect.recharge = approach(Math.min(effect.recharge, recharge), recharge, step);
  effect.rechargeFade = approach(effect.rechargeFade, equipped ? 0 : 1,
    clamp(1 - Math.pow(2, -delta * 0.06)));
  if (!active) {
    effect.retiredFrames++;
    // clientFrame removes retired entries only after two visits and opacity
    // <= 1e-4; drawing at zero delta never skips that ownership boundary.
    if (effect.retiredFrames > 1 && effect.opacity <= 0.0001) effect.phase = 'done';
  } else if (delta > 0) {
    const after = [effect.x, effect.y, effect.size, effect.opacity];
    // f32 easing can reach a numerical fixed point before exact equality
    // with a large coordinate; use that fixed point instead of a fake TTL.
    effect.phase = after.every((value, index) => value === before[index]) ? 'settled' : 'arriving';
  }
  return effect.phase !== 'done';
}

const RARITY_RGB: readonly (readonly [number, number, number])[] = Array.from({ length: 6 }, (_, rarity) => [
  Number(245047318478718n >> BigInt(rarity * 8) & 255n),
  Number(34218529646319n >> BigInt(rarity * 8) & 255n),
  Number(111187557834093n >> BigInt(rarity * 8) & 255n),
]);

const artwork = new Map<string, RasterCanvas>();
function petalArtwork(type: number, raster: number): RasterCanvas | undefined {
  const key = `${type}:${raster}`;
  const cached = artwork.get(key);
  if (cached) return cached;
  // Antennae, clustered peas and eggs extend beyond a 24px disc.
  const side = [1,2,6,7,8,14,35].includes(type) ? 24 : 56;
  const canvas = createRasterCanvas(Math.ceil(side * raster), Math.ceil(side * raster));
  if (!canvas) return;
  const native = getRasterContext(canvas);
  if (!native) return;
  native.setTransform(raster, 0, 0, raster, canvas.width / 2, canvas.height / 2);
  drawPetalIcon(wrapContext(native), type);
  artwork.set(key, canvas);
  return canvas;
}

/** Draw in screen space, after the world pass. Drawing never advances state.
 * The slot is a rarity card with petal artwork/name and the native recharge
 * sector, rather than a generic expanding hit circle.
 */
export function drawEvent14Effect(context: Canvas2DContext, effect: Readonly<Event14Effect>,
                                  viewport: Event14Viewport = {}): void {
  if (effect.phase === 'done' || effect.size <= 0 || effect.opacity <= 0) return;
  const layout = getHudLayout(viewport.width, viewport.height, viewport.level, viewport.mobile, viewport.uiScale);
  const ratio = Number.isFinite(viewport.pixelRatio) && viewport.pixelRatio! > 0 ? viewport.pixelRatio! : 1;
  const scale = f(layout.scale * ratio), zoom = f(effect.size / 70), projected = f(scale * zoom);
  const y = f(f(scale * (viewport.offsetY ?? 0)) + f(scale * effect.y));
  const alpha = clamp((context.getGlobalAlpha?.() ?? 1) * effect.opacity);
  const rgb = RARITY_RGB[PETAL_INFO[effect.type].rarity] ?? RARITY_RGB[0];
  context.save();
  context.setGlobalAlpha(alpha);
  context.setTransform(projected, 0, 0, projected, f(scale * effect.x), y);
  context.setLineJoin('round');
  const line = f(70 * 0.083333), side = f(70 - line);
  context.setFillRgb(...rgb); context.fillRect(-side / 2, -side / 2, side, side);
  const angle = f(effect.recharge * effect.recharge * 6.283185);
  if (effect.rechargeFade < 0.99999 && angle < 6.283122) {
    context.save(); context.setGlobalAlpha(alpha * (1 - effect.rechargeFade));
    context.beginPath(); context.moveTo(0, -5);
    context.arc(0, -5, 140, angle * 5.7, angle * 4.7 + 6.283185, false);
    context.clip();
    context.setFillRgb(...rgb.map(value => Math.round(value * 0.64)) as [number, number, number]);
    const inner = f(70 - f(line * 2));
    context.fillRect(-inner / 2, -inner / 2, inner, inner); context.restore();
  }
  context.beginPath(); context.rect(-side / 2, -side / 2, side, side);
  context.setStrokeRgb(...rgb.map(value => Math.round(value * 0.81)) as [number, number, number]);
  context.setLineWidth(line); context.stroke();
  context.save();
  context.setTransform(projected, 0, 0, projected, f(scale * effect.x), f(y - projected * 5));
  const raster = f(scale * 2.4), image = petalArtwork(effect.type, raster);
  if (image) context.drawImage(image, 0, 0, image.width, image.height,
    -image.width / raster / 2, -image.height / raster / 2, image.width / raster, image.height / raster);
  else drawPetalIcon(context, effect.type);
  context.restore();
  const spec = { text: PETAL_INFO[effect.type].name, font: 14, rasterScale: raster, cacheKey: labelOwner(effect) };
  const label = getLabel(spec);
  if (label) {
    // The shared lazy context intentionally has no native getTransform;
    // compose the cached label through this pass's known logical matrix.
    const width = f(label.boxWidth), height = f(14 * 1.4);
    context.setTransform(f(projected * width), 0, 0, f(projected * height),
      f(f(scale * effect.x) + f(projected * f(-width * 0.5))),
      f(y + f(projected * f(17 - f(height * 0.5)))));
    context.drawImage(label.canvas, 0, 0, 1, 1);
  } else drawLabel(context, spec, 0, 17);
  context.restore();
}
