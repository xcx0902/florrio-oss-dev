import type { EntityState } from '../state/world.js';

/** Presentation clocks advance only when the native component is drawn.
 * Components 84/104 blend the AI activity byte; component 64 accumulates
 * speed-smoothed displacement for its legs. These clocks are not world time.
 */
export interface SpeciesAnimationState {
  time: number;
  activity: number;
  legPhase: number;
  speed: number;
  previousX?: number;
  previousY?: number;
}

export function createSpeciesAnimationState(): SpeciesAnimationState {
  return { time: 0, activity: 0, legPhase: 0, speed: 0 };
}

export function advanceSpeciesAnimation(state: SpeciesAnimationState, entity: EntityState,
                                         x: number, y: number, deltaMs: number): void {
  const f = Math.fround, elapsed = f(deltaMs);
  const species = entity.speciesId ?? entity.typeId;
  if (species >= 7 && species <= 13 && species !== 11) {
    state.time += elapsed;
    const flags = entity.byteFields?.[36] ?? entity.denseByteFields?.[36] ?? entity.denseFields?.[36];
    const target = typeof flags === 'number' && (flags & 1) !== 0 ? 1 : 0;
    const blend = Math.max(0, Math.min(1, 1 - Math.pow(0.7, elapsed * 0.06)));
    state.activity = f(Math.abs(state.activity - target) < 1e-7 ? target
      : blend * (target - state.activity) + state.activity);
  } else if (species === 22 && elapsed > 0) {
    if (state.previousX !== undefined && state.previousY !== undefined) {
      const dx = state.previousX - x, dy = state.previousY - y;
      const measured = Math.sqrt(dx * dx + dy * dy) / elapsed;
      const blend = Math.max(0, Math.min(1, 1 - Math.pow(0.6, elapsed * 0.06)));
      state.speed = f(Math.abs(state.speed - measured) < 1e-7 ? measured
        : blend * (measured - state.speed) + state.speed);
    }
    state.previousX = f(x); state.previousY = f(y);
    state.legPhase += f(f(state.speed * 4) * elapsed);
  }
}
