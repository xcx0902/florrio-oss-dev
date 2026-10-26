# World and entity layout

## Evidence

- `source/game/server/initialization.mjs`: `WORLD = 22928`,
  `ENTITY_BASE = 419020`, `ENTITY_BYTES = 496`, `ENTITY_COUNT = 16384`.
- `reports/server-spawn-manager-192.md`: manager at world+192, 56-byte records,
  world+95 bit 8, active vector at +1676.
- `reports/server-initialization.md`: four-record zeroing order, free/active
  lists, arena components.
- `reports/server-entity-definitions.md`: 116-byte definition records.
- `reports/client-entity-snapshot.md` and
  `source/game/client/entity-snapshot-map.json`: 63 wire fields and 19 dense
  component groups.

## World

`World` is a static object at 22,928. The generated C++/TS structs in
`engine/include/engine/schema/generated.hpp` and
`client/src/schema/generated.ts` encode these offsets:

| Offset | Field | Confidence |
| ---: | --- | --- |
| 0 | arena settings active | high |
| 1 | arena settings enabled | high |
| 2 | arena count enabled | high |
| 95 | flags (bit 8 used by spawn manager) | high |
| 312 | component 8 owner/revision/state | high |
| 624 | arena settings component | high |
| 1032 | arena settings vector | high |
| 1488 | arena count component | high |
| 1632 | arena count vector | high |
| 2140 | revision counter | high |
| 68268 | entity revision table A (u32[16384]) | high |
| 133804 | entity revision table B | high |
| 199340 | entity revision table C | high |
| 264876 | serialization cache entries (8 bytes × 16384) | high |
| 396092 | entity slots (496 bytes × 16384) | high |

The struct is 8,522,556 bytes. `OutputQueue` and the catalog tables are separate
globals in `schema/layout/session.yaml`, not members of `World`.

## EntitySlot

| Offset | Field | Confidence |
| ---: | --- | --- |
| 0 | world pointer | high |
| 16 | 32-bit generation handle | high |
| 20 | intrusive list owner | high |
| 24 | list previous | high |
| 28 | list next | high |
| 92/93/95 | component flag bytes | high |
| 312/376/464 | tracked marks and revisions | high |

Most component payloads are outside the 496-byte record and are reached through
world tables. The generated struct fills unnamed gaps with `_padding_0x...`.

## Entity handle

`index = raw & 0x3FFF`, `generation = raw >> 14`. The wire form is
`rotl(raw, 14)`; `EntityHandle::from_wire`/`to_wire` implement the rotation.
`sp_server_init` assigns nonzero generations from the 64-bit LCG
`state * 6364136223846793005 + 1`, using `state >> 33` and rejecting
`generation & 262143 == 0`.

## Player input state

`World::PlayerInput` stores the latest decoded buttons, angle, non-negative
strength, `normalized_angle = fmod(angle, TAU)` and the packed direction. The
ABI applies every accepted opcode-12 message to this state; the movement
impulse is applied once per tick by `apply_player_controls`. Avatar side effects
remain open.

## Snapshot writer

`SnapshotWriter::write_world` serializes every active entity in slot order using
the current fixed record (handle, kind, position, angle, health) inside the
original type-1 header/count framing. `spawn_entity` marks the allocated slot active; the unit test covers
spawn + write_world + decode. This is not yet the original component/event
encoding.

## Component store

`engine::ComponentStore` provides 30 type-erased dense pools keyed by the
original component id. `ComponentPool<T>::attach` returns a stable index and
reuses released indices FIFO; `get`/`release` are bounds-checked. The concrete
component structs and their per-id types are still open.

## Engine parity anchors

`engine::World::initialize()` reproduces the original 16,384-slot handle pass:

- LCG `state = state * 6364136223846793005 + 1`, `generation = state >> 33`;
- reject `generation & 262143 == 0`;
- `handle = index | generation << 14`;
- first handle `1048936448` (`0x3e858000`) matches
  `schema/generated/layout-probe.json` `worldGlobals.firstLiveEntity.handle`;
- the free list is FIFO (index 0 first), matching the original append-to-tail
  initialization order.

The unit test also checks 16,384 unique handles and the final LCG state
`11065635568950165505`, matching `layout-probe.json` `worldGlobals.rngState`.

## Open questions

- Exact meanings of most component fields; keep offsets and confidence.
- QuadTree field order is a low-confidence hypothesis
  (`schema/layout/spatial.yaml`); do not use it for production logic until a
  probe confirms it.
- `field44`, `field108`, `field109`, `field110` names remain offsets.
