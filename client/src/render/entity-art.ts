/**
 * Parametric Canvas2D artwork recovered from the archived client renderer.
 *
 * Every routine draws at the local origin of one entity. The caller installs
 * the per-entity camera/position/angle transform and owns its save/restore.
 * Species geometry follows source/game/client and source/wasm/client.wat,
 * with native WASM paint comparisons and read-only golden Path2D checks.
 */
import type { Canvas2DContext } from './canvas2d/context.js';
import { PETAL_INFO } from '../schema/petals.js';
import { drawLabel } from './canvas2d/text-cache.js';

export const TAU = Math.PI * 2;

export interface Rgb { readonly r: number; readonly g: number; readonly b: number; }

const rgb = (r: number, g: number, b: number): Rgb => ({ r, g, b });

export const PALETTES = Object.freeze({
  playerFace: rgb(255, 231, 99),
  playerOutline: rgb(207, 187, 80),
  playerInk: rgb(34, 34, 34),
  playerEyeLight: rgb(238, 238, 238),
  ladybugBody: rgb(235, 64, 52),
  ladybugOutline: rgb(190, 52, 42),
  ladybugDark: rgb(17, 17, 17),
  ladybugDarkOutline: rgb(14, 14, 14),
  beeBody: rgb(255, 231, 99),
  beeOutline: rgb(211, 189, 70),
  beeDark: rgb(51, 51, 51),
  beeDarkOutline: rgb(41, 41, 41),
  hornetBody: rgb(255, 211, 99),
  hornetOutline: rgb(211, 173, 70),
  antBody: rgb(85, 85, 85),
  antOutline: rgb(69, 69, 69),
  antLegs: rgb(41, 41, 41),
  rockBody: rgb(119, 119, 119),
  rockOutline: rgb(96, 96, 96),
  cactusBody: rgb(50, 168, 82),
  cactusOutline: rgb(40, 136, 66),
  cactusSpike: rgb(200, 230, 160),
  petalBasic: rgb(255, 255, 255),
  petalBasicOutline: rgb(207, 207, 207),
  healGreen: rgb(117, 221, 52),
  healRed: rgb(221, 52, 52),
  healBack: rgb(51, 51, 51),
});

const setFill = (context: Canvas2DContext, color: Rgb): void => {
  context.setFillRgb(color.r, color.g, color.b);
};
const setStroke = (context: Canvas2DContext, color: Rgb): void => {
  context.setStrokeRgb(color.r, color.g, color.b);
};

/** Remaining hit blend, 1 at impact and 0 after 150 ms. The first 15 ms
 * are white, followed by red. WAT 1040/1044 truncate f32 channels. */
export function flashColor(base: Rgb, amount: number): Rgb {
  if (!(amount > 0)) return base;
  const f = Math.fround;
  const weight = f(Math.min(1, amount));
  const target = weight >= 0.9 ? rgb(255, 255, 255) : rgb(255, 0, 0);
  const blend = (value: number, to: number): number =>
    Math.trunc(f(f(f(1 - weight) * value) + f(weight * to)));
  return rgb(
    blend(base.r, target.r), blend(base.g, target.g), blend(base.b, target.b),
  );
}

/** Darkened outline colour used by the original `sqrt(channel / 255) * 0.9`
 * shading pass; kept as a helper so outlines track their body palette. */
export function shade(color: Rgb, scale = 0.8999999985098839): Rgb {
  const channel = (value: number): number => {
    const normalized = Math.sqrt(Math.max(0, value) / 255) * scale;
    return Math.round(normalized * normalized * 255);
  };
  return rgb(channel(color.r), channel(color.g), channel(color.b));
}

// ---------------------------------------------------------------------------
// Player flower
// ---------------------------------------------------------------------------

export interface PlayerGaze { x: number; y: number; }
/** Persistent domain state corresponding to native appearance state, not a
 * frame/handle lookup. The caller owns one instance per player lifetime. */
