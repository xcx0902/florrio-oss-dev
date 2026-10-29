import type { EntitySnapshot } from './snapshot.js';

/** Native player component491 field60 remains authoritative while an
 * equipped petal is recharging and has no live world entity. */
export function playerLoadoutSlots(player: EntitySnapshot, count = 16): number[] | undefined {
  const sparse = player.byteArrayFields?.[60] ?? player.byteArrayField60;
  const dense = player.denseFields?.[60];
  if (sparse === undefined && !Array.isArray(dense)) return undefined;
  const slots = Array.from({ length: count }, () => 0);
  if (Array.isArray(dense)) dense.slice(0, count).forEach((value, index) => { slots[index] = Number(value); });
  for (const { index, value } of sparse ?? []) if (index >= 0 && index < count) slots[index] = value;
  return slots;
}

export function playerSlotProgress(player: EntitySnapshot): number[] | undefined {
  const sparse = player.shortArrayFields?.[61], dense = player.denseFields?.[61];
  if (sparse === undefined && !Array.isArray(dense)) return undefined;
  const values = Array.from({ length: 8 }, () => 0);
  if (Array.isArray(dense)) dense.slice(0, 8).forEach((value, index) => { values[index] = Number(value) / 65535; });
  for (const { index, value } of sparse ?? []) if (index >= 0 && index < 8) values[index] = value / 65535;
  return values;
}

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

/** Derive the five hotbar petal types from petal entities that carry the
 * domain loadout slot/instance byte fields (11/12). Instance 0 is the slot
 * representative; instances 1/2 are the same petal type. */
export function loadoutSlots(entities: Iterable<EntitySnapshot>, count = 5): number[] {
  const slots: number[] = Array.from({ length: count }, () => 0);
  for (const entity of entities) {
    const slot = entity.byteFields?.[11] ?? entity.denseByteFields?.[11] ?? entity.denseFields?.[11];
    const instance = entity.byteFields?.[12] ?? entity.denseByteFields?.[12] ?? entity.denseFields?.[12];
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= count) continue;
    if (typeof instance === 'number' && instance !== 0) continue;
    const petalType = entity.speciesId ?? entity.typeId;
    if (petalType > 0) slots[slot] = petalType;
  }
  return slots;
}
