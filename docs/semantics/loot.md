# Loot and death rewards

The death path is split across damage/death, the player retention pass and the
pickup spawner. `engine/src/sim/loot.cpp` holds the product pieces.

## Entity drop tables

`schema/catalogs/drop-chances.json` is a generated per-entity table. The
active derivation lives in `tools/schema/drop-chances.mjs` and reads only
`drop-rules.json` plus the product catalogs:

1. Build eight spawn-band histograms from the weighted spawn rules, including
   summoned children (Ant Hole → Baby/Worker/Soldier/Queen Ant; Centipede →
   Centipede segment; Evil Centipede → Evil segment). Alias species resolve to
   their canonical parent when the child contribution is accumulated.
2. Normalize each band by its total (rules plus child mass).
3. Area-weight the eight bands with
   `0.15, 0.15, 0.075, 0.075, 0.05, 0.05, 0.0125, 0.0125`.
4. Use `SpeciesId::kSquare` as the reference mass.
5. For each petal, start from `petalDropMass[rarity] * referenceMass` where the
   masses are `50000, 15000, 2500, 100, 5, 1`, and distribute it over the
   species that drop that petal, proportional to their spawn mass and spawn
   weight. A chance above 0.9 saturates at 1; a chance below 1e-5 is removed.
6. Alias species inherit the finalized table, then entries are sorted by
   ascending chance.

The archived derivation is historical evidence only; the active runtime reads the generated C++ table.

## Spawn-time loot attachment

The drop table is consumed by the **drop draws at spawn**, not by a roll at
death. An entity definition's `dropDrawCount` equals the number of petal
ids in its drop row (Bee: 6, Ladybug: 5, Rock: 3). `draw_drop_candidates`
draws one server RNG fraction per drop-row entry and attaches the entry when
`fraction < chance`.

The iteration order is the **drop table order** in
`schema/catalogs/drop-chances.json` (ascending chance), not the definition's
`petalTypeIds` order. The attached list is the entity's spawn-time loot list.

The death path only materializes the already-attached entries; it consumes no
additional RNG values. Spawning a Bee always consumes six draws, even when none
attaches loot. Re-rolling the table at death would add draws and drops for
entities whose loot list was empty.

`roll_entity_loot` remains a helper for callers that need a per-entry
probability roll, but `kill_entity` uses the spawn-time list.

## Player death retention

`retain_player_loot` groups the player's level-capacity inventory plus the
`INVENTORY_SLOTS`-entry backpack FIFO by rarity, shuffles each group with the
minstd / independent-bits shuffle, skips `PetalId::kBasicCommon` and a 10%
roll, retains at most three petals, loses at most ten `kMaxLost` entries, and
converts 1% of retained `Rarity::kRare`..`kUnique` petals to
`PetalId::kPollenEpic`. The profile inventory is replaced by the retained list, the
backpack is cleared, the lost list is stored on the profile, and the retained
list is spawned as pickups.

## Pickups

A pickup uses the petal draw radius for rendering and the pickup radius 35 for
collection. Its lifetime is 32 s, or 42/52/62/62 s for `Rare`/`Epic`/`Legendary`/`Unique`.
Multi-drop spawns receive a radial impulse of 0.6.

## Experience

Spawn writes the entity definition's `scale` into the entity's reward field; the
damage path awards that value to the attacker's owning player. Level thresholds
are `floor(1.06 ** (level - 1) * level) + 3`. The rarity experience table
`2, 10, 50, 200, 1000, 2500, 0, 0` (generated in `loadout.json`) is the
discard/salvage reward, not the kill reward.

## Remaining boundaries

`World::register_pickup`/`unregister_pickup` maintain the pickup intrusive list
(`pickup_prev/next`, `pickup_listed`, `World::pickups()`), used by
`legendary_exists`. Packet-cache invalidation is still open. The reward value is
the entity definition scale. The client death animation and loot fly-out are
separate. The contact resolver does not reproduce every collision layer flag or
pair-order side effect.
