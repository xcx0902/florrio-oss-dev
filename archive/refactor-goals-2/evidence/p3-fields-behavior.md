# P3 — fields and behavior semantics

Status: implementation complete; targeted checks pass. The final full gate is
recorded in the checklist execution row.

## Removed unconsumed field chain

- `schema/catalogs/entities.json` no longer has `opaque100`, `opaque104`,
  `opaque108` or `opaque110`. Their consumers were removed with the old spawn
  factory; no active runtime path read them.
- `schema/catalogs/entity-spawn-defaults.json` no longer has `flags92`,
  `physicsFlag48` or `dynamicHealth`. The generated
  `EntitySpawnDefaults` struct has `entityFlags`, `worldFlags`,
  `dynamicRadius`, radius/damage/health and the symbol/id fields only.
- The former `flags93`/`flags95` names were the raw entity/world flag bytes at
  the two spawn sites; they are now `entityFlags`/`worldFlags` and are copied
  through `spawn_entity(..., worldFlags, entityFlags)` in the same order.
- `engine/src/sim/spawn.cpp` no longer writes `component_flags92`; the entity
  spawn initializer sets the named flag groups directly.
- The `Entity` fields `flags`, `component_flags92`, `clock_valid`,
  `retarget_ms`, `last_hit_epoch`, `hit_count` and `effect_epoch` were removed
  when their consumers proved dead. `physics_flag50` became
  `skips_contact_response`; `physics_flag48` became
  `uses_mass_weighted_response`; `petal_render_flags` became
  `petal_variant_flags`.

## Named flags

`schema/catalogs/state-flags.json` generates both
`engine/include/engine/catalog/state_flag_bits.hpp` and
`client/src/schema/state-flags.ts`:

- `EntityFlag`: WebTag=3, BlocksSpawn=5, Owned=6, Arrival=7.
- `WorldFlag`: PlayerBody=5, WebTag=7.
- `ActivityFlag`: Engaged=0.
- `PlayerExpressionFlag`: Attack=0, Defend=1, Antennae=2.
- `InputButton`: Attack=0, Defend=1 (32-bit).
- `PetalVariantFlag`: EpicColor=0, Large=1.

`engine/include/engine/model/state_flags.hpp` supplies `has_flag`/`set_flag`.
The engine sim, snapshot publisher and client render/decoder paths use these
names; the remaining raw bit masks in the protocol bit-byte reader are
transport encoding, not entity/world state.

## Physics fields

`uses_mass_weighted_response` is a runtime `Entity` property decided by the
spawn family, not a catalog column. The old `physicsFlag48` catalog value was
deleted. `skips_contact_response` is likewise a named runtime property and is
used by the Web tag and projectile contact paths. The engine unit tests assert
the Rock mass response and Web contact behavior through these names.

## Orbit behavior

`petal-combat.json` declares the two behavior symbols `Orbit` and `RoseHeal`.
The generator emits `catalog::PetalBehavior` into `ids.hpp` and stores
`PetalBehavior behavior` plus `float healAmount` in `PetalCombat` and
`PetalOrbitState`. The old numeric `orbit_function` (665/682/other) and
`is_rose_orbit_function(uint32)` are gone.

Rose values are preserved: the pre-refactor source at
`git show fa610ea:engine/src/sim/petals.cpp` lines 197–198 uses
`10.0F` / `22.0F` / `3.5F` for the three Rose rarities. `petal-combat.json`
now owns those values and `engine/tests/unit/cases/catalog.inc` asserts the
generated row. `engine/tests/unit/test_rose.cpp` and the Rose lifecycle tests
continue to pass.

## AI attack behavior

`engine/include/engine/model/attack_behavior.hpp` defines
`AttackBehavior::{kNone, kHornetStinger}`. `Entity::ai.attack` is the only
selector; `dispatch_attack` switches on it. `species_debug::unknown_callbacks`
and the `AttackCallback` enum were deleted. The Hornet path still consumes no
RNG, spawns at the same offset and uses the same lifetime/contact values.

## HitEvent count

`HitEvent` keeps one `count` and no `refcount`. Repeated damage to the same
target within one tick merges amount, attacker, health-after and increments
`count` once; the world no longer maintains a second reference count. The
combat and replication tests that previously checked `refcount` were updated
to assert the merged `count`/amount behavior. `EffectPayload::refcount` is
unrelated (shared area-effect payload) and is retained.

## Drop draws and RNG order

`componentDrawCount` became `dropDrawCount` in the entity catalog and in
`EntityCatalogEntry`. `consume_component_draws` became
`draw_drop_candidates`; the `spawn_*_with_component_draws` entry points became
`spawn_*_with_drop_draws`. The loop still draws one server-RNG fraction per
drop-row entry, in the generated drop-table order, before the species
initializer. The count field is validated against the resolved alias-root
petal pool in `tools/schema/validate.mjs`; a mismatch and an alias cycle both
fail generation.

The engine golden baseline, the single-player fixture and the 9 integration
vectors pass, so the draw count, draw order and resulting loot are unchanged.

## Documentation

Updated active semantics: `catalog.md`, `spawn.md`, `loot.md`, `effects.md`,
`petals.md`, `loadout.md`, `input.md`, `ai.md`, `attribution.md`,
`docs/semantics/README.md`, `docs/refactor-continuation.md` and
`schema/catalogs/README.md`. `docs/multiplayer-protocol.md` is regenerated from
the same protocol schema.

## Verification

- `npm run format:check`, `npm run lint`: pass (517 files, 26 generated).
- `npm run schema:check`: 26/26.
- `npm run check:refactor`: 0 new violations; baseline refreshed.
- `npm run test:engine`: 19/19.
- `npm run test:unit`: 42/42.
- `npm run test:tools`: 29/29.
- `npm run test:client` split: client-unit 143/143; client-integration 88/88.
- `npm run test:integration`: 9/9.
- `npm run test:server:native`: 30/30.
- `npm run test:multiplayer`: functional profile PASS (runId
  `2026-11-03T15-51-42.148Z-f1388871`). `tools/deploy-smoke.mjs` now selects
  the newest native package by directory mtime instead of lexicographic name;
  the previous run had selected the older `e53b...` package and timed out.
- `npm run verify:dist-next`: pass.
