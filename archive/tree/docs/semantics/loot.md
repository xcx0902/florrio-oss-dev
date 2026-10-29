# Loot and death rewards

The original death path is split across function 43 (damage/death), the player
retention pass and the pickup spawner. `engine/src/sim/loot.cpp` implements the
domain pieces that are directly evidenced by the recovered bodies.

## Entity drop tables

`tools/derive-drop-chances.mjs` recomputes the mutable drop probabilities that
`sp_server_init` writes into the entity definitions. The algorithm is:

1. Build eight spawn-band histograms from the weighted spawn rules, including
   summoned children (Ant Hole -> Baby/Worker/Soldier/Queen Ant; Centipede ->
   Centipede segment; Evil Centipede -> Evil segment). Alias species resolve to
   their canonical parent when the child contribution is accumulated.
2. Normalize each band by its total (rules plus child mass).
3. Area-weight the eight bands with the exact unequal constants
   `0.15, 0.15, 0.075, 0.075, 0.05, 0.05, 0.0125, 0.0125`.
4. Use species 19 (Square) as the reference mass.
5. For each petal, start from `petalDropMass[rarity] * referenceMass` where the
   masses are `50000, 15000, 2500, 100, 5, 1`, and distribute it over the
   species that drop that petal, proportional to their spawn mass and spawn
   weight. A chance above 0.9 saturates at 1; a chance below 1e-5 is removed.
6. Alias species inherit the finalized table, then entries are sorted by
   ascending chance.

`node tools/derive-drop-chances.mjs --verify` runs the original initializer and
compares all 102 finalized drop entries; the current output matches exactly.

## Spawn-time loot attachment

The drop table is consumed by the **component draws at spawn**, not by a roll at
death. An entity definition's `componentDrawCount` equals the number of petal
ids in its drop row (Bee: 6, Ladybug: 5, Rock: 3). `consume_component_draws`
draws one server RNG fraction per component and attaches the entry when
`fraction < chance`. The iteration order is the **drop table order** in
`schema/catalogs/drop-chances.json` (ascending chance), not the definition's
`petalTypeIds` order. A 40-seed probe of original function 144 matches table
order 40/40 for Ladybug, Rock, Bee, Hornet and Queen Ant, while definition order
diverges wherever the two orders differ (Ladybug 29/40, Rock 30/40, Bee 13/40,
Hornet 23/40). The attached list is the original `loot+8` count and `loot+9`
ids.

The death path only materializes the already-attached entries; it consumes no
additional RNG values. This preserves the original RNG stream: spawning a Bee
always consumes six draws, even when none of them attaches loot. The earlier
model of re-rolling the table at death produced extra draws and drops for
entities whose original loot list was empty.

`roll_entity_loot` remains as a domain helper for callers that need the old
per-entry probability roll, but `kill_entity` uses the spawn-time list.

## Player death retention

`retain_player_loot` groups the player's level-capacity inventory plus the
16-entry backpack FIFO by rarity, shuffles each group with the recovered
minstd/independent-bits shuffle, skips Basic (type 1) and a 10% roll, retains at
most three petals, loses at most ten, and converts 1% of retained rarity >= 2
petals to Pollen (19). The profile inventory is replaced by the retained list,
the backpack is cleared, the lost list is stored on the profile, and the
retained list is spawned as pickups.

## Pickups

A pickup uses the petal draw radius for rendering and the original pickup radius
35 for collection. Its lifetime is 32 s, or 42/52/62/62 s for rarity 2/3/4/5.
Multi-drop spawns receive the original radial impulse of 0.6.

## Experience

`spawnEntity` writes the entity definition's `scale` into `loot + 4`; the
damage path awards that value to the attacker's owning player. Level thresholds
are `floor(1.06 ** (level - 1) * level) + 3`. The rarity experience table
`2, 10, 50, 200, 1000, 2500` is the discard/salvage reward, not the kill reward.

## Remaining boundaries

`World::register_pickup`/`unregister_pickup` maintain the domain pickup
intrusive list (`pickup_prev/next`, `pickup_listed`, `World::pickups()`), used by
`legendary_exists`. Packet-cache invalidation is still open. The reward value
itself is the entity definition scale (`loot + 4`). The client's original death
animation and loot fly-out are separate. The contact resolver is a domain-level
equivalent of function 390; it does not reproduce every collision layer flag or
pair-order side effect.
