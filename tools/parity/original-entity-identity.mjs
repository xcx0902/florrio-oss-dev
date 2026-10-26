/** Oracle-only layout adapter. Field 26 is a domain extension, so infer kind
 * from original component presence instead of comparing it as an original byte.
 * Sources: server entities/spawnEntity (148+8), createEquippedPetal (124+8),
 * damage.mjs ensurePickup/spawnLoot (100+8), player loadout (200), WAT 695.
 */
export function originalEntityIdentity(view, entity) {
  const u32 = address => view.getUint32(address, true);
  const u8 = address => view.getUint8(address);
  const player = u32(entity + 200);
  if (player) return { type: 0, kind: 1 };
  const petal = u32(entity + 124);
  if (petal) return { type: u8(petal + 8), kind: 3 };
  const species = u32(entity + 148);
  if (species) return { type: u8(species + 8), kind: 2 };
  const pickup = u32(entity + 100);
  if (pickup) return { type: u8(pickup + 8), kind: 4 };
  const visual = u32(entity + 156), owner = u32(entity + 236);
  if (visual && owner && owner + 152 <= view.byteLength) {
    const ownerSpecies = u32(owner + 148);
    // The Hornet stinger has no original species record. Its domain type is
    // the firing species; this inference is explicit and independently probed.
    if (ownerSpecies && u8(ownerSpecies + 8) === 14) return { type: 14, kind: 5 };
  }
  return { type: -1, kind: -1 }; // unknown is always a mismatch with a valid domain record
}
