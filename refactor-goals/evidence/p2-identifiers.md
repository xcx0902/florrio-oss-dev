# P2 — identifiers, constants and capacity rules

Status: implementation and targeted verification complete; final full gate is
recorded in `p3-fields-behavior.md` and the checklist execution row.

## RF-L1 — stable catalog symbols

- `schema/catalogs/petals.json` has 39 non-empty `symbol` values. Repeated
  display names are disambiguated by rarity: `RoseUnusual`, `RoseEpic`,
  `RoseRare`; `CactusRare`, `CactusEpic`, `CactusLegendary`; `BasicCommon`,
  `BasicUnique`.
- `schema/catalogs/entities.json` has 23 symbols. Centipede head and segment
  differ by name (`CentipedeHead`, `CentipedeSegment`, `EvilCentipedeHead`,
  `EvilCentipedeSegment`), and same-name Ladybug variants use
  `Ladybug`/`LadybugDark`/`LadybugShiny`/`MassiveLadybug`.
- `schema/catalogs/rarities.json` owns the eight rarity symbols and ordered
  indexes. `rarity_experience` and the generated `Rarity` type are indexed by
  that order.
- `tools/schema/validate.mjs` rejects empty symbols, non-PascalCase symbols,
  duplicates in one domain (case-insensitive), and future keyword collisions.
  Duplicate display names remain legal.

The generated identity files are:

| File                                                | Content                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `engine/include/engine/catalog/ids.hpp`             | `enum class Rarity`, `PetalId`, `SpeciesId`, `PetalBehavior`; id conversion helpers                  |
| `client/src/schema/catalog-ids.ts`                  | `Rarity`, `PetalId`, `SpeciesId` const objects and value types; no `const enum`                      |
| `engine/include/engine/catalog/state_flag_bits.hpp` | `EntityFlag`, `WorldFlag`, `ActivityFlag`, `PlayerExpressionFlag`, `InputButton`, `PetalVariantFlag` |
| `client/src/schema/state-flags.ts`                  | the same flag groups as const objects                                                                |
| `engine/include/engine/catalog/loadout_rules.hpp`   | slot/instance counts, unlock tiers, rarity experience                                                |
| `client/src/schema/loadout.ts`                      | generated TS view of the same capacity/tier rules                                                    |

All six are registered in `tools/schema/outputs.mjs` and
`schema/generated-outputs.json`; generation reports 26 outputs and 15 inputs.

## RF-L2 — call sites

- Engine sim, spawn, AI, movement, loot, diagnostics and snapshot paths use
  `catalog::PetalId`/`SpeciesId` or the group predicates in
  `engine/include/engine/model/catalog.hpp` (`is_peas_petal`, `is_web_petal`,
  `is_egg_petal`, `is_centipede_species`, `is_ant_species`).
- Client render, tooltip, menu, animation and snapshot projection use
  `PetalId`, `SpeciesId`, `EntityKind`, `PetalVariantFlag`,
  `PlayerExpressionFlag`, `ActivityFlag` and `EntityFlag` as appropriate.
- `engine/src/sim/player_loadout.cpp` cycles reserve slots through the generated
  catalog ordinal (`petals[index % petals.size()].typeId`); it no longer divides
  or subtracts a hard-coded family size.
- `engine/src/sim/petals.cpp` uses `PlayerLoadout::kActiveSlots` instead of the
  literal eight. `engine/src/net/snapshot_codec.cpp` uses the generated
  `catalog::kActiveSlots` for the recharge array bound.
- Wire-boundary tests keep raw numbers where they are testing bytes, sparse ids,
  unknown ids or malformed input; those are intentionally not replaced.

## RF-L3 — protocol identifiers

- `engine::protocol::InputOpcode` is used by `engine/src/net/input.cpp` and
  `engine/src/net/worker_api.cpp`; the TS `InputOpcode` generated in
  `client/src/schema/protocol.ts` is used by `client/src/net/input.ts`.
- `MessageType` is generated as a C++ enum and a TS const object; websocket
  dispatch, ping/pong and the native codec use the named members.
- `SNAPSHOT_EVENT`, `OUTPUT_PAYLOAD_TYPE` and the generated multiplayer
  `EventKind` replace opcode/event literals in the client decoder, world,
  worker and pick-up transfer paths.
- `engine/include/engine/net/protocol.hpp` aliases the generated packet sizes,
  queue bounds, field counts and XOR key sizes instead of restating them.
- The 50 ms simulation step is asserted against `net::kTickMs` in
  `engine/src/model/world_config.cpp`.

## RF-L4 — capacity, unlock and numeric rules

- `schema/catalogs/loadout.json` is the single source for 16 inventory slots,
  8 active slots, 3 instances per slot, unlock levels 15/30/45, the
  13/14/15/16 and 5/6/7/8 tier arrays, and the 8-entry rarity experience table.
- `PlayerProfile`, `PlayerLoadout`, the slot loops in death/pets/petals,
  diagnostics and `snapshot_codec` consume the generated C++ constants.
- `client/src/state/loadout-limits.ts` re-exports the generated TS constants;
  there is no second hand-maintained table.
- `schema/catalogs/petal-combat.json` owns `behavior`, `healAmount`,
  `drawRadius`, `collisionRadius`, `damage`, `health` and `orbitProfile`.
  `schema/catalogs/rarities.json` owns the rarity order.
- Timing, collision thresholds, spring constants and render durations remain
  module-local where they are algorithm details; the cross-end tick, capacities
  and unlock rules are schema-owned.

## RF-L5 — verification evidence

New schema tests in `tests/unit/schema-generation.test.mjs` cover duplicate
symbols, invalid casing, C++/TS value parity for `PetalId`/`SpeciesId`/`Rarity`,
sparse ids, unknown ids, draw-count/pool consistency and invalid loadout tiers.

Targeted results:

- `npm run schema:check`: 26/26 verified.
- `npm run test:unit`: 42/42 (includes the new identity/parity test).
- `npm run test:engine`: 19/19.
- `npm run test:client` split: client-unit 143/143, client-integration 88/88.
- `npm run test:integration`: 9/9.
- `npm run test:server:native`: 30/30.
- `npm run verify:dist-next`: passed, 106 files / 865947 bytes.

The engine golden tests (`engine_single_player_baseline_tests`,
`engine_replication_tests`, `engine_multiplayer_*`) and the cross-end
integration vectors remain unchanged and passing, so ids, wire bytes and
numeric results are preserved.
