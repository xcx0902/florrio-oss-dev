# Loadout restore, active slots and backpack linkage

Status: active-slot restore, slot type changes, pickup overflow into the
backpack FIFO, discard/swap linkage, the per-instance handle array, pending
bytes/timers and replication epochs are implemented.

## Restore

`PlayerLoadout::restore_from_profile(profile)` clears all 16 slots and equips
the first `min(active_slots, inventory_size)` inventory entries. Active slots
are 5/6/7/8 at levels 0/15/30/45; inventory capacity is 13/14/15/16.
`spawn_player_default` calls this after writing the restored profile, so a
respawn keeps the prior carried petals instead of only the five starter slots.

## Slot type change

`PlayerLoadout::change_slot_type(world, profile, slot, type)`:

- rejects an out-of-capacity slot and ignores a no-op type change;
- for slots 0..7, damages/removes all three equipped handles, clears them, sets
  the three pending bytes and zeroes their timers;
- clears the slot for type 0 or creates a fresh `PetalSlot` from the catalog
  instance count and mirrors the type into the profile inventory;
- bumps `replication_epoch` and the changed slot's `slot_epoch`;
- calls `invalidate_packet_cache(world)`.

The packet-cache rebuild recomputes the per-slot records. The domain stores the
equivalent state in `packet_cache_epoch_`, the player entity's
`packet_epoch_a`/`packet_epoch_b`, the changed slot's `slot_epoch`, and a
`pending_cache_[slot][instance]` order table. `refresh_pending_cache()` walks
slots 0..7 in order, skips empty/unknown types and `flag40` petals, and assigns
consecutive cache indices to every live handle plus every catalog-declared
missing instance.

The normal branch gives each instance its own index. The `flag41` branch (Rose
24, Stinger 27, Web 30, Cactus 33) uses a shared index: every live instance in
the slot shares one cache index and the slot advances the index once.
`pending_cache_count()` is captured at the level band (`active_slots_` 5/6/7/8),
not at slot 8; slots beyond the band still receive cache indices. `equip`,
`discard`, `swap`, `clear` and `invalidate_packet_cache` rebuild the table;
`test_loadout_pending_cache_order` covers Triplet+Basic and clear, and
`test_loadout_flag41_pending_cache` covers Rose's shared index and the
active-band truncation. `create_equipped_petal` performs the same invalidation.

## Reserve slots and inventory cycling

`PlayerLoadout::cycle_reserve_slots(world, profile)`:

1. change slot `active_slots` to the type currently in slot 0;
2. for each reserve slot `previous + 1` up to `inventory_size - 1`, compute
   `petal = existing ? total - active - 1 + existing : slot - active` and call
   `change_slot_type(slot, petal % 39)`.

The loop recomputes `active_slots`/`inventory_size` after every change, matching
the level-dependent bands. Reserve slots therefore participate in the same
type-change/packet-cache path as active slots, while only slots 0..7 can own
equipped handles. Discard still pushes the removed type into the 16-entry
backpack FIFO; a full FIFO shifts the oldest entry before appending.

`PlayerLoadout::create_equipped_petal(world, slot, instance)` checks the active
slot count and catalog instance count, spawns one petal at the player position,
attaches it as a child, stores the handle at `handle(slot, instance)`, and
clears the pending byte/timer.

`remove_slot_petals` / `swap_slot_petals` are the entity-side linkage for
discard and swap; they keep orbit records and entity `loadout_slot` in sync.

## Pickup overflow

`collect_drops` first looks for an open carried slot in the level capacity. If
none exists it pushes the petal into the 16-entry backpack FIFO; a full backpack
leaves the drop in the world. This is the pickup recipient's open-slot test plus
the backpack tail.

## Storage layout

| Domain field | Meaning |
| --- | --- |
| `slots_[slot].type_id` | slot type byte |
| `handles_[slot][instance]` | intrusive equipped handle |
| `pending_[slot][instance]` | pending spawn byte |
| `timers_[slot][instance]` | pending timer (ms) |
| `replication_epoch_` | loadout revision |
| `slot_epoch_[slot]` | per-slot revision |
| `score_` | death score source |
| profile level | active/capacity band |

`equip`/`discard` reset the slot's handles, pending bytes and timers; `swap`
moves all four arrays and the slot epochs. `advance` ticks the pending timers
and clears a pending byte when its timer reaches zero. `spawn_loadout_petals`
skips occupied handles, spawns missing instances, then clears pending/timer
state.

## Open

- exact intrusive-list node layout (the domain arrays preserve handle, pending
  and timer semantics);
- packet-cache record layout (the domain stores the same index in
  `pending_cache_`).

The archived source tables contain the original field offsets for provenance.
