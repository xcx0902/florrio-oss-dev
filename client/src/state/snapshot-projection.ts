import { FIELD_COMPONENTS } from './field-types.js';
import type { DenseValue, EntitySnapshot, DeathMetadata } from './snapshot-types.js';
export function buildComponents(values: Readonly<Record<number, unknown>>): Readonly<Record<number, Readonly<Record<number, unknown>>>> {
  const components: Record<number, Record<number, unknown>> = {};
  for (const [fieldText, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const field = Number(fieldText);
    const component = FIELD_COMPONENTS[field];
    if (component === undefined) continue;
    (components[component.constructor] ??= {})[component.offset] = value;
  }
  return components;
}

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

/** Project protocol fields through the generated component locations. Component
 * ids and layout offsets belong to the schema table, not domain projection
 * logic. Field 26 remains the accepted permanent domain extension. */
export function projectDomain(
  components: Readonly<Record<number, Readonly<Record<number, unknown>>>>,
  denseFields?: Readonly<Record<number, DenseValue>>,
): DomainProjection {
  const numberField = (field: number, denseFallback = false): number | undefined => {
    const location = FIELD_COMPONENTS[field];
    const value = components[location.constructor]?.[location.offset];
    if (typeof value === 'number') return value;
    const dense = denseFallback ? denseFields?.[field] : undefined;
    return typeof dense === 'number' ? dense : undefined;
  };
  const species = numberField(2, true);
  const kind = numberField(26, true);
  const health = numberField(53, true);
  const maxHealth = numberField(55, true);
  const variant = numberField(31, true);
  const radius = numberField(7, true);
  const level = numberField(62);
  const progressRaw = numberField(58);
  const score = numberField(59);
  return {
    typeId: kind ?? species ?? 0,
    level,
    levelProgress: progressRaw === undefined ? undefined : (progressRaw & 0xffff) / 65535,
    score,
    kind,
    speciesId: species,
    variant,
    health: health ?? 0,
    maxHealth: maxHealth ?? 0,
    healthKnown: health !== undefined,
    maxHealthKnown: maxHealth !== undefined,
    radius,
  };
}


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

export function isController(entity: EntitySnapshot): boolean {
  return (entity.referenceFields?.[56] ?? entity.varintFields?.[56] ?? entity.denseFields?.[56]) !== undefined && (entity.byteFields?.[20] ?? entity.denseFields?.[20]) !== undefined;
}
export function hasDeathMetadata(entity: EntitySnapshot): boolean {
  return entity.byteFields?.[34] !== undefined || entity.byteFields?.[47] !== undefined || entity.floatFields?.[21] !== undefined || entity.stringFields?.[6] !== undefined || entity.byteArrayFields?.[16] !== undefined || entity.denseFields?.[34] !== undefined;
}
export function projectDeathMetadata(entity: EntitySnapshot | undefined): DeathMetadata {
    const controller = entity;
    // The profile record carries these values as
    // sparse fields. The live domain transport scopes the same values onto the
    // controlled body's dense group 72, so accept either representation.
    const dense = controller?.denseFields;
    const denseString = (field: number): string | undefined => {
      const value = dense?.[field];
      return typeof value === 'string' ? value : undefined;
    };
    const denseNumber = (field: number): number | undefined => {
      const value = dense?.[field];
      return typeof value === 'number' ? value : undefined;
    };
    const items = Array.from({ length: 10 }, () => 0);
    for (const entry of controller?.byteArrayFields?.[16] ?? [])
      if (entry.index >= 0 && entry.index < items.length) items[entry.index] = entry.value;
    if (!controller?.byteArrayFields?.[16]) {
      const packed = dense?.[16];
      if (Array.isArray(packed)) for (let index = 0; index < items.length; ++index)
        if (typeof packed[index] === 'number') items[index] = packed[index] & 255;
    }
    // The first three eligible petals become ground drops. Controller field
    // 16 contains up to ten remaining survivors for the next spawn.
    const keptCount = Math.max(0, Math.min(10,
      controller?.byteFields?.[34] ?? denseNumber(34) ?? 0));
    return {
      killerName: controller?.stringFields?.[6] ?? denseString(6) ?? '',
      keptCount,
      keptItems: items.slice(0, keptCount),
      score: controller?.floatFields?.[21] ?? denseNumber(21) ?? 0,
      deathLevel: controller?.byteFields?.[47] ?? denseNumber(47) ?? 0,
      // Field 47 is the level at death; field 1 is the remembered spawn
      // level. The original menu clamps the latter to a minimum of one.
      respawnLevel: Math.max(1, controller?.byteFields?.[1] ?? denseNumber(1)
        ?? Math.floor((controller?.byteFields?.[47] ?? denseNumber(47) ?? 0) * 3 / 4)),
      viewerHandle: controller?.referenceFields?.[56] ?? controller?.varintFields?.[56]
        ?? denseNumber(56),
    };
}

export function playerZoneProgress(entity: EntitySnapshot): number {
  const value = entity.byteFields?.[63] ?? entity.denseByteFields?.[63] ?? entity.denseFields?.[63];
  return typeof value === 'number' ? value : 0;
}
