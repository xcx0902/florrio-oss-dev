import type { Canvas2DContext } from '../canvas2d/context.js';
import { SpeciesContext, inLocal, inLocalTransform, localContext } from './geometry.js';
import { PALETTES, Rgb, TAU, rgb, setFill, setStroke, shade } from './palette.js';
// ---------------------------------------------------------------------------
// Player flower
// ---------------------------------------------------------------------------
export interface PlayerGaze {
  x: number;
  y: number;
}
/** Persistent domain state corresponding to native appearance state, not a
* frame/handle lookup. The caller owns one instance per player lifetime. */
export interface PlayerFaceState {
  gaze: [
    PlayerGaze,
    PlayerGaze
  ];
  mouthCurve: number;
  eyeExpression: number;
  attackAmount: number;
  defendAmount: number;
}
export interface PlayerFaceOptions {
  /** Opt into a standalone canvas-state wrapper. Native1100 relies on the
  * caller's entity save/restore and leaves the mouth transform installed. */
  readonly preserveContext?: boolean;
  readonly state?: PlayerFaceState;
  /** Elapsed frame time in milliseconds, never absolute animation time. */
  readonly deltaMs?: number;
  /** Native player look byte * (2 * PI / 255), in radians. */
  readonly lookAngle?: number;
  readonly attacking?: boolean;
  readonly defending?: boolean;
  readonly dead?: boolean;
  readonly extraAction?: boolean;
  /** Native cosmetic/expression bits: 1 eye visor, 2 subdued mouth, 4 decoration. */
  readonly expressionFlags?: number;
  readonly model?: 0 | 1;
  readonly flash?: number;
  readonly flashTarget?: Rgb;
  readonly grayscale?: boolean;
  /** @deprecated Accepted for source compatibility; use lookAngle and state. */
  readonly highlightRight?: boolean;
}
/** Zero-initialized native appearance state. Rendering with no state remains
* a settled idle pose; providing this state enables native frame smoothing. */
export function createPlayerFaceState(): PlayerFaceState {
  return { gaze: [{ x: 0, y: 0 }, { x: 0, y: 0 }], mouthCurve: 0,
    eyeExpression: 0, attackAmount: 0, defendAmount: 0 };
}
export function playerSmooth(current: number, target: number, retention: number, deltaMs: number): number {
  if (Math.abs(current - target) < 1e-7)
    return Math.fround(target);
  const blend = Math.max(0, Math.min(1, 1 - Math.pow(retention, deltaMs * 0.06)));
  return Math.fround((target - current) * blend + current);
}
export function playerGray(color: Rgb, grayscale: boolean): Rgb {
  if (!grayscale)
    return color;
  const value = Math.trunc(color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722);
  return rgb(value, value, value);
}
export function playerBlend(base: Rgb, target: Rgb, amount: number): Rgb {
  const f = Math.fround, inverse = f(1 - amount);
  const channel = (a: number, b: number): number => Math.trunc(f(f(amount * b) + f(inverse * a)));
  return rgb(channel(base.r, target.r), channel(base.g, target.g), channel(base.b, target.b));
}
export function drawPlayerEye(context: Canvas2DContext, x: number, y: number, gaze: PlayerGaze, dead: boolean, ink: Rgb): void {
  if (dead) {
    inLocalTransform(context, eye => {
      eye.setLineWidth(3);
      setStroke(eye, ink);
      eye.beginPath();
      eye.moveTo(-4, -4);
      eye.lineTo(4, 4);
      eye.stroke();
      eye.beginPath();
      eye.moveTo(4, -4);
      eye.lineTo(-4, 4);
      eye.stroke();
    }, 1, 0, x, y);
    return;
  }
  if ((context as SpeciesContext).transform) {
    inLocalTransform(context, eye => {
      const native = eye as SpeciesContext;
      native.transform!(1, 0, 0, 2, 0, 0);
      eye.beginPath();
      eye.arc(0, 0, 3, 0, TAU);
      setFill(eye, ink);
      eye.fill();
      eye.save();
      eye.clip();
      native.transform!(1, 0, 0, 0.5, 0, 0);
      eye.beginPath();
      eye.arc(gaze.x * 2, gaze.y * 4, 3, 0, TAU);
      setFill(eye, PALETTES.playerEyeLight);
      eye.fill();
      eye.restore();
      eye.beginPath();
      eye.arc(0, 0, 3, 0, TAU);
      setStroke(eye, ink);
      eye.setLineWidth(0.5);
      eye.stroke();
    }, 1, 0, x, y);
    return;
  }
  // Compatibility bridge only. Native-capable contexts preserve arc + CTM.
  setFill(context, ink);
  context.beginPath();
  context.ellipse(x, y, 3, 6, 0, 0, TAU);
  context.fill();
  context.save();
  context.clip();
  context.beginPath();
  context.arc(x + gaze.x * 2, y + gaze.y * 4, 3, 0, TAU);
  setFill(context, PALETTES.playerEyeLight);
  context.fill();
  context.restore();
  context.beginPath();
  context.ellipse(x, y, 3, 6, 0, 0, TAU);
  setStroke(context, ink);
  context.setLineWidth(0.5);
  context.stroke();
}
/** State smoothing, action colours,
* double-blended hit rim, expressions and gaze. No captured glint positions. */
export function drawPlayerFace(context: Canvas2DContext, options: PlayerFaceOptions = {}): void {
  const f = Math.fround, attacking = options.attacking === true, defending = options.defending === true;
  const dead = options.dead === true, busy = attacking || defending || dead || options.extraAction === true;
  const flags = options.expressionFlags ?? 0, model = options.model ?? 0, grayscale = options.grayscale === true;
  const delta = f(Number.isFinite(options.deltaMs) ? Math.max(0, options.deltaMs!) : 0);
  const angle = f(Number.isFinite(options.lookAngle) ? options.lookAngle! : 0);
  const targetX = f(Math.cos(angle)), targetY = f(Math.sin(angle));
  const mouthTarget = busy || (flags & 1) ? -5 : flags & 2 ? -3 : 5;
  const eyeTarget = !busy && (flags & 1) ? 1 : 0;
  const state = options.state ?? { gaze: [{ x: targetX, y: targetY }, { x: targetX, y: targetY }],
    mouthCurve: mouthTarget, eyeExpression: eyeTarget, attackAmount: +attacking, defendAmount: +defending };
  state.attackAmount = playerSmooth(state.attackAmount, +attacking, 0.8, delta);
  state.defendAmount = playerSmooth(state.defendAmount, +defending, 0.8, delta);
  state.eyeExpression = playerSmooth(state.eyeExpression, eyeTarget, eyeTarget ? 0.6 : 0.8, delta);
  if (state.eyeExpression < 1e-4)
    state.eyeExpression = 0;
  state.mouthCurve = playerSmooth(state.mouthCurve, mouthTarget, 0.6, delta);
  if (!dead)
    for (const gaze of state.gaze) {
      gaze.x = playerSmooth(gaze.x, targetX, 0.8, delta);
      gaze.y = playerSmooth(gaze.y, targetY, 0.8, delta);
    }
  const flash = f(Number.isFinite(options.flash) ? Math.max(0, Math.min(1, options.flash!)) : 0);
  const flashTarget = options.flashTarget ?? (flash >= 0.9 ? rgb(255, 255, 255) : rgb(255, 0, 0));
  const defend = f(state.defendAmount * 0.3), white = f(defend * 255), inverse = f(1 - defend);
  const defendedChannel = (channel: number): number => Math.trunc(f(white + f(inverse * channel)));
  const defended = rgb(defendedChannel(255), defendedChannel(231), defendedChannel(99));
  const action = playerBlend(defended, rgb(206, 118, 219), state.attackAmount);
  const body = playerBlend(action, flashTarget, flash);
  const outline = playerBlend(shade(body), flashTarget, flash);
  const ink = playerGray(PALETTES.playerInk, grayscale);
  if (options.preserveContext)
    context.save();
  context.setLineCap('round');
  context.setLineWidth(3);
  setFill(context, playerGray(body, grayscale));
  setStroke(context, playerGray(outline, grayscale));
  context.beginPath();
  if (model === 1) {
    context.moveTo(25, 0);
    context.quadraticCurveTo(15, 35, 0, 25);
    context.quadraticCurveTo(-25, 15, -25, 0);
    context.quadraticCurveTo(-25, -35, 0, -25);
    context.quadraticCurveTo(18, -25, 25, 0);
    context.closePath();
  }
  else
    context.arc(0, 0, 25, 0, TAU);
  context.fill();
  context.stroke();
  if (flags & 4)
    inLocal(context, decoration => {
      const remainder = f(51 - f(flash * 51));
      const channel = (value: number): number => Math.trunc(f(remainder + f(flash * value)));
      const color = playerGray(rgb(channel(flashTarget.r), channel(flashTarget.g), channel(flashTarget.b)), grayscale);
      decoration.setLineJoin('round');
      setStroke(decoration, color);
      setFill(decoration, color);
      decoration.setLineWidth(3);
      for (const side of [-1, 1]) {
        decoration.beginPath();
        decoration.moveTo(25, side * 5);
        decoration.quadraticCurveTo(40, side * 10, 50, side * 15);
        decoration.quadraticCurveTo(40, side * 5, 25, side * 5);
        decoration.closePath();
        decoration.fill();
        decoration.stroke();
      }
    }, 1, -Math.PI / 2, 0, 6);
  context.save();
  if (model === 0 && state.eyeExpression >= 1e-4) {
    context.beginPath();
    context.moveTo(-14, -14);
    context.lineTo(0, f(f(state.eyeExpression * 9) - 14));
    context.lineTo(14, -14);
    context.lineTo(14, 6);
    context.lineTo(-14, 6);
    context.closePath();
    context.clip();
  }
  if (model === 1) {
    inLocalTransform(context, eye => drawPlayerEye(eye, 0, 0, state.gaze[0], dead, ink), 1, Math.PI * 0.98, -10, -10);
    inLocalTransform(context, eye => drawPlayerEye(eye, 0, 0, state.gaze[1], dead, ink), 1, -Math.PI * 0.03, 10, 8);
  }
  else {
    drawPlayerEye(context, -7, -5, state.gaze[0], dead, ink);
    drawPlayerEye(context, 7, -5, state.gaze[1], dead, ink);
  }
  context.restore();
  let mouth = localContext(context, 1, 0, 0, 10);
  if (model === 1)
    mouth = localContext(mouth, 1, Math.PI / 5, -8, -3);
  mouth.beginPath();
  mouth.moveTo(-6, 0);
  mouth.quadraticCurveTo(0, state.mouthCurve, 6, 0);
  setStroke(mouth, ink);
  mouth.setLineWidth(1.5);
  mouth.stroke();
  if (options.preserveContext)
    context.restore();
}
/** Persistent renderer state fields. */
export interface PlayerHealthBarState {
  healthRatio: number;
  trailingRatio: number;
  alpha: number;
}
export interface PlayerHealthBarOptions {
  readonly state?: PlayerHealthBarState;
  /** Elapsed frame time in milliseconds, never absolute animation time. */
  readonly deltaMs?: number;
  /** Native visual +16 flag: immediate visibility and zero ratio retention
  * (a zero-time frame still retains its previous ratios). */
  readonly immediate?: boolean;
  readonly grayscale?: boolean;
}
/** The render state explicitly zeros +792/+796/+800.
* A full red trail comes from prior frames or the visual's immediate flag. */
export function createPlayerHealthBarState(): PlayerHealthBarState {
  return { healthRatio: 0, trailingRatio: 0, alpha: 0 };
}
/** Health layer. The caller owns the entity
* transform and persistent state. Alpha eases once per rendered frame; ratio
* easing uses elapsed milliseconds. Omitting state draws the settled ratios;
* provide a per-entity state to reproduce damage/healing/fade history. */
export function drawPlayerHealthBar(context: Canvas2DContext, ratio: number, options: PlayerHealthBarOptions = {}): void {
  const f = Math.fround;
  const target = f(Number.isFinite(ratio) ? ratio : 0);
  const visible = target > 0 && target < 1 ? 1 : 0;
  const delta = f(Number.isFinite(options.deltaMs) ? Math.max(0, options.deltaMs!) : 0);
  const state = options.state ?? { healthRatio: target, trailingRatio: target, alpha: visible };
  const immediate = options.immediate === true;
  state.healthRatio = playerSmooth(state.healthRatio, target, immediate ? 0 : 0.8, delta);
  if (immediate || f(state.healthRatio - target) < 0.001)
    state.trailingRatio = playerSmooth(state.trailingRatio, target, immediate ? 0 : 0.9, delta);
  state.alpha = f(Math.abs(state.alpha - visible) < 1e-7 ? visible
    : state.alpha + (immediate ? 1 : 0.2) * (visible - state.alpha));
  const clamp = (value: number): number => Math.max(0, Math.min(1, value));
  const alpha = clamp((context.getGlobalAlpha?.() ?? 1) * state.alpha);
  const grayscale = options.grayscale === true;
  context.save();
  context.setGlobalAlpha(alpha);
  context.setLineCap('round');
  context.setLineWidth(10);
  context.beginPath();
  context.moveTo(-35, 50);
  context.lineTo(35, 50);
  setStroke(context, grayscale ? rgb(50, 50, 50) : PALETTES.healBack);
  context.stroke();
  context.setGlobalAlpha(clamp(alpha * clamp(state.trailingRatio * 30)));
  context.setLineWidth(6);
  context.beginPath();
  context.moveTo(-35, 50);
  context.lineTo(f(f(state.trailingRatio * 70) - 35), 50);
  setStroke(context, grayscale ? rgb(87, 87, 87) : PALETTES.healRed);
  context.stroke();
  context.setGlobalAlpha(alpha);
  context.setGlobalAlpha(clamp(alpha * clamp(state.healthRatio * 30)));
  context.setLineWidth(7);
  context.beginPath();
  context.moveTo(-35, 50);
  context.lineTo(f(f(state.healthRatio * 70) - 35), 50);
  setStroke(context, grayscale ? rgb(186, 186, 186) : PALETTES.healGreen);
  context.stroke();
  context.setGlobalAlpha(alpha);
  context.restore();
}
