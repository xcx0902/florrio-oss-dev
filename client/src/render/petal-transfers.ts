import { createEvent14Effect, updateEvent14Effect, type Event14Effect, type Event14Viewport } from './event-effects.js';
import { getHudLayout } from './hud.js';
import { PETAL_INFO } from '../schema/petals.js';
import { interpolateEntity } from '../state/interpolation.js';
import type { SnapshotEvent } from '../state/snapshot.js';
import type { WorldState } from '../state/world.js';
import type { CameraState } from '../state/camera.js';

/** One native event14 object per occupied slot; retired objects retain their
 * own fade instead of being overwritten by the next transfer into that slot. */
export class PetalTransfers {
  private readonly slots = new Map<number, Event14Effect>();
  private readonly effects = new Set<Event14Effect>();

  reset(): void { this.slots.clear(); this.effects.clear(); }

  /** Dragging takes over the same visual instead of leaving a settled pickup
   * card covering the moving petal or fading a duplicate after a swap. */
  detachSlot(index: number): Event14Effect | undefined {
    const effect = this.slots.get(index);
    if (effect) { this.slots.delete(index); this.effects.delete(effect); }
    return effect;
  }

  receive(events: readonly SnapshotEvent[], world: WorldState, camera: CameraState,
          now: number, viewport: Event14Viewport): void {
    const layout = getHudLayout(viewport.width, viewport.height, viewport.level, viewport.mobile, viewport.uiScale);
    const f = Math.fround;
    for (const event of events) {
      if (event.opcode !== 14 || this.slots.has(event.index)) continue;
      const target = world.get(event.handle);
      if (!target) continue;
      // Native pickup component670 +8 is field22; domain snapshots also expose
      // the same petal identifier as speciesId for their drop record.
      const type = target.byteFields?.[22] ?? target.denseByteFields?.[22]
        ?? target.speciesId ?? 0;
      if (!PETAL_INFO[type] || event.index < 0 || event.index >= 16) continue;
      const position = interpolateEntity(target, now);
      const factor = f(camera.viewportFactor), scale = f(camera.zoom / factor);
      const project = (value: number, center: number, extent: number): number =>
        f(f(extent * 0.5 + f(f(f(f(value) - f(center)) * scale) * factor)) / layout.scale);
      const effect = createEvent14Effect({ index: event.index, type,
        startScreenX: project(position.x, camera.x, camera.viewportWidth),
        startScreenY: project(position.y, camera.y, camera.viewportHeight) });
      this.slots.set(event.index, effect);
      this.effects.add(effect);
      world.markCollected(event.handle);
    }
  }

  update(now: number, delta: number, inventory: readonly number[], recharge: readonly number[] | undefined,
         viewport: Event14Viewport): readonly Event14Effect[] {
    for (const effect of this.effects) {
      const active = this.slots.get(effect.index) === effect && inventory[effect.index] === effect.type;
      if (!active) this.slots.delete(effect.index);
      if (!updateEvent14Effect(effect, { ...viewport, nowMilliseconds: now, deltaMilliseconds: delta,
        active, recharge: recharge?.[effect.index] })) this.effects.delete(effect);
    }
    return [...this.effects];
  }
}
