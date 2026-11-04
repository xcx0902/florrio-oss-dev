/** Re-export the generated loadout contract; hand-written modules must not
 * maintain a second copy of slot capacities or unlock levels. */
export {
  ACTIVE_SLOTS,
  ACTIVE_SLOT_COUNTS,
  INVENTORY_SIZES,
  INVENTORY_SLOTS,
  INSTANCES_PER_SLOT,
  SLOT_UNLOCK_LEVELS,
  activeSlotsForLevel,
  inventorySizeForLevel,
} from '../schema/loadout.js';