export interface PlayerFaceState {
  gaze: [PlayerGaze, PlayerGaze];
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
function playerSmooth(current: number, target: number, retention: number, deltaMs: number): number {
  if (Math.abs(current - target) < 1e-7) return Math.fround(target);
  const blend = Math.max(0, Math.min(1, 1 - Math.pow(retention, deltaMs * 0.06)));
  return Math.fround((target - current) * blend + current);
}
function playerGray(color: Rgb, grayscale: boolean): Rgb {
  if (!grayscale) return color;
  const value = Math.trunc(color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722);
  return rgb(value, value, value);
}
function playerBlend(base: Rgb, target: Rgb, amount: number): Rgb {
  const f = Math.fround, inverse = f(1 - amount);
  const channel = (a: number, b: number): number => Math.trunc(f(f(amount * b) + f(inverse * a)));
  return rgb(channel(base.r, target.r), channel(base.g, target.g), channel(base.b, target.b));
}

function drawPlayerEye(context: Canvas2DContext, x: number, y: number, gaze: PlayerGaze,
  dead: boolean, ink: Rgb): void {
  if (dead) {
    inLocalTransform(context, eye => {
      eye.setLineWidth(3); setStroke(eye, ink);
      eye.beginPath(); eye.moveTo(-4, -4); eye.lineTo(4, 4); eye.stroke();
      eye.beginPath(); eye.moveTo(4, -4); eye.lineTo(-4, 4); eye.stroke();
    }, 1, 0, x, y);
    return;
  }
  if ((context as SpeciesContext).transform) {
    inLocalTransform(context, eye => {
      const native = eye as SpeciesContext;
      native.transform!(1, 0, 0, 2, 0, 0);
      eye.beginPath(); eye.arc(0, 0, 3, 0, TAU); setFill(eye, ink); eye.fill();
      eye.save(); eye.clip();
      native.transform!(1, 0, 0, 0.5, 0, 0);
      eye.beginPath(); eye.arc(gaze.x * 2, gaze.y * 4, 3, 0, TAU);
      setFill(eye, PALETTES.playerEyeLight); eye.fill(); eye.restore();
      eye.beginPath(); eye.arc(0, 0, 3, 0, TAU);
      setStroke(eye, ink); eye.setLineWidth(0.5); eye.stroke();
    }, 1, 0, x, y);
    return;
  }
  // Compatibility bridge only. Native-capable contexts preserve arc + CTM.
  setFill(context, ink); context.beginPath(); context.ellipse(x, y, 3, 6, 0, 0, TAU); context.fill();
  context.save(); context.clip(); context.beginPath();
  context.arc(x + gaze.x * 2, y + gaze.y * 4, 3, 0, TAU);
  setFill(context, PALETTES.playerEyeLight); context.fill(); context.restore();
  context.beginPath(); context.ellipse(x, y, 3, 6, 0, 0, TAU);
  setStroke(context, ink); context.setLineWidth(0.5); context.stroke();
}

/** Domain port of original1100 and eye690: state smoothing, action colours,
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
  if (state.eyeExpression < 1e-4) state.eyeExpression = 0;
  state.mouthCurve = playerSmooth(state.mouthCurve, mouthTarget, 0.6, delta);
  if (!dead) for (const gaze of state.gaze) {
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

  if (options.preserveContext) context.save();
  context.setLineCap('round'); context.setLineWidth(3);
  setFill(context, playerGray(body, grayscale)); setStroke(context, playerGray(outline, grayscale));
  context.beginPath();
  if (model === 1) {
    context.moveTo(25, 0); context.quadraticCurveTo(15, 35, 0, 25);
    context.quadraticCurveTo(-25, 15, -25, 0); context.quadraticCurveTo(-25, -35, 0, -25);
    context.quadraticCurveTo(18, -25, 25, 0); context.closePath();
  } else context.arc(0, 0, 25, 0, TAU);
  context.fill(); context.stroke();
  if (flags & 4) inLocal(context, decoration => {
    const remainder = f(51 - f(flash * 51));
    const channel = (value: number): number => Math.trunc(f(remainder + f(flash * value)));
    const color = playerGray(rgb(channel(flashTarget.r), channel(flashTarget.g), channel(flashTarget.b)), grayscale);
    decoration.setLineJoin('round'); setStroke(decoration, color); setFill(decoration, color);
    decoration.setLineWidth(3);
    for (const side of [-1, 1]) {
      decoration.beginPath(); decoration.moveTo(25, side * 5);
      decoration.quadraticCurveTo(40, side * 10, 50, side * 15);
      decoration.quadraticCurveTo(40, side * 5, 25, side * 5);
      decoration.closePath(); decoration.fill(); decoration.stroke();
    }
  }, 1, -Math.PI / 2, 0, 6);

  context.save();
  if (model === 0 && state.eyeExpression >= 1e-4) {
    context.beginPath(); context.moveTo(-14, -14);
    context.lineTo(0, f(f(state.eyeExpression * 9) - 14));
    context.lineTo(14, -14); context.lineTo(14, 6); context.lineTo(-14, 6);
    context.closePath(); context.clip();
  }
  if (model === 1) {
    inLocalTransform(context, eye => drawPlayerEye(eye, 0, 0, state.gaze[0], dead, ink), 1, Math.PI * 0.98, -10, -10);
    inLocalTransform(context, eye => drawPlayerEye(eye, 0, 0, state.gaze[1], dead, ink), 1, -Math.PI * 0.03, 10, 8);
  } else {
    drawPlayerEye(context, -7, -5, state.gaze[0], dead, ink);
    drawPlayerEye(context, 7, -5, state.gaze[1], dead, ink);
  }
  context.restore();
  let mouth = localContext(context, 1, 0, 0, 10);
  if (model === 1) mouth = localContext(mouth, 1, Math.PI / 5, -8, -3);
  mouth.beginPath(); mouth.moveTo(-6, 0); mouth.quadraticCurveTo(0, state.mouthCurve, 6, 0);
  setStroke(mouth, ink); mouth.setLineWidth(1.5); mouth.stroke();
  if (options.preserveContext) context.restore();
}

/** Persistent native renderer fields +792/+796/+800 (function763). */
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
/** Native491 explicitly zeros +792/+796/+800 (WAT 28313–28319).
 * A full red trail comes from prior frames or the visual's immediate flag. */
export function createPlayerHealthBarState(): PlayerHealthBarState {
  return { healthRatio: 0, trailingRatio: 0, alpha: 0 };
}

/** Native763 health layer, WAT 139656–141386. The caller owns the entity
 * transform and persistent state. Alpha eases once per rendered frame; ratio
 * easing uses elapsed milliseconds. Omitting state draws the settled ratios;
 * provide a per-entity state to reproduce damage/healing/fade history. */
export function drawPlayerHealthBar(context: Canvas2DContext, ratio: number,
  options: PlayerHealthBarOptions = {}): void {
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

// ---------------------------------------------------------------------------
// Petals and drops
// ---------------------------------------------------------------------------

/** Native catalogue colours, independent of rarity (rarity colours the tile). */
const petalColors: Readonly<Record<number, Rgb>> = {
  1: rgb(255,255,255), 2: rgb(255,255,255), 3: rgb(187,187,187), 4: rgb(119,119,119),
  5: rgb(255,232,105), 6: rgb(255,148,201), 7: rgb(51,51,51), 8: rgb(206,118,219),
  9: rgb(255,255,255), 10: rgb(51,51,51), 11: rgb(138,194,85), 12: rgb(206,118,219),
  13: rgb(56,199,95), 14: rgb(254,255,201), 15: rgb(255,148,201), 16: rgb(255,255,255),
  17: rgb(255,255,255), 18: rgb(255,255,255), 19: rgb(255,231,99), 20: rgb(255,255,255),
  21: rgb(180,56,199), 22: rgb(255,240,184), 23: rgb(255,240,184), 24: rgb(255,148,201),
  25: rgb(51,51,51), 26: rgb(51,51,51), 27: rgb(51,51,51), 28: rgb(255,255,255),
  29: rgb(255,255,255), 30: rgb(255,255,255), 31: rgb(247,207,47), 32: rgb(57,181,74),
  33: rgb(56,199,95), 34: rgb(206,118,219), 35: rgb(255,255,255), 36: rgb(255,255,255),
  37: rgb(255,255,255), 38: rgb(255,228,25),
};
export function petalColor(type: number): Rgb { return petalColors[type] ?? rgb(255,255,255); }

function petalPaint(context: Canvas2DContext, type: number, width = 3): void {
  const color = petalColor(type);
  setFill(context, color); setStroke(context, shade(color)); context.setLineWidth(width);
  context.fill(); context.stroke();
}
function petalDisc(context: Canvas2DContext, type: number, radius: number, x = 0, y = 0): void {
  context.beginPath(); context.arc(x, y, radius, 0, TAU); petalPaint(context, type);
}
function petalPolygon(context: Canvas2DContext, radius: number, sides: number, inset = 1): void {
  context.beginPath(); context.moveTo(radius, 0);
  for (let index = 1; index <= sides; index++) {
    const angle = index * TAU / sides;
    if (inset !== 1) {
      const middle = angle - Math.PI / sides;
      context.quadraticCurveTo(Math.cos(middle) * radius * inset, Math.sin(middle) * radius * inset,
        Math.cos(angle) * radius, Math.sin(angle) * radius);
    } else context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  context.closePath();
}

/** Recovered catalogue shapes. World instances and inventory icons have
 * different multiplicities (Twin/Triplet/Peas); neither is a generic disc.
 * Coordinates/colours are checked against the actual catalogue vtables in
 * client.wasm, not against the old eight-scene golden's social-media paths. */
function drawPetalShape(context: Canvas2DContext, type: number, _icon: boolean, _now: number, seed = type, phase = _now * 0.001): void {
  switch (type) {
    case 4: case 36: {
      // The original creates one irregular polygon per instance.
      const points = rockPoints(seed, type === 4 ? 14 : 12, type === 4 ? 5 : 7);
      context.beginPath(); points.forEach(([x,y], index) => index ? context.lineTo(x,y) : context.moveTo(x,y));
      context.closePath(); context.setLineJoin('round'); petalPaint(context, type); return;
    }
    case 5:
      context.beginPath(); context.rect(-10.60660171508789,-10.60660171508789,21.21320343017578,21.21320343017578);
      petalPaint(context,type,2.250000089406967); return;
    case 7: case 27: petalPolygon(context,7,3); petalPaint(context,type); return;
    case 9:
      inLocal(context, local => {
        local.beginPath(); local.arc(0,0,15,-Math.PI/2,Math.PI/2);
        local.quadraticCurveTo(10,0,0,-15); local.closePath(); petalPaint(local,type);
      }); return;
    case 10:
      context.setLineJoin('round');
      context.beginPath(); context.moveTo(11,0); context.lineTo(-11,-6); context.lineTo(-11,6); context.closePath();
      setFill(context, petalColor(type)); setStroke(context, petalColor(type)); context.setLineWidth(5);
      context.fill(); context.stroke(); return;
    case 11: case 12: case 34: {
      // Native3628/3649/4283: diagonal offsets, independent fill/stroke per
      // pea, and a persistent random initial phase in the world. Native4283
      // uses radius 10 and offset 7 for the Legendary cluster.
      const offset = type === 34 ? 7 : 6, radius = type === 34 ? 10 : 7;
      inLocal(context, local => {
        for (const [x, y] of [[offset, offset], [-offset, offset], [offset, -offset], [-offset, -offset]])
          inLocal(local, pea => petalDisc(pea, type, radius), 1, 0, x, y);
      }, 1, _icon ? 0 : Math.fround(phase));
      return;
    }
    case 13: case 21: case 33:
      petalPolygon(context,15,8,0.739103626); petalPaint(context,type);
      context.beginPath(); context.arc(0,0,8,0,TAU);
      setFill(context,type === 21 ? rgb(194,116,214) : rgb(116,214,143)); context.fill(); return;
    case 15:
      context.beginPath(); context.moveTo(10,0);
      for (let index=1;index<=3;index++) {
        const angle=index*TAU/3, mid=angle-Math.PI/3;
        context.quadraticCurveTo(Math.cos(mid)*20,Math.sin(mid)*20,Math.cos(angle)*10,Math.sin(angle)*10);
      }
      context.closePath(); petalPaint(context,type); return;
    case 16: case 17: petalDisc(context,type,7); return;
    case 18: {
      const alpha=context.getGlobalAlpha?.() ?? 1;
      context.setGlobalAlpha(alpha*0.7); context.beginPath();context.arc(0,0,12,0,TAU);
      context.setLineWidth(3);setStroke(context,rgb(255,255,255));context.stroke();
      context.setGlobalAlpha(alpha*0.35);setFill(context,rgb(255,255,255));
      context.beginPath();context.arc(0,0,10.5,0,TAU);context.fill();
      context.beginPath();context.arc(4,-4,3,0,TAU);context.fill();context.setGlobalAlpha(alpha);return;
    }
    case 20:
      context.setLineCap('round');context.setLineWidth(7);setStroke(context,rgb(51,51,51));
      context.beginPath();context.moveTo(0,0);context.lineTo(-16,0);context.stroke();petalDisc(context,type,9);return;
    case 22: case 23:
      context.beginPath();context.ellipse(0,0,type===22?11:13,type===22?15:17,0,0,TAU);
      petalPaint(context,type);return;
    case 25:
      context.setLineJoin('round');
      context.setLineCap('round');
      inLocal(context, local=>{
        for(const sign of [-1,1]) {
          local.beginPath();local.moveTo(25,sign*5);local.quadraticCurveTo(40,sign*10,50,sign*15);
          local.quadraticCurveTo(40,sign*5,25,sign*5);local.closePath();
          setFill(local,petalColor(type));setStroke(local,petalColor(type));local.setLineWidth(3);local.fill();local.stroke();
        }
      },1,-Math.PI/2,0,35);return;
    case 26:
      petalDisc(context,type,16);context.beginPath();context.arc(6,-6,4.6,0,TAU);
      setFill(context,rgb(204,204,204));context.fill();return;
    case 28:
      context.setLineCap('round');context.setLineWidth(3);
      context.beginPath();context.arc(0,0,12,0,TAU);context.setFillRgb(255,255,255);context.fill();
      context.beginPath();context.arc(0,0,12,-Math.PI/2,Math.PI/2);setFill(context,rgb(51,51,51));context.fill();
      for(const [y,color] of [[6,51],[-6,255]]) {context.beginPath();context.arc(0,y,6,0,TAU);context.setFillRgb(color,color,color);context.fill();}
      for(const [start,end,color] of [[-Math.PI/2,0,41],[Math.PI/2,-Math.PI/2,207],[0,Math.PI/2,41]]) {
        context.beginPath();context.arc(0,0,12,start,end);context.setStrokeRgb(color,color,color);context.stroke();
      }
      for(const [y,start,end,color] of [[6,Math.PI/2,-Math.PI/2,41],[-6,-Math.PI/2,Math.PI/2,207]]) {
        context.beginPath();context.arc(0,y,6,start,end);context.setStrokeRgb(color,color,color);context.stroke();
      }return;
    case 29: case 30: petalPolygon(context,11,5,0.4854101966);petalPaint(context,type);return;
    case 31: petalPolygon(context,11,6);petalPaint(context,type);return;
    case 32:
      context.setLineCap('round');context.setLineWidth(3);setStroke(context,shade(petalColor(type)));
      context.beginPath();context.moveTo(-15,0);context.lineTo(-20,0);context.stroke();
      context.beginPath();context.moveTo(-15,0);context.bezierCurveTo(-10,-12,5,-12,15,0);
      context.bezierCurveTo(5,12,-10,12,-15,0);context.closePath();petalPaint(context,type);
      context.beginPath();context.moveTo(-9,0);context.quadraticCurveTo(0,-1.5,7.5,0);context.stroke();return;
    case 37:
      context.setLineCap('round');context.beginPath();context.moveTo(-8,0);context.quadraticCurveTo(0,-3,8,0);
      context.setLineWidth(10);context.setStrokeRgb(207,207,207);context.stroke();
      context.setLineWidth(4);context.setStrokeRgb(255,255,255);context.stroke();return;
    case 38:
      context.beginPath();context.moveTo(-5,8);context.quadraticCurveTo(-15,-8,0,-8);
      context.quadraticCurveTo(15,-8,5,8);context.quadraticCurveTo(0,2,-5,8);context.closePath();petalPaint(context,type);return;
    default: petalDisc(context,type,PETAL_INFO[type]?.radius ?? 10);
  }
}

export function drawPetalInstance(context: Canvas2DContext, type: number, radius = PETAL_INFO[type]?.radius ?? 10, now = 0, seed = type, phase?: number): void {
  if (!type || !PETAL_INFO[type]) return;
  const base = PETAL_INFO[type]?.radius ?? 10;
  const scale = Number.isFinite(radius) && radius > 0 ? radius / base : 1;
  const draw = (local: Canvas2DContext): void => drawPetalShape(local,type,false,now,seed,phase);
  if (type === 9) inLocal(context,draw,scale,now * 0.01);
  else if (type === 5) inLocal(context,draw,scale,phase ?? now * 0.0003);
  else if (scale===1) draw(context);
  else inLocal(context,draw,scale);
}

/** Native760 component+108. Hornet projectiles have their own fixed 1.3
 * transform, round caps/joins and 5-unit stroke, independent of collider size. */
export function drawHornetMissile(context: Canvas2DContext, flash = 0): void {
  inLocal(context, local => {
    local.setLineCap('round'); local.setLineJoin('round'); local.setLineWidth(5);
    const color = flashColor(rgb(51,51,51), flash);
    setFill(local, color); setStroke(local, color);
    local.beginPath(); local.moveTo(11,0); local.lineTo(-11,-6); local.lineTo(-11,6);
    local.closePath(); local.fill(); local.stroke();
  }, Math.fround(1.3));
}

/** Split Peas use native760 component+68, not the catalogue cluster. */
export function drawLaunchedPea(context: Canvas2DContext, type: number, flash = 0,
  flags = type === 34 ? 3 : type === 12 ? 1 : 0): void {
  const color = flashColor(petalColor(flags & 1 ? 12 : 11), flash);
  context.beginPath(); context.arc(0,0,flags & 2 ? 10 : 7,0,TAU);
  setFill(context,color); context.fill(); setStroke(context,shade(color));
  context.setLineWidth(3); context.stroke();
}

/** Native760 component+92: five scalloped rings and thirteen 55-unit spokes.
 * The original caches this path in a 120-unit bitmap. Keep its actual geometry
 * here so a ground Web can never be scaled into a collider-sized Missile. */
export function drawGroundWeb(context: Canvas2DContext, progress = 1): void {
  const f = Math.fround, step = TAU / 13;
  inLocal(context, local => {
    local.setGlobalAlpha((local.getGlobalAlpha?.() ?? 1) * progress * 0.5);
    local.setLineJoin('round'); local.setLineCap('round'); local.setLineWidth(3);
    local.setStrokeRgb(255,255,255); local.beginPath();
    const point = (index: number, radius: number): readonly [number,number] => {
      const angle = f(index * step);
      return [f(f(Math.cos(angle)) * radius), f(f(Math.sin(angle)) * radius)];
    };
    for (let radius = 10; radius <= 50; radius += 10) {
      local.moveTo(radius,0);
      for (let index = 0; index < 13; index++) {
        const a = point(index,radius), b = point(index+1,radius);
        const x = f(a[0]+b[0]), y = f(a[1]+b[1]), length = f(Math.sqrt(x*x+y*y));
        local.quadraticCurveTo(f(f(x*0.5)-f(f(x/length)*5)), f(f(y*0.5)-f(f(y/length)*5)), b[0],b[1]);
      }
      local.closePath();
    }
    for (let index = 0; index < 13; index++) { local.moveTo(0,0); local.lineTo(...point(index,55)); }
    local.stroke();
  }, Math.fround(progress));
}
export function drawPetalIcon(context: Canvas2DContext, type: number, scale = 1): void {
  const info = PETAL_INFO[type]; if (!type || !info) return;
  const angle = [5,9,10,11,12,20,29,30,34].includes(type) ? 1 : type === 32 ? -1 : type === 37 || type === 38 ? 0.7 : 0;
  if (info.instances === 1 && angle === 0 && scale === 1) {
    drawPetalShape(context,type,true,0); return;
  }
  inLocal(context,local=>{
    if (info.instances > 1) for (let index = 0; index < info.instances; index++) {
      const phase = Math.fround(index * 6.283185 / info.instances);
      // Native587 translates the group first. Each catalogue visual then
      // applies its own icon rotation, preserving the cluster's orientation.
      inLocal(local,part=>drawPetalShape(part,type,true,0),1,angle,
        Math.fround(Math.fround(Math.cos(phase)) * 10), Math.fround(Math.fround(Math.sin(phase)) * 10));
    } else inLocal(local,part=>drawPetalShape(part,type,true,0),1,angle);
  },scale);
}

/** Native pickup visual owned by the world marker, separate from its HUD
 * transfer. A newly spawned pickup grows/spins in; a scene's existing pickups
 * start at full size. The protocol's flags&128 distinguishes those cases. */
export interface DropVisualState {
  progress: number;
  readonly phase: number;
  readonly createdAt: number;
  now: number;
}
const dropLabelOwners = new WeakMap<Readonly<DropVisualState>, string>();
let nextDropLabelOwner = 0;
function dropLabelOwner(state: Readonly<DropVisualState>): string {
  let owner = dropLabelOwners.get(state);
  if (owner === undefined) {
    owner = `pickup:${nextDropLabelOwner++}`;
    dropLabelOwners.set(state, owner);
  }
  return owner;
}
export function createDropVisualState(now: number, fresh = false, phase = 0): DropVisualState {
  return { progress: fresh ? 0 : 1, phase: Math.fround(phase), createdAt: now, now };
}
export function advanceDropVisualState(state: DropVisualState, now: number, deltaMs: number, collected = false): void {
  const target = collected ? 0 : 1;
  const step = Math.max(0, Math.min(1, 1 - Math.pow(0.8, Math.fround(deltaMs) * 0.06)));
  state.progress = Math.fround(Math.abs(state.progress - target) < 1e-7 ? target
    : state.progress + (target - state.progress) * step);
  state.now = now;
}

/** func763's pickup pass draws a black square rim around a rarity card.
 * func587 supplies that card, the catalogue icon and its outlined name.
 * The old radius/age arguments remain usable for isolated artwork fixtures;
 * live world rendering supplies the retained native state on every frame. */
export function drawDrop(context: Canvas2DContext, type: number, _radius = 14, ageMs = Infinity,
                         visual?: Readonly<DropVisualState>): void {
  const info = PETAL_INFO[type];
  if (!info || !type) return;
  const f = Math.fround;
  const progress = visual?.progress ?? (Number.isFinite(ageMs)
    ? f(1 - Math.pow(0.8, Math.max(0, ageMs) * 0.06)) : 1);
  const elapsed = visual ? visual.now - visual.createdAt : 0;
  const pulse = f(Math.sin(elapsed * 0.01) * 0.03 + 1);
  const scale = f(f(progress * pulse) * f(50 / 70));
  const angle = progress * 4 * Math.PI + (visual?.phase ?? 0);
  context.save();
  const inherited = context.getGlobalAlpha?.() ?? 1;
  const alpha = inherited * f(Math.sqrt(progress));
  context.setGlobalAlpha(alpha);
  // Keep the three native f32 scale stores separate before rotating. Folding
  // them into one scale changes the marker matrix during its arrival frames.
  let local: Canvas2DContext;
  if (context.transform) {
    local = localContext(context, progress);
    local = localContext(local, pulse);
    local = localContext(local, f(50 / 70));
    local = localContext(local, 1, angle);
  } else local = localContext(context, scale, angle);
  local.setLineJoin('round');
  local.setLineWidth(70 / 12);
  local.beginPath(); local.rect(-36, -36, 72, 72);
  local.setStrokeRgb(0, 0, 0); local.setGlobalAlpha(alpha * 0.2); local.stroke();
  local.setGlobalAlpha(alpha);
  drawPetalCard(local, type, 70, visual ? dropLabelOwner(visual) : undefined);
  context.restore();
}

/** Native func587 card shared by pickups and both galleries. */
export function drawPetalCard(context: Canvas2DContext, type: number, size = 60, owner?: string): void {
  const info = PETAL_INFO[type];
  if (!info || !type) return;
  const f = Math.fround, local = context;
  const rarity = info.rarity;
  const color = rgb(Number(245047318478718n >> BigInt(rarity * 8) & 255n),
    Number(34218529646319n >> BigInt(rarity * 8) & 255n),
    Number(111187557834093n >> BigInt(rarity * 8) & 255n));
  const line = f(size / 12), side = f(size - line);
  local.setLineJoin('round');
  setFill(local, color); fillArtRectangle(local, -side / 2, -side / 2, side, side);
  local.beginPath(); local.rect(-side / 2, -side / 2, side, side);
  local.setLineWidth(line); setStroke(local, shade(color)); local.stroke();
  inLocal(local, artwork => drawPetalIcon(artwork, type), f(size / 70), 0, 0, f(-size / 14));
  const matrix = local.getTransform?.() ?? [1, 0, 0, 1, 0, 0];
  // func391's +36 label font is smaller for the four long names.
  const nameFont = type === 20 ? 11 : [25, 26, 28].includes(type) ? 12 : 14;
  drawLabel(local, { text: info.name, font: f(f(nameFont * size) / 70),
    rasterScale: Math.fround(Math.max(...matrix.slice(0, 4).map(Math.abs)) * 2.4),
    cacheKey: owner }, 0, f(f(size * .5) + size * (-18 / 70)));
}
// ---------------------------------------------------------------------------
// Species artwork. Evidence: entity-renderer.mjs render priority and client.wat
// 614/615/616/782/785/1038–1045. These are domain shapes, not recorded handles.
// drawWorld owns the outer entity transform and its save/restore pair.
// ---------------------------------------------------------------------------

/** Optional bridge additions. The primitive-only bridge remains usable; its
 * compatibility path bakes local similarity transforms into coordinates.
 * Native path/transform support preserves the original Canvas command kinds. */
export interface SpeciesPath {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number, ccw?: boolean): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
}
/** Logical f32 matrix, including changes not yet flushed to Canvas. */
export type ArtMatrix = readonly [number, number, number, number, number, number];
type SpeciesContext = Canvas2DContext & {
  transform?: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  getTransform?: () => ArtMatrix;
  createPath?: () => SpeciesPath;
  setMiterLimit?: (limit: number) => void;
  getGlobalAlpha?: () => number;
};
const f32 = Math.fround;
const positiveRadius = (radius: number, fallback: number): number => {
  const rounded = f32(radius);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
};
const finiteTime = (now: number): number => Number.isFinite(now) ? now : 0;
const style = (context: Canvas2DContext, color: Rgb): void => {
  setFill(context, color);
  setStroke(context, shade(color));
};
const disc = (context: Canvas2DContext, x: number, y: number, radius: number, stroke = true): void => {
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fill();
  if (stroke) context.stroke();
};

/** Similarity transforms only (all species' internal transforms are uniform
 * scale/rotation/translation). Never substitute ellipse for a native arc when
 * the bridge offers transform(). No screen-space assumptions live here. */
function localContext(context: Canvas2DContext, scale = 1, angle = 0, x = 0, y = 0): Canvas2DContext {
  if (scale === 1 && angle === 0 && x === 0 && y === 0) return context;
  const cosine = f32(Math.cos(angle)), sine = f32(Math.sin(angle));
  const a = f32(scale * cosine), b = f32(scale * sine);
  const native = context as SpeciesContext;
  if (native.transform) {
    native.transform(a, b, -b, a, x, y);
    return context;
  }
  const point = (px: number, py: number): [number, number] => [a * px - b * py + x, b * px + a * py + y];
  // Proxy only the geometric calls; everything else retains its receiver.
  const methods: Partial<Canvas2DContext> = {
    moveTo: (px, py) => context.moveTo(...point(px, py)),
    lineTo: (px, py) => context.lineTo(...point(px, py)),
    quadraticCurveTo: (cx, cy, px, py) => context.quadraticCurveTo(...point(cx, cy), ...point(px, py)),
    bezierCurveTo: (cx, cy, dx, dy, px, py) => context.bezierCurveTo(...point(cx, cy), ...point(dx, dy), ...point(px, py)),
    arc: (px, py, r, start, end, ccw) => context.arc(...point(px, py), r * scale, start + angle, end + angle, ccw),
    ellipse: (px, py, rx, ry, rotation, start, end, ccw) => context.ellipse(...point(px, py), rx * scale, ry * scale, rotation + angle, start, end, ccw),
    setLineWidth: width => context.setLineWidth(width * scale),
    fillRect: (px, py, width, height) => {
      if (angle === 0) { context.fillRect(...point(px, py), width * scale, height * scale); return; }
      context.beginPath();
      context.moveTo(...point(px, py)); context.lineTo(...point(px + width, py));
      context.lineTo(...point(px + width, py + height)); context.lineTo(...point(px, py + height));
      context.closePath(); context.fill();
    },
  };
  return new Proxy(context, { get(target, key) {
    if (key === 'createPath') return undefined; // scaled primitives must replay their path
    const method = methods[key as keyof Canvas2DContext];
    if (method) return method;
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
function inLocal(context: Canvas2DContext, draw: (local: Canvas2DContext) => void,
  scale = 1, angle = 0, x = 0, y = 0): void {
  context.save();
  draw(localContext(context, scale, angle, x, y));
  context.restore();
}

/** Native690 saves only the logical matrix around each eye; Canvas state is
 * saved solely for the pupil clip and the enclosing face expression pass. */
function inLocalTransform(context: Canvas2DContext, draw: (local: Canvas2DContext) => void,
  scale = 1, angle = 0, x = 0, y = 0): void {
  const native = context as SpeciesContext;
  if (!native.transform || !native.getTransform) {
    inLocal(context, draw, scale, angle, x, y);
    return;
  }
  const matrix: ArtMatrix = [...native.getTransform()];
  draw(localContext(context, scale, angle, x, y));
  context.setTransform(...matrix);
}

/** Original410 composes every rectangle from the same caller matrix and
 * restores it without a Canvas save. Expanded zero products retain native
 * f32 grouping (including signed zero and nonfinite propagation). */
function fillArtRectangle(context: Canvas2DContext, x: number, y: number, width: number, height: number): void {
  const native = context as SpeciesContext;
  if (!native.transform || !native.getTransform) { context.fillRect(x, y, width, height); return; }
  const matrix: ArtMatrix = [...native.getTransform()];
  const [A, B, C, D, E, F] = matrix, f = Math.fround;
  x = f(x); y = f(y); width = f(width); height = f(height);
  const tx = f(E + f(f(A * x) + f(C * y))), ty = f(F + f(f(B * x) + f(D * y)));
  const a = f(f(A + f(C * 0)) + f(E * 0)), c = f(f(f(A * 0) + C) + f(E * 0));
  const b = f(f(B + f(D * 0)) + f(F * 0)), d = f(f(f(B * 0) + D) + f(F * 0));
  const zeroA = f(a * 0), zeroB = f(b * 0), zeroC = f(c * 0), zeroD = f(d * 0);
  context.setTransform(f(f(tx * 0) + f(f(a * width) + zeroC)),
    f(f(f(b * width) + zeroD) + f(ty * 0)),
    f(f(tx * 0) + f(zeroA + f(c * height))),
    f(f(zeroB + f(d * height)) + f(ty * 0)),
    f(tx + f(zeroA + zeroC)), f(ty + f(zeroB + zeroD)));
  context.fillRect(0, 0, 1, 1);
  context.setTransform(...matrix);
}

function artRandom(handle: number): () => number {
  let state = (((handle & 0x3fff) ^ (handle >>> 14)) >>> 0) % 2147483647 || 1;
  return () => { state = state * 48271 % 2147483647; return state; };
}
/** Component96 consumes three independent minstd_rand values per spot. */
export function ladybugSpots(handle: number, radius = 30): readonly (readonly [number, number, number])[] {
  const next = artRandom(handle);
  return Array.from({ length: radius > 30 ? 5 : 3 }, () => [
    f32(f32(f32(next() - 1) * (50 / 2147483648)) - 25),
    f32(f32(f32(next() - 1) * (50 / 2147483648)) - 25),
    f32(f32(f32(next() - 1) * (7 / 2147483648)) + 3),
  ] as const);
}
const ladybugPaths = new WeakMap<Canvas2DContext, SpeciesPath>();
function traceLadybugBody(path: SpeciesPath): void {
  // Native static path constants, including the f32 -> f64 promotion.
  path.arc(0, 0, 30, 0.6000000238418579, 5.683185283337728, false);
  path.quadraticCurveTo(10, 0, 24.760068893432617, 16.939273834228516);
  path.closePath();
}
function usePath(context: Canvas2DContext, path: SpeciesPath | undefined,
  trace: (path: SpeciesPath) => void, operation: 'fill' | 'stroke' | 'clip'): void {
  if (path) (context[operation] as (path: SpeciesPath) => void)(path);
  else { context.beginPath(); trace(context); context[operation](); }
}
/** Component96: red, dark red and yellow shells; massive uses radius/30 and
 * five spots. Outlines shade the flashed fill instead of flashing the rim. */
export function drawLadybug(context: Canvas2DContext, handle: number, flash = 0, radius = 30, species = 4): void {
  radius = positiveRadius(radius, 30);
  context = localContext(context, f32(radius / 30));
  const dark = flashGrey(17, flash);
  const body = flashColor(species === 20 ? rgb(150, 41, 33) : species === 21 ? rgb(235, 235, 52) : PALETTES.ladybugBody, flash);
  const spots = flashColor(species === 20 ? rgb(190, 52, 42) : PALETTES.ladybugDark, flash);
  context.setLineWidth(7); context.setLineJoin('round');
  style(context, dark); disc(context, 15, 0, 15);
  style(context, body);
  let path = ladybugPaths.get(context);
  if (!path && (context as SpeciesContext).createPath) {
    path = (context as SpeciesContext).createPath!(); traceLadybugBody(path); ladybugPaths.set(context, path);
  }
  usePath(context, path, traceLadybugBody, 'fill');
  context.save();
  usePath(context, path, traceLadybugBody, 'clip');
  style(context, spots);
  for (const [x, y, r] of ladybugSpots(handle, radius)) disc(context, x, y, r, false);
  context.restore();
  usePath(context, path, traceLadybugBody, 'stroke');
}

/** Native constant-grey palettes fold their remainder to base - weight * base.
 * Reassociating it as (1 - weight) * base changes truncated f32 colours. */
function flashGrey(base: number, flash: number): Rgb {
  if (!(flash > 0)) return rgb(base, base, base);
  const weight = f32(Math.min(1, flash)), remainder = f32(base - f32(weight * base));
  const red = Math.trunc(f32(f32(weight * 255) + remainder));
  const other = Math.trunc(f32(remainder + f32(weight * (weight >= 0.9 ? 255 : 0))));
  return rgb(red, other, other);
}
function drawStripedBug(context: Canvas2DContext, flash: number, hornet: boolean): void {
  const dark = flashGrey(51, flash);
  // Native1040/1044 keep the yellow body's red channel at a constant 255.
  const body = { ...flashColor(hornet ? PALETTES.hornetBody : PALETTES.beeBody, flash), r: 255 };
  const outline = flashColor(hornet ? PALETTES.hornetOutline : PALETTES.beeOutline, flash);
  context.setLineWidth(5); context.setLineJoin('round'); context.setLineCap('round');
  setFill(context, dark); setStroke(context, hornet ? dark : shade(dark));
  context.beginPath();
  context.moveTo(hornet ? -47 : -37, 0); context.lineTo(-25, hornet ? -6 : -9);
  context.lineTo(-25, hornet ? 6 : 9); context.closePath(); context.fill(); context.stroke();
  context.beginPath(); context.ellipse(0, 0, 30, 20, 0, 0, TAU);
  setFill(context, body); context.fill();
  context.save(); context.clip(); setFill(context, dark);
  // Native function410 rectangles are drawn from right to left.
  const native = context as SpeciesContext;
  if (native.transform && !native.getTransform) {
    // Legacy bridges cannot restore a logical matrix without a Canvas save.
    // Keep their previous trace structure; exact native410 f32 composition
    // requires the read-only logical-matrix hook above.
    native.transform(10, 0, 0, 40, 10, -20); context.fillRect(0, 0, 1, 1);
    native.transform(1, 0, 0, 1, -2, 0); context.fillRect(0, 0, 1, 1);
    native.transform(1, 0, 0, 1, -2, 0); context.fillRect(0, 0, 1, 1);
  } else for (const x of [10, -10, -30]) fillArtRectangle(context, x, -20, 10, 40);
  context.restore();
  context.beginPath(); context.ellipse(0, 0, 30, 20, 0, 0, TAU);
  setStroke(context, outline); context.stroke();
  setStroke(context, dark); setFill(context, dark); context.setLineWidth(3);
  for (const side of [-1, 1]) {
    context.beginPath(); context.moveTo(25, side * 5);
    context.quadraticCurveTo(hornet ? 40 : 35, side * (hornet ? 10 : 5), hornet ? 50 : 40, side * 15);
    if (hornet) {
      context.quadraticCurveTo(40, side * 5, 25, side * 5);
      context.closePath(); context.fill(); context.stroke();
    } else { context.stroke(); disc(context, 40, side * 15, 5, false); }
  }
}
export function drawBee(context: Canvas2DContext, flash = 0): void { drawStripedBug(context, flash, false); }
/** Component132 applies its own scale(1.3), irrespective of the wire radius. */
export function drawHornet(context: Canvas2DContext, flash = 0): void {
  drawStripedBug(localContext(context, 1.2999999523162842), flash, true);
}

/** Time at rest follows the original slow cosine; movement uses the fast
 * cosine. Motion input is optional because drawSpecies's six-argument API
 * cannot infer displacement or attack flags from a wire handle. */
export function insectWave(now: number, activity = 0): number {
  const time = finiteTime(now);
  const slow = f32(0.5 - Math.cos(time * 0.01) * 0.5);
  const fast = f32(0.5 - Math.cos(time * 0.03) * 0.5);
  return f32(Math.max(0, Math.min(1, activity)) * (fast - slow) + slow);
}
function antWings(context: Canvas2DContext, now: number, size: number, flash: number, activity: number): void {
  inLocal(context, wingContext => {
    wingContext.setGlobalAlpha(((wingContext as SpeciesContext).getGlobalAlpha?.() ?? 1) * 0.5);
    const light = flashGrey(238, flash);
    setFill(wingContext, light); setStroke(wingContext, light);
    const wave = insectWave(now, activity);
    for (const side of [-1, 1]) {
      inLocal(wingContext, wing => {
        wing.beginPath(); wing.ellipse(-7, side * 8, 15, 7, -side * f32(Math.PI / 10), 0, TAU); wing.fill();
      }, size, side * wave * Math.PI / 10);
    }
  });
}
/** Components84 / 676 / 779 / 1037: all ants share grey palettes. Body
 * radii/offsets are component geometry, not each species' collision radius. */
export function drawAnt(context: Canvas2DContext, _handle: number, _radius = 14, species = 7, now = 0, flash = 0, activity = 0): void {
  context.setLineWidth(7); context.setLineJoin('round'); context.setLineCap('round');
  const body = flashGrey(85, flash);
  const stage = species - 7;
  if (stage === 1 || stage === 2) { style(context, body); disc(context, -8, 0, 10); }
  if (stage === 3) {
    style(context, body); disc(context, -25, 0, 30); style(context, body); disc(context, 0, 0, 25);
  }
  if (stage >= 2) antWings(context, now, stage === 3 ? 2 : 1, flash, activity);
  const headX = stage === 3 ? 25 : stage > 0 ? 8 : 0;
  const size = stage === 3 ? 1.5 : 1;
  const head = localContext(context, 1, 0, headX, 0);
  setStroke(head, shade(flashGrey(51, flash)));
  const wave = insectWave(now, activity), endY = f32(5 - wave), controlY = f32(10 - wave);
  for (const side of [-1, 1]) {
    head.beginPath(); head.moveTo(0, side * f32(size * 7));
    head.quadraticCurveTo(f32(size * 11), side * f32(size * controlY), f32(size * 22), side * f32(size * endY)); head.stroke();
  }
  style(head, body); disc(head, 0, 0, f32(size * 14));
}

/** Component60: two canonical uniform doubles per vertex, four RNG samples.
 * Keep f32 trig and multiplication boundaries from native785. */
export function rockPoints(handle: number, radius: number, vertices?: number): readonly (readonly [number, number])[] {
  const next = artRandom(handle);
  const jitter = (): number => {
    const low = next() - 1, high = next() - 1;
    return (high * 2147483646 + low) * 4.336808698019955e-20 + 0.85;
  };
  radius = positiveRadius(radius, 25);
  const count = vertices ?? Math.trunc(radius / 7 + 3);
  const points: [number, number][] = [];
  for (let index = 0; index < count; index++) {
    const angle = f32(index * TAU / count), xJitter = jitter(), yJitter = jitter();
    points.push([f32(xJitter * f32(radius * f32(Math.cos(angle)))), f32(yJitter * f32(radius * f32(Math.sin(angle))))]);
  }
  return points;
}
// Native785 stores a Path2D in component60 +8, built once from seed/radius.
// Intern procedural geometry per context with a bounded cache; no captured
// entity identities or paint commands are used as artwork fixtures.
const rockPathCache = new WeakMap<Canvas2DContext, Map<string, SpeciesPath>>();
export function drawRock(context: Canvas2DContext, handle: number, radius: number, flash = 0): void {
  const native = context as SpeciesContext;
  radius = positiveRadius(radius, 25);
  const seed = (((handle >>> 0) & 0x3fff) ^ ((handle >>> 0) >>> 14)) % 2147483647 || 1;
  const key = `${seed}:${radius}`;
  let path = rockPathCache.get(context)?.get(key);
  if (!path && native.createPath) {
    path = native.createPath();
    rockPoints(handle, radius).forEach(([x, y], index) => {
      if (index) path!.lineTo(x, y); else path!.moveTo(x, y);
    });
    path.closePath();
    let cache = rockPathCache.get(context);
    if (!cache) { cache = new Map(); rockPathCache.set(context, cache); }
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, path);
  }
  context.setLineWidth(7); context.setLineJoin('round');
  style(context, flashGrey(119, flash));
  if (path) {
    context.fill(path as Path2D); context.stroke(path as Path2D);
  } else {
    context.beginPath();
    rockPoints(handle, radius).forEach(([x, y], index) => { if (index) context.lineTo(x, y); else context.moveTo(x, y); });
    context.closePath(); context.fill(); context.stroke();
  }
}

/** Component128: rounded polygon with a dark, miter-joined inset star. */
export function cactusPaths(radius: number): { outer: (path: SpeciesPath) => void; inset: (path: SpeciesPath) => void } {
  radius = positiveRadius(radius, 50);
  const count = Math.trunc(radius / 7 + 3);
  const point = (i: number): [number, number] => {
    const angle = f32(i * TAU * (1 / count));
    return [f32(radius * f32(Math.cos(angle))), f32(radius * f32(Math.sin(angle)))];
  };
  return {
    outer(path) {
      path.moveTo(...point(0));
      for (let i = 1; i <= count; i++) {
        const [x, y] = point(i), [px, py] = point(i - 1);
        path.quadraticCurveTo(f32(f32(x + px) * 0.45), f32(f32(y + py) * 0.45), x, y);
      }
      path.closePath();
    },
    inset(path) {
      for (let i = 0; i < count; i++) {
        const [x, y] = point(i), [nx, ny] = point(i + 1);
        if (i) path.lineTo(x, y); else path.moveTo(x, y);
        path.lineTo(f32(f32(x + nx) * 0.25), f32(f32(y + ny) * 0.25));
      }
      path.closePath();
    },
  };
}
const cactusPathCache = new WeakMap<Canvas2DContext, Map<number, { outer: SpeciesPath; inset: SpeciesPath }>>();
export function drawCactus(context: Canvas2DContext, radius: number, _now = 0, flash = 0): void {
  radius = positiveRadius(radius, 50);
  const geometry = cactusPaths(radius), native = context as SpeciesContext;
  let cached = cactusPathCache.get(context)?.get(radius);
  if (!cached && native.createPath) {
    cached = { outer: native.createPath(), inset: native.createPath() };
    geometry.outer(cached.outer); geometry.inset(cached.inset);
    let cache = cactusPathCache.get(context);
    if (!cache) { cache = new Map(); cactusPathCache.set(context, cache); }
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(radius, cached);
  }
  context.setLineWidth(7); context.setLineJoin('miter'); native.setMiterLimit?.(10);
  setStroke(context, shade(flashGrey(51, flash)));
  usePath(context, cached?.inset, geometry.inset, 'stroke');
  context.setLineJoin('round'); style(context, flashColor(PALETTES.cactusBody, flash));
  usePath(context, cached?.outer, geometry.outer, 'fill');
  usePath(context, cached?.outer, geometry.outer, 'stroke');
}

/** Component88: three filled, concentric soil discs, with no rim. */
export function drawAntHole(context: Canvas2DContext, flash = 0): void {
  context.setLineWidth(7); context.setLineJoin('round'); context.setLineCap('round');
  for (const [radius, color] of [[45, rgb(181, 133, 0)], [30, rgb(148, 109, 0)], [15, rgb(107, 79, 0)]] as const) {
    setFill(context, flashColor(color, flash)); disc(context, 0, 0, radius, false);
  }
}
/** Component104: animated front mandibles, a purple shell, seam, six spots. */
export function drawBeetle(context: Canvas2DContext, radius = 40, nowOrLegacyColor: number | Rgb = 0, flash = 0, activity = 0): void {
  const now = typeof nowOrLegacyColor === 'number' ? nowOrLegacyColor : 0;
  context = localContext(context, f32(positiveRadius(radius, 40) * 0.025));
  context.setLineCap('round'); context.setLineJoin('round');
  const dark = flashGrey(51, flash), body = flashColor(rgb(144, 93, 176), flash), outline = shade(body);
  for (const side of [-1, 1]) {
    inLocal(context, mandible => {
      mandible.beginPath(); mandible.moveTo(-10, side * -15);
      mandible.quadraticCurveTo(15, side * -30, 35, side * -15);
      mandible.quadraticCurveTo(15, side * -20, -10, side * -5); mandible.closePath();
      setFill(mandible, dark); setStroke(mandible, dark); mandible.setLineWidth(7); mandible.fill(); mandible.stroke();
    }, 1, side * 0.2 * insectWave(now, activity), 35, 0);
  }
  context.beginPath(); context.moveTo(0, -30);
  context.quadraticCurveTo(40, -30, 40, 0); context.quadraticCurveTo(40, 30, 0, 30);
  context.quadraticCurveTo(-40, 30, -40, 0); context.quadraticCurveTo(-40, -30, 0, -30); context.closePath();
  setFill(context, body); setStroke(context, outline); context.setLineWidth(7); context.fill(); context.stroke();
  context.beginPath(); context.moveTo(-20, 0); context.quadraticCurveTo(0, -3, 20, 0);
  setStroke(context, outline); context.setLineWidth(7); context.stroke(); setFill(context, outline);
  for (const [x, y] of [[-17, -12], [-17, 12], [0, -15], [0, 15], [17, -12], [17, 12]]) disc(context, x, y, 5, false);
}
/** Component124 represents one segment. Head antennae are present only for
 * ids15/17; ownership and world transforms place ids16/18 along the chain. */
export function drawCentipede(context: Canvas2DContext, species: number, flash = 0): void {
  const dark = flashGrey(51, flash);
  const body = flashColor(species === 17 || species === 18 ? rgb(144, 93, 176) : rgb(138, 194, 85), flash);
  context.setLineWidth(7); context.setLineJoin('round'); context.setLineCap('round');
  setFill(context, dark); disc(context, 0, -30, 15, false); disc(context, 0, 30, 15, false);
  style(context, body); disc(context, 0, 0, 35);
  if (species === 16 || species === 18) return;
  setStroke(context, dark); setFill(context, dark); context.setLineWidth(3);
  for (const side of [-1, 1]) {
    context.beginPath(); context.moveTo(25, side * 10);
    context.quadraticCurveTo(45, side * 10, 55, side * 30); context.stroke(); disc(context, 55, side * 30, 5, false);
  }
}
/** Component64's eight quadratic legs. `phase` is accumulated movement (not
 * an arbitrary handle hash); use 0 at rest. drawSpecies exposes a stable pose.
 * Call drawSpider with accumulated phase when the caller tracks motion. */
export function drawSpider(context: Canvas2DContext, phase = 0, flash = 0): void {
  context.setLineWidth(5); context.setLineJoin('round'); context.setLineCap('round');
  // Native spider legs deliberately do not participate in hit flashing.
  setStroke(context, rgb(51, 51, 51));
  const wavePhase = f32(finiteTime(phase) * 0.015);
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const cosine = f32(Math.cos(f32(wavePhase + f32((side + i) * Math.PI / 2))));
    const wave = f32(0.5 - cosine * 0.5);
    let angle = f32(i * 0.6 - 0.9 + f32(wave + wave - 1) * 0.2);
    if (side === -1) angle = f32(-Math.PI - angle);
    const x = f32(f32(Math.sin(angle)) * 35), y = f32(f32(Math.cos(angle)) * 35);
    context.beginPath(); context.moveTo(0, 0); context.quadraticCurveTo(x * 0.8, y * 0.5, x, y); context.stroke();
  }
  style(context, flashColor(rgb(79, 65, 46), flash)); disc(context, 0, 0, 15);
}
export function drawSquare(context: Canvas2DContext, flash = 0): void {
  context.setLineWidth(5.249999910593033); context.setLineJoin('round');
  style(context, { ...flashColor(rgb(255, 232, 105), flash), r: 255 });
  context.beginPath(); context.rect(-24.748737335205078, -24.748737335205078, 49.497474670410156, 49.497474670410156);
  context.fill(); context.stroke();
}

export interface SpeciesAnimation {
  /** Native component64's accumulated, speed-smoothed movement phase. */
  readonly legPhase?: number;
  /** Native components84/104's smoothed active/attack blend, in [0,1]. */
  readonly activity?: number;
}

/** All 23 catalog ids (0=None). Unknown ids draw nothing rather than inventing
 * a beetle. Radius is the visual/collision radius from the entity snapshot;
 * now is elapsed animation time in ms; flash is remaining blend in [0,1].
 * Caller owns rotation, alpha, lifecycle and the outer save/restore. The
 * optional seventh argument carries actual motion state when available;
 * the required six-argument API has the native resting pose. */
export function drawSpecies(context: Canvas2DContext, species: number, handle: number, radius: number, now: number, flash = 0, animation: SpeciesAnimation = {}): void {
  switch (species) {
    case 0: return;
    case 1: case 2: drawRock(context, handle, radius, flash); return;
    case 3: drawCactus(context, radius, now, flash); return;
    case 4: case 5: case 20: case 21: drawLadybug(context, handle, flash, radius, species); return;
    case 6: drawBee(context, flash); return;
    case 7: case 8: case 9: case 10: drawAnt(context, handle, radius, species, now, flash, animation.activity); return;
    case 11: drawAntHole(context, flash); return;
    case 12: case 13: drawBeetle(context, radius, now, flash, animation.activity); return;
    case 14: drawHornet(context, flash); return;
    case 15: case 16: case 17: case 18: drawCentipede(context, species, flash); return;
    case 19: drawSquare(context, flash); return;
    case 22: drawSpider(context, animation.legPhase, flash); return;
    default: return;
  }
}
