import type { EntityState } from './entity-state.js';

export function clamp01(value: number): number { return value < 0 ? 0 : value > 1 ? 1 : value; }

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

export function lerpAngle(a: number, b: number, t: number): number {
  // Original705 normalizes each endpoint before choosing its nearest winding.
  // Returning an equivalent angle around 2π instead changes the later f32
  // narrowing and therefore the Canvas rotation matrix.
  const turn = 2 * Math.PI;
  const normalize = (angle: number): number => {
    angle %= turn;
    if (angle < -Math.PI) angle += turn;
    return angle > Math.PI ? angle - turn : angle;
  };
  let from = normalize(a);
  const to = normalize(b);
  let candidate = from + turn, distance = Math.abs(from - to);
  if (Math.abs(candidate - to) < distance) {
    do { from = candidate; candidate += turn; distance = Math.abs(from - to); }
    while (distance > Math.abs(candidate - to));
  }
  candidate = from - turn;
  if (distance > Math.abs(candidate - to)) {
    do { from = candidate; candidate -= turn; }
    while (Math.abs(candidate - to) < Math.abs(from - to));
  }
  return from + t * (to - from);
}

export interface InterpolatedTransform { readonly x: number; readonly y: number; readonly angle: number; readonly radius?: number; }

/** The camera follows component478 while artwork uses component609. They
 * have separate scalar clocks in the original receiver. */
export function interpolateCameraTarget(entity: EntityState, now: number, durationMs = 120): { x: number; y: number } {
  const displayed = interpolateEntity(entity, now, durationMs);
  const scalar = (current: number | undefined, previous: number | undefined,
    received: number | undefined, fallback: number): number => current === undefined ? fallback
    : Math.fround((previous ?? current) + Math.fround(current - (previous ?? current))
      * clamp01((now - (received ?? entity.receivedAt)) * (1 / durationMs)));
  return { x: scalar(entity.cameraX, entity.previousCameraX, entity.receivedCameraXAt, displayed.x),
    y: scalar(entity.cameraY, entity.previousCameraY, entity.receivedCameraYAt, displayed.y) };
}

/** Interpolate between the previous and current snapshot over `durationMs`. */
export function interpolateEntity(entity: EntityState, now: number, durationMs = 120): InterpolatedTransform {
  return interpolateEntityInto(entity, now, {x:0,y:0,angle:0}, durationMs);
}
export interface MutableTransform { x:number; y:number; angle:number; radius?:number; }
/** Same scalar arithmetic, with caller-owned storage for the render hot path. */
export function interpolateEntityInto(entity: EntityState, now: number, result: MutableTransform, durationMs = 120): MutableTransform {
  const tx = clamp01((now - (entity.receivedXAt ?? entity.receivedAt)) * (1 / durationMs));
  const ty = clamp01((now - (entity.receivedYAt ?? entity.receivedAt)) * (1 / durationMs));
  const ta = clamp01((now - (entity.receivedAngleAt ?? entity.receivedAt)) * (1 / durationMs));
  const tr = clamp01((now - (entity.receivedRadiusAt ?? entity.receivedAt)) * (1 / durationMs));
  result.x = Math.fround(entity.previousX + Math.fround(entity.x - entity.previousX) * tx);
  result.y = Math.fround(entity.previousY + Math.fround(entity.y - entity.previousY) * ty);
  result.angle = lerpAngle(entity.previousAngle, entity.angle, ta);
  if(entity.radius === undefined) delete result.radius;
  else result.radius = Math.fround((entity.previousRadius ?? entity.radius)
    + Math.fround(entity.radius - (entity.previousRadius ?? entity.radius)) * tr);
  return result;
}
