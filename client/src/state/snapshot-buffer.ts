import { MOTION as M } from '../schema/motion.js';
import { LIMITS } from '../schema/multiplayer.js';
import { lerpAngle, type MutableTransform } from './interpolation.js';
interface Point {
  tick: number;
  x: number;
  y: number;
  angle: number;
  radius?: number;
}
/** Each wire handle (including generation) owns at most eight authoritative
 * samples. Discrete health/equipment/deletion is never delayed by this buffer. */
export class SnapshotBuffer {
  private readonly histories = new Map<number, Point[]>();
  push(
    tick: number,
    entities: Iterable<{ handle: number; x: number; y: number; angle: number; radius?: number }>,
  ): void {
    const visible = new Set<number>();
    for (const entity of entities) {
      visible.add(entity.handle);
      let history = this.histories.get(entity.handle);
      if (!history) {
        this.histories.set(entity.handle, (history = []));
      }
      const last = history.at(-1);
      // A server teleport starts a new trajectory, without inventing a sweep.
      if (
        last &&
        Math.hypot(entity.x - last.x, entity.y - last.y) >
          Math.max(M.teleportMinimum, (entity.radius ?? 25) * M.teleportRadii)
      ) {
        history.length = 0;
      }
      const index = history.findIndex((point) => point.tick >= tick);
      const point = { tick, x: entity.x, y: entity.y, angle: entity.angle, radius: entity.radius };
      if (index < 0) {
        history.push(point);
      } else if (history[index].tick === tick) {
        history[index] = point;
      } else {
        history.splice(index, 0, point);
      }
      if (history.length > M.snapshotLimit) {
        history.splice(0, history.length - M.snapshotLimit);
      }
    }
    for (const handle of this.histories.keys()) {
      if (!visible.has(handle)) {
        this.histories.delete(handle);
      }
    }
  }
  sample(
    handle: number,
    serverTime: number,
    result: MutableTransform,
  ): MutableTransform | undefined {
    const points = this.histories.get(handle);
    if (!points?.length) {
      return;
    }
    const tick = serverTime / LIMITS.tickMs;
    let a = points[0],
      b = a;
    for (const point of points) {
      if (point.tick <= tick) {
        a = point;
      }
      if (point.tick >= tick) {
        b = point;
        break;
      }
      b = point;
    }
    if (tick > points.at(-1)!.tick) {
      b = points.at(-1)!;
      a = points.at(-2) ?? b;
      const extra = Math.min(M.extrapolateMs / LIMITS.tickMs, tick - b.tick);
      const t = a.tick === b.tick ? 1 : 1 + extra / (b.tick - a.tick);
      result.x = a.x + (b.x - a.x) * t;
      result.y = a.y + (b.y - a.y) * t;
      result.angle = lerpAngle(a.angle, b.angle, t);
      result.radius = b.radius;
      return result;
    }
    const t = a.tick === b.tick ? 0 : Math.max(0, Math.min(1, (tick - a.tick) / (b.tick - a.tick)));
    result.x = a.x + (b.x - a.x) * t;
    result.y = a.y + (b.y - a.y) * t;
    result.angle = lerpAngle(a.angle, b.angle, t);
    result.radius = b.radius;
    return result;
  }
  reset(): void {
    this.histories.clear();
  }
  get depth(): number {
    let max = 0;
    for (const h of this.histories.values()) {
      max = Math.max(max, h.length);
    }
    return max;
  }
  get entityCount(): number {
    return this.histories.size;
  }
}
