import { INVENTORY_SLOTS } from './loadout-limits.js';
import { byteField, numberField, stringField } from './snapshot-fields.js';
import type { EntitySnapshot, DeathMetadata } from './snapshot-types.js';

interface DomainProjection {
  readonly typeId: number;
  readonly kind?: number;
  readonly speciesId?: number;
  readonly variant?: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly healthKnown: boolean;
  readonly maxHealthKnown: boolean;
  readonly radius?: number;
  readonly level?: number;
  readonly levelProgress?: number;
  readonly score?: number;
}

/** Project the domain fields of one entity record. Values are keyed by wire
 * field id; the component tables describe encoding, not projection. Field 26
 * remains the accepted permanent domain extension. */
export function projectDomain(values: Readonly<Record<number, unknown>>): DomainProjection {
  const value = (field: number): number | undefined => {
    const raw = values[field];
    return typeof raw === 'number' ? raw : undefined;
  };
  const species = value(2);
  const kind = value(26);
  const health = value(53);
  const maxHealth = value(55);
  const variant = value(31);
  const level = value(62);
  const progressRaw = value(58);
  return {
    typeId: kind ?? species ?? 0,
    level,
    levelProgress: progressRaw === undefined ? undefined : (progressRaw & 0xffff) / 65535,
    score: value(59),
    kind,
    speciesId: species,
    variant,
    health: health ?? 0,
    maxHealth: maxHealth ?? 0,
    healthKnown: health !== undefined,
    maxHealthKnown: maxHealth !== undefined,
    radius: value(7),
  };
}

/** Field 60 stays authoritative while an equipped petal is recharging and has
 * no live world entity. Dense group 60 replaces the whole array; sparse element
 * deltas override individual indices. */
export function playerLoadoutSlots(
  player: EntitySnapshot,
  count = INVENTORY_SLOTS,
): number[] | undefined {
  const sparse = player.byteArrayFields?.[60];
  const dense = player.denseFields?.[60];
  if (sparse === undefined && !Array.isArray(dense)) {
    return undefined;
  }
  const slots = Array.from({ length: count }, () => 0);
  if (Array.isArray(dense)) {
    dense.slice(0, count).forEach((value, index) => {
      slots[index] = Number(value);
    });
  }
  for (const { index, value } of sparse ?? []) {
    if (index >= 0 && index < count) {
      slots[index] = value;
    }
  }
  return slots;
}

/** Field 61 holds the eight active-slot recharge progress values (0..65535);
 * dense group 61 replaces the array, sparse deltas override one index. */
export function playerSlotProgress(player: EntitySnapshot): number[] | undefined {
  const sparse = player.shortArrayFields?.[61],
    dense = player.denseFields?.[61];
  if (sparse === undefined && !Array.isArray(dense)) {
    return undefined;
  }
  const values = Array.from({ length: 8 }, () => 0);
  if (Array.isArray(dense)) {
    dense.slice(0, 8).forEach((value, index) => {
      values[index] = Number(value) / 65535;
    });
  }
  for (const { index, value } of sparse ?? []) {
    if (index >= 0 && index < 8) {
      values[index] = value / 65535;
    }
  }
  return values;
}

/** Derive the five hotbar petal types from petal entities that carry the
 * domain loadout slot/instance byte fields (11/12). Instance 0 is the slot
 * representative; instances 1/2 are the same petal type. */
export function loadoutSlots(entities: Iterable<EntitySnapshot>, count = 5): number[] {
  const slots: number[] = Array.from({ length: count }, () => 0);
  for (const entity of entities) {
    const slot = byteField(entity, 11);
    const instance = byteField(entity, 12);
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= count) {
      continue;
    }
    if (typeof instance === 'number' && instance !== 0) {
      continue;
    }
    const petalType = entity.speciesId ?? entity.typeId;
    if (petalType > 0) {
      slots[slot] = petalType;
    }
  }
  return slots;
}

/** A player controller record carries the controlled-body reference (56) and
 * the controller byte (20). */
export function isController(entity: EntitySnapshot): boolean {
  return numberField(entity, 56) !== undefined && numberField(entity, 20) !== undefined;
}

/** Any death/profile marker that makes the death overlay meaningful. */
export function hasDeathMetadata(entity: EntitySnapshot): boolean {
  return (
    numberField(entity, 34) !== undefined ||
    numberField(entity, 47) !== undefined ||
    numberField(entity, 21) !== undefined ||
    stringField(entity, 6) !== undefined ||
    entity.byteArrayFields?.[16] !== undefined ||
    entity.denseFields?.[34] !== undefined
  );
}

export function projectDeathMetadata(entity: EntitySnapshot | undefined): DeathMetadata {
  const controller = entity;
  // The profile record carries these values as sparse fields. The live domain
  // transport scopes the same values onto the controlled body's dense group, so
  // both encodings are read through the same field accessors.
  const items = Array.from({ length: 10 }, () => 0);
  for (const entry of controller?.byteArrayFields?.[16] ?? []) {
    if (entry.index >= 0 && entry.index < items.length) {
      items[entry.index] = entry.value;
    }
  }
  if (!controller?.byteArrayFields?.[16]) {
    const packed = controller?.denseFields?.[16];
    if (Array.isArray(packed)) {
      for (let index = 0; index < items.length; ++index) {
        if (typeof packed[index] === 'number') {
          items[index] = packed[index] & 255;
        }
      }
    }
  }
  // The first three eligible petals become ground drops. Controller field 16
  // contains up to ten remaining survivors for the next spawn.
  const keptCount = Math.max(0, Math.min(10, numberField(controller, 34) ?? 0));
  const deathLevel = numberField(controller, 47) ?? 0;
  return {
    killerName: stringField(controller, 6) ?? '',
    keptCount,
    keptItems: items.slice(0, keptCount),
    score: numberField(controller, 21) ?? 0,
    deathLevel,
    // Field 47 is the level at death; field 1 is the remembered spawn level,
    // clamped to a minimum of one.
    respawnLevel: Math.max(1, numberField(controller, 1) ?? Math.floor((deathLevel * 3) / 4)),
    viewerHandle: numberField(controller, 56),
  };
}

/** Field 63 is the zone byte (0..255); the identity dense group carries it
 * densely. */
export function playerZoneProgress(entity: EntitySnapshot): number {
  return byteField(entity, 63) ?? 0;
}
