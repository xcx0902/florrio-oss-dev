# Damage attribution, hit events and legendary drops

Status: the domain path records attacker identity, killer name, per-epoch hit
messages with a merged count, observer-independent tick events, death score/level,
recursive child-handle damage and an intrusive pickup list.

## Hit events

`World::record_hit(target, attacker, amount, health_after)` coalesces repeated
damage to the same target within one tick:

- the first hit appends `{target, attacker, amount, health_after, tick, epoch,
count=1}`;
- later hits to the same target/epoch in the same tick add `amount`, replace
  `health_after`/attacker, and increment `count` once per merged hit.

`damage_entity` sets `Entity::hit_epoch = tick + 1`. M04 removed the global
known/pending visibility gate: every domain hit is recorded before any viewer
is considered. `freeze_tick_changes` assigns room tick/ordinal event IDs, each
read-only publisher filters with its own AOI/history, and the room calls
`finish_tick_changes` after every observer has published. The offline Worker
keeps its v1 event codec and performs the same cleanup after its sole publisher.
See [replication](../multiplayer/replication.md).

## Killer identity

`damage_entity` stores `last_attacker` on the target. `kill_entity` resolves the
attacker's player owner through the owner chain and records:

- `PlayerState::last_killer()` — the resolved attacker handle;
- `PlayerState::last_killer_name()` — the player's name for a player-owned attacker,
  otherwise the catalog species name;
- `Entity::killer_name` — the same string on the dying record before removal.

The attacker chain is resolved once at death; the dying record keeps the same
name until it is removed.

## Death score, level and child recursion

On a player death, `kill_entity`:

1. sets `Entity::death_flag` and `death_time_ms = now + 1000`;
2. runs the retained-loot pass and spawns the retained drops;
3. stores `PlayerState::last_death_score()` from `PlayerLoadout::score()` and
   `PlayerState::last_death_level()` from the profile level;
4. walks all 24 owned loadout handles (`slot*3 + instance`), recursively damages
   live children to zero, and clears stale handles;
5. clears the loadout and destroys any remaining player petals.

Mob kills award the entity definition scale as experience and add the same
amount to the loadout score.

## Legendary duplicate suppression

A rarity-5 petal is not spawned when `legendary_exists(world, dead, type)` is
true. The check covers:

1. the local player's active loadout, unless that player is the dying owner;
2. every handle in `World::pickups()`.

`World::register_pickup` / `unregister_pickup` maintain the intrusive list
(`Entity::pickup_prev/next`, `pickup_listed`) and are called by
`spawn_loot_drop` and `World::destroy`. `spawn_loot_drops` applies the legendary
check before each drop, scanning the loadout lists and the pickup intrusive
list.

## Open

- the exact message-object byte layout (the domain object carries epoch and
  merged-count semantics);
- killer-name short-string/heap growth beyond the domain `std::string`;
- packet-cache invalidation epochs for every changed loadout slot;
- the exact pickup free-list layout (the domain list preserves order and
  intrusive links).
