# Damage and death

`engine/src/sim/damage.cpp` applies non-negative damage, subtracts in binary32
and clamps health at zero. Negative damage is ignored.

## Contact damage

`engine/src/sim/combat.cpp` implements the domain equivalent of original
function 390:

- overlapping bodies are pushed apart along the center normal;
- each receives the other's physics +44 contact damage;
- a body carrying world flag 32 (the player) receives a fixed 0.2 normal impulse
  away from the other body; static bodies are only separated;
- petals and their owner, two petals, drops, projectiles and same-owner bodies
  are skipped;
- the recovered 30-layer collision filter (`layers_collide`) gates the pair;
- player-versus-player damage uses the recovered
  `clamp((max(level) - 5) * 0.2, 0, 1)` scale;
- petal contact callbacks run before/after the bilateral damage for poison,
  heal suppression, slow, Peas split and Web tags.

The original resolver is invoked once per eligible collider pair per tick; this
pass does the same. It does not reproduce every pair-ordering side effect or
collision cache invalidation.

## Death

`damage_entity` records the last valid attacker on the target, clamps at zero
and calls `kill_entity` once (`death_processed`):

- **Petal**: clears the loadout handle, starts the catalog recharge timer, sets
  health to zero and keeps the entity as a corpse. The corpse timer is always
  1000 ms: the shipped attack trace reaches zero at 2350 ms and is reaped at
  3350 ms, and the death trace removes its petal at 5900→6900 ms; no golden
  trace exhibits the earlier 800 ms "attack held" branch.
- **Mob**: materializes the spawn-time loot list (the drop table is rolled by
  the component draws at spawn, not at death; see `loot.md`), spawns pickups,
  awards the attacker
  owner's player the entity rarity experience, sets health to zero and keeps a
  one-second corpse. Population refill runs before the corpse sweep and before
  the AI phase, so the replacement appears one tick after the corpse disappears
  and its spawn RNG draws precede same-tick AI timer redraws; this reproduces
  the one-tick entity-count dip in the `attack`/`spawn` traces.
- **Player**: runs the retention pass, spawns retained pickups, stores the lost
  list on the profile, records `last_death_score`/`last_death_level`, walks the
  24 loadout handles recursively to damage/clear owned children, then clears
  the loadout and destroys any remaining petals.
- **Other**: destroys the entity.

`engine/src/sim/tick.cpp` also runs the death domain for any entity whose health
reached zero outside the contact path, expires pickups after their lifetime and
drops stale petal orbit records. Health-0 mob and petal corpses stay active and
keep contributing to the world entity count until their `death_time_ms`
deadline; AI targeting and contact damage ignore them.

`World::record_hit` coalesces hit notifications per target+epoch+tick with a
reference count and a sorted known-entity gate; `damage_entity`/`kill_entity`
preserve last-attacker, killer-name, death score/level and recursive
child-handle cleanup; `spawn_loot_drops` applies the rarity-5 legendary
duplicate check through the pickup intrusive list. The original 4124-byte
message object and virtual destructor addresses remain open; see
[attribution.md](attribution.md).
