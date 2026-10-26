import type { EntityState } from './world.js';
import { interpolateEntity } from './interpolation.js';
import type { PanState } from './pan.js';
import type { CameraState } from './camera.js';

/** Original760 tests interpolated collider bounds against a viewport expanded
 * by 100 world units on each side, independently of artwork dimensions. */
export function isOutsideWorldViewport(x: number, y: number, radius: number,
                                       camera: CameraState): boolean {
  const f = Math.fround, zoom = f(camera.zoom);
  const width = f(camera.viewportWidth / zoom), height = f(camera.viewportHeight / zoom);
  const left = f(f(f(camera.x) + f(f(camera.viewportWidth * -0.5) / zoom)) - 100);
  const top = f(f(f(camera.y) + f(f(camera.viewportHeight * -0.5) / zoom)) - 100);
  const bx = f(f(x) - radius), by = f(f(y) - radius), size = f(radius + radius);
  return left > f(bx + size) || f(left + f(width + 200)) < bx
    || top > f(by + size) || f(top + f(height + 200)) < by;
}

/** Original409 constrains the controlled player's interpolated transform after
 * adding pan. Its result is cached until original763 invalidates transforms,
 * after queuePlayerInput has consumed the previous render's cached value. */
export function playerWorldPosition(entity: EntityState, now: number, pan: PanState): { x: number; y: number } {
  const position = interpolateEntity(entity, now);
  const radius = entity.radius ?? 25;
  const f = Math.fround;
  const clamp = (value: number, offset: number, half: number): number =>
    Math.max(f(radius - half), Math.min(f(half - radius), f(value + offset)));
  return { x: clamp(position.x, pan.x, 25000), y: clamp(position.y, pan.y, 2000) };
}

export class PlayerWorldTransformCache {
  private cached: { handle: number; x: number; y: number } | undefined;

  get(entity: EntityState, now: number, pan: PanState): { x: number; y: number } {
    if (this.cached?.handle !== entity.handle)
      this.cached = { handle: entity.handle, ...playerWorldPosition(entity, now, pan) };
    return this.cached;
  }

  invalidate(): void { this.cached = undefined; }
}
