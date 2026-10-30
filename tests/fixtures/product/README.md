# Product fixtures

These fixtures are committed product inputs, not archived evidence. No test
reads `archive/`, old Git commits, an original WASM build or a historical golden
at runtime.

## Protocol vectors

`protocol/manual_vectors.json` contains small hand-authored packets. Each vector
documented below names its exact bytes, sequence, entity handles/flags, deletion
list and event list. The test decodes it with a fresh default
`BareSnapshotDecoder`; expected values are literal data, never produced by the
same generator during the assertion.

- `empty-snapshot-header`: `01 09 03 00 00 00` — packet version 1, sequence 9,
  empty entity list.
- `bare-activation`: `01 0c 04 00 01 00 78 56 34 12 34 00` — sequence 12,
  handle `0x12345678`, wire flags `0x34` XOR packet key byte `0x36` = `0x02`;
  no dense group is present.

## Native snapshot fixture

`protocol/native_fixture.cpp` is compiled by `engine/CMakeLists.txt` as
`engine_native_snapshot_fixture`. It drives the shipping path end to end:

- opcode 6 input creates the player through `WorkerApi::send()` and
  `spawn_player_default()`; `think()` advances the real fixed-step world;
- opcode 12 input (buttons + binary32 angle/strength) is consumed by twenty
  real ticks and moves the player;
- a mob of species 1 is spawned through `WorkerApi` ahead of the player;
- opcode 5 chat input publishes event 9 `fixture`;
- `domain_snapshot_bytes()` emits the post-spawn baseline (sequence 6), the
  input+mob+event snapshot (sequence 7), and after `despawn()` the deletion
  snapshot (sequence 8);
- the final packet (sequence 9) is a direct `SnapshotWriter` probe that writes
  species field 2 as `255`, the largest id the current one-byte wire can carry;
  it is a wire-boundary fixture, not a catalog row.

The `FLRR` v1 stream therefore has four length-prefixed packets. The executable
takes an output path and exits nonzero on any setup failure.
`tests/integration/native-snapshot.test.mjs` decodes the first three packets with
the product TypeScript decoder, asserts that player input movement is visible,
applies them to `WorldState`, and checks player default inventory, mob, chat
event and deletion plus a failed truncated decode that does not poison the next
packet. A separate assertion decodes the fourth packet and requires species
`255`; `256` is rejected by schema validation before generation.

## Update policy

- A fixture change must state the product rule it represents and the reason the
  old bytes are wrong; do not update an expectation merely to make a test green.
- Manual vectors are updated by editing the JSON and the prose above together.
- Native fixture changes must keep the real `WorkerApi` path and deterministic
  seeds; do not add an original replay. A direct `SnapshotWriter` packet is
  allowed only as the documented width-boundary probe, never as a replacement
  for the `WorkerApi` flow.
- Visual fixtures, if added later, must be reviewed product screenshots under
  this directory. Archived original screenshots are never used as a new
  baseline.
