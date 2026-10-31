# World and entity layout

## World

`World` is a current C++ domain type, not a byte-for-byte copy of the retired
native layout. It owns the EntityPool, loadout/profile, domain records,
clock, RNG, destruction notices and its CollisionContext. Wire offsets are defined only by
`schema/protocol.yaml` and the generated protocol views.

The old absolute-offset World/EntitySlot/PetalDefinition layouts and their
generated accessors are retired with the original-layout probe. They live under
`archive/`; no active build includes them. Unknown historical offsets are not
reintroduced as product struct members.

## Entity handle

`index = raw & 0x3FFF`, `generation = raw >> 14`. The wire form is
`rotl(raw, 14)`; `EntityHandle::from_wire`/`to_wire` implement the rotation.
`sp_server_init` assigns nonzero generations from the 64-bit LCG
`state * 6364136223846793005 + 1`, using `state >> 33` and rejecting
`generation & 262143 == 0`.

## Player input state

`PlayerInput` in `model/world_records.hpp` stores the latest decoded buttons, angle, non-negative
strength, `normalized_angle = fmod(angle, TAU)` and the packed direction. The
ABI applies every accepted opcode-12 message to this state; the movement
impulse is applied once per tick by `apply_player_controls`. Avatar
look/expression publication is described in [input.md](input.md).

## Snapshot writer

`SnapshotPublisher::publish` serializes active entities in slot order through the
live mask/dense format generated from `schema/protocol.yaml`. The native
`test_worker_api` and `test_snapshot_writer_fields` cover spawn, update, delete
and event blocks. Full framing is in [snapshot.md](snapshot.md); the cross-end
fixture in `tests/integration/native-snapshot.test.mjs` drives real
`WorkerApi` bytes into the TypeScript decoder.

## Storage and lifecycle

EntityPool owns current domain Entities, generation validation and FIFO slot
reuse. The former ComponentStore had no live product consumer and is retired.
`World::initialize` resets domain data and collision cache before the handle
pass; `World::destroy` invalidates relationships, AI/pickup registration and
spatial state once. SnapshotPublisher consumes its destruction notifications.
ReplicationSession owns per-peer known handles and optional publication history.

## Initialization anchors

`engine::World::initialize()` performs the 16,384-slot handle pass:

- LCG `state = state * 6364136223846793005 + 1`, `generation = state >> 33`;
- reject `generation & 262143 == 0`;
- `handle = index | generation << 14`;
- first handle `1048936448` (`0x3e858000`);
- free list is FIFO; World reserves slots 0–2, then gameplay starts at slot 3.

The unit test checks 16,384 unique handles and the final LCG state
`11065635568950165505`.

## Retired layout material

The archived layout files and probe are historical evidence only. Current C++
layout is governed by `engine/src/core/contracts.cpp` (fundamental invariants and
handle constants), not by absolute offsets copied from the original binary.
