import { playerLoadoutSlots } from './loadout.js';
import type { DeathMetadata,WorldState } from './world.js';

export interface DeathSnapshot {
  readonly slots: readonly number[];
  readonly level: number;
  readonly metadata: DeathMetadata;
}

/** Receipt owns the death snapshot; rendering only advances presentation.
 * A single flush may contain both the corpse and its deletion before a RAF. */
export class DeathLifecycle {
  private bodyHandle: number | undefined;
  private latest: DeathSnapshot | undefined;
  private destroyed = false;
  private progress = 0;

  observe(world: WorldState): void {
    const body = world.playerEntity();
    if (body && body.health > 0) {
      if (body.handle !== this.bodyHandle) this.reset();
      this.bodyHandle = body.handle;
      this.latest = {
        slots: world.playerLoadout(),
        level: body.level ?? 1,
        metadata: world.deathMetadata(),
      };
      return;
    }
    if (this.destroyed || this.bodyHandle === undefined || !this.latest) return;
    const metadata = world.controller() ? world.deathMetadata() : this.latest.metadata;
    this.latest = {
      slots: body ? playerLoadoutSlots(body) ?? this.latest.slots : this.latest.slots,
      level: metadata.deathLevel || body?.level || this.latest.level,
      metadata,
    };
    this.destroyed = true;
  }

  advance(deltaMilliseconds: number): number {
    if (this.destroyed) {
      const delta = Math.fround(Number.isFinite(deltaMilliseconds) ? Math.max(0, deltaMilliseconds) : 0);
      // Native clientFrame1095 stores binary32 after every rendered frame.
      this.progress = Math.fround(this.progress + (1 - this.progress)
        * Math.max(0, Math.min(1, 1 - Math.pow(0.95, delta * 0.06))));
    }
    return this.progress;
  }

  reset(): void {
    this.bodyHandle = undefined;
    this.latest = undefined;
    this.destroyed = false;
    this.progress = 0;
  }

  get snapshot(): DeathSnapshot | undefined { return this.latest; }
  get dead(): boolean { return this.destroyed; }
}
