
export { playerLoadoutSlots, playerSlotProgress, loadoutSlots } from './snapshot-projection.js';

/** Native func587, slot visual +24: field61 is an immediate u16 target,
 * not a 120ms interpolated field. A decrease snaps before the exponential;
 * an increase eases from the retained f32 value. New visuals start at 1.
 * The original WASM snaps within 1e-7, then stores f32. delta is the actual
 * render-frame delta.
 */
export function advanceSlotRecharge(current: number, target: number, deltaMilliseconds: number): number {
  const f = Math.fround;
  const value = f(Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0);
  const start = Math.min(value, f(current));
  const delta = f(Number.isFinite(deltaMilliseconds) ? Math.max(0, deltaMilliseconds) : 0);
  const amount = Math.max(0, Math.min(1, 1 - Math.pow(0.8, delta * 0.06)));
  return f(Math.abs(start - value) < 1e-7 ? value : start + amount * (value - start));
}
