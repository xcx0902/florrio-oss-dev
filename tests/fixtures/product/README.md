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
`engine_native_snapshot_fixture`. It uses the shipping `WorkerApi` and
`domain_snapshot_bytes()` path to emit a two-packet `FLRR` stream:

1. a player at `(100, 50)` with health 100 and five Basic loadout slots, a mob
   of species 1 at `(140, 90)`, and chat event 9 `fixture`;
2. a despawn of that mob and a second empty-event snapshot.

The native executable takes an output path and exits nonzero on any setup
failure. `tests/integration/native-snapshot.test.mjs` decodes both packets with
the product TypeScript decoder, applies them to `WorldState`, and asserts
player/inventory/mob/event/deletion plus a failed truncated decode that does not
poison the next packet.

## Update policy

- A fixture change must state the product rule it represents and the reason the
  old bytes are wrong; do not update an expectation merely to make a test green.
- Manual vectors are updated by editing the JSON and the prose above together.
- Native fixture changes must keep the real `WorkerApi` path and deterministic
  seeds; do not add an original replay or a test-only encoder.
- Visual fixtures, if added later, must be reviewed product screenshots under
  this directory. Archived original screenshots are never used as a new
  baseline.
