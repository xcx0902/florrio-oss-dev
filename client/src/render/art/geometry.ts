import type { Canvas2DContext } from '../canvas2d/context.js';
import { Rgb, TAU, setFill, setStroke, shade } from './palette.js';
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
export type ArtMatrix = readonly [
  number,
  number,
  number,
  number,
  number,
  number
];
export type SpeciesContext = Canvas2DContext & {
  transform?: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  getTransform?: () => ArtMatrix;
  createPath?: () => SpeciesPath;
  setMiterLimit?: (limit: number) => void;
  getGlobalAlpha?: () => number;
};
export const f32 = Math.fround;
export const positiveRadius = (radius: number, fallback: number): number => {
  const rounded = f32(radius);
  return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
};
export const finiteTime = (now: number): number => Number.isFinite(now) ? now : 0;
export const style = (context: Canvas2DContext, color: Rgb): void => {
  setFill(context, color);
  setStroke(context, shade(color));
};
export const disc = (context: Canvas2DContext, x: number, y: number, radius: number, stroke = true): void => {
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fill();
  if (stroke)
    context.stroke();
};
/** Similarity transforms only (all species' internal transforms are uniform
* scale/rotation/translation). Never substitute ellipse for a native arc when
* the bridge offers transform(). No screen-space assumptions live here. */
export function localContext(context: Canvas2DContext, scale = 1, angle = 0, x = 0, y = 0): Canvas2DContext {
  if (scale === 1 && angle === 0 && x === 0 && y === 0)
    return context;
  const cosine = f32(Math.cos(angle)), sine = f32(Math.sin(angle));
  const a = f32(scale * cosine), b = f32(scale * sine);
  const native = context as SpeciesContext;
  if (native.transform) {
    native.transform(a, b, -b, a, x, y);
    return context;
  }
  const point = (px: number, py: number): [
    number,
    number
  ] => [a * px - b * py + x, b * px + a * py + y];
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
      if (angle === 0) {
        context.fillRect(...point(px, py), width * scale, height * scale);
        return;
      }
      context.beginPath();
      context.moveTo(...point(px, py));
      context.lineTo(...point(px + width, py));
      context.lineTo(...point(px + width, py + height));
      context.lineTo(...point(px, py + height));
      context.closePath();
      context.fill();
    },
  };
  return new Proxy(context, { get(target, key) {
      if (key === 'createPath')
        return undefined; // scaled primitives must replay their path
      const method = methods[key as keyof Canvas2DContext];
      if (method)
        return method;
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
}
export function inLocal(context: Canvas2DContext, draw: (local: Canvas2DContext) => void, scale = 1, angle = 0, x = 0, y = 0): void {
  context.save();
  draw(localContext(context, scale, angle, x, y));
  context.restore();
}
/** Native690 saves only the logical matrix around each eye; Canvas state is
* saved solely for the pupil clip and the enclosing face expression pass. */
export function inLocalTransform(context: Canvas2DContext, draw: (local: Canvas2DContext) => void, scale = 1, angle = 0, x = 0, y = 0): void {
  const native = context as SpeciesContext;
  if (!native.transform || !native.getTransform) {
    inLocal(context, draw, scale, angle, x, y);
    return;
  }
  const matrix: ArtMatrix = [...native.getTransform()];
  draw(localContext(context, scale, angle, x, y));
  context.setTransform(...matrix);
}
/** Every rectangle is composed from the same caller matrix and
* restores it without a Canvas save. Expanded zero products retain native
* f32 grouping (including signed zero and nonfinite propagation). */
export function fillArtRectangle(context: Canvas2DContext, x: number, y: number, width: number, height: number): void {
  const native = context as SpeciesContext;
  if (!native.transform || !native.getTransform) {
    context.fillRect(x, y, width, height);
    return;
  }
  const matrix: ArtMatrix = [...native.getTransform()];
  const [A, B, C, D, E, F] = matrix, f = Math.fround;
  x = f(x);
  y = f(y);
  width = f(width);
  height = f(height);
  const tx = f(E + f(f(A * x) + f(C * y))), ty = f(F + f(f(B * x) + f(D * y)));
  const a = f(f(A + f(C * 0)) + f(E * 0)), c = f(f(f(A * 0) + C) + f(E * 0));
  const b = f(f(B + f(D * 0)) + f(F * 0)), d = f(f(f(B * 0) + D) + f(F * 0));
  const zeroA = f(a * 0), zeroB = f(b * 0), zeroC = f(c * 0), zeroD = f(d * 0);
  context.setTransform(f(f(tx * 0) + f(f(a * width) + zeroC)), f(f(f(b * width) + zeroD) + f(ty * 0)), f(f(tx * 0) + f(zeroA + f(c * height))), f(f(zeroB + f(d * height)) + f(ty * 0)), f(tx + f(zeroA + zeroC)), f(ty + f(zeroB + zeroD)));
  context.fillRect(0, 0, 1, 1);
  context.setTransform(...matrix);
}
export function artRandom(handle: number): () => number {
  let state = (((handle & 0x3fff) ^ (handle >>> 14)) >>> 0) % 2147483647 || 1;
  return () => { state = state * 48271 % 2147483647; return state; };
}
