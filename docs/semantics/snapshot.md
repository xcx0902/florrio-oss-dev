# Snapshot packets

Status: `sp_server_think` enqueues one domain snapshot per 50 ms tick
(`WorkerApi::domain_snapshot_bytes`). The packet uses the type-1 header, one
mask update per entity, a compact sparse subset, optional dense groups and
events 9/11/14. The TypeScript client decodes all 63 field ordinals, all 19
dense groups and events 9/11/14. There is no skeleton or fallback framing.

## Packet framing

```
u8      type = 1
varint  sequence
varint  reliableAck
varint  deleteCount
varint  updateCount
varint  eventCount
u32     deletedHandle * deleteCount
record* updateCount
event*  eventCount
```

The sequence field is used for duplicate suppression. The reliable ack is a
varint followed by an ordered-queue lookup. Delete handles use the wire form
(below). Update records and events are described below.

## Entity handles

A handle is a 32-bit value: low 14 bits are the slot index, high 18 bits are the
generation. The wire form is rotated left by 14 bits. The client rotates right
by 14 before indexing `WorldState`. A respawned entity receives a new
generation, so a stale delete cannot remove the new body.

## Update record

```
u32     handle (wire form)
u8      componentFlags (1, 2, 8, 64, 128)
...     component declarations when not skipped
...     sparse field values
...     dense group values
```

Component declarations select dense groups. Flag 1 means a 32-bit mask;
otherwise ordinal deltas are read. Flag 2 skips declarations. Flag 8 enables
dense existing-component fields, flag 64 extends group 152 with fields 58–63,
and flag 128 marks entity byte 44 bit 0. A declared component pointer gates the
corresponding dense group; an undeclared group consumes no bytes.

## Live sparse fields

`domain_snapshot_bytes` writes these ascending field ids:

| Field | Domain meaning |
| ---: | --- |
| 2 | player look byte; species id for non-players |
| 5 | camera-follow x (f32) |
| 7 | physics collision radius (f32) |
| 8 | angle, quantized to u16 |
| 24 | camera-follow y (f32) |
| 26 | entity kind: 1 player, 2 mob, 3 petal, 4 drop, 5 projectile |
| 28 | visual world y (f32) |
| 31 | player expression/action bits; loadout instance for other kinds |
| 38 | visual death-processed bit (0 alive, 1 death processed) |
| 49 | visual world x (f32) |
| 53 | current health (f32) |
| 55 | maximum health (f32) |

Field 7 is the physics collider radius (`Entity::collision_radius`), not the
catalog draw radius. Field 8 packs the angle as:

```
wrapped = fmod(angle, tau); if (wrapped < 0) wrapped += tau
encoded = trunc(wrapped * 10430.219195527361) & 0xffff
```

The writer compares the encoded u16, so an angle change inside one quantization
bin does not publish field 8. Fields 53/55 come from the health component;
`healthKnown`/`maxHealthKnown` on the client distinguish an absent field from a
real zero.

Field 26 is a permanent domain extension: the product client uses it as kind and
does not reinterpret kind 1 as a model byte. Field 2 is the real
player look byte, stored by accepted input; it is never synthesized as a player
species. Field 31 carries `player_expression`; its low two bits are
attack/defend (`buttons & 3`) and the other bits are preserved.

Equipped petals publish **field 11 = slot** and **field 12 = instance** in the
compact path. Players also publish **field 60 byte[16]** (carried petal types)
and **field 61 u16[8]** (slot readiness). Field 61 is readiness, not remaining
time: 65535 is ready; each slot takes the minimum progress of its missing
catalog instances. The writer latches readiness during equipped-petal refresh,
before contacts, so a petal that dies later in the tick does not erase the
published progress. Explicit zero inventory entries are sent after discard or
clear.

## Dense groups

`engine/include/engine/net/dense_fields.hpp` defines 19 dense groups and their
component offsets; `client/src/state/field-types.ts` mirrors the field-type sets
and group specs. Groups cover byte, f32, f64, varint, angle, string, bit,
reference and array shapes.

The default derived groups are:

| Group | Fields |
| ---: | --- |
| 52 | 22 / 54 |
| 56 | 36 |
| 72 | camera |
| 116 | health / maxHealth |
| 120 | raw angle + visual y/x |
| 140 | radius |
| 152 | look/species, kind, expression/variant (extended by flag 64 with 58–63) |

The dense payload is exactly 63 bytes. Profile records retain the complete
declaration mask so the next dense record has the same length. The redundant
dense record is omitted unless both camera axes or the encoded angle changed.
`set_default_dense_groups(false)` restores compact-only framing for exact-byte
tests. The client projects field 2 to `speciesId`, field 26 to `kind`/`typeId`,
and fields 53/55 to `health`/`maxHealth`.

Dense group 152 reads only fields 2/26/31 unless flag 64 is set, then adds 58
(varint), 59 (f32), 60 (byte[16]), 61 (u16[8]), 62 and 63 (u8). Mixed groups
72, -16 and -27 have dedicated readers in both the writer and the client
decoder.

## Revision publication

The live writer tracks each wire handle:

- camera fields 5/24 publish initially and when their f32 bits change;
- angle field 8 publishes when its encoded u16 changes;
- score field 59 publishes when its f32 bits change;
- visual fields 49/28 have independent per-axis revisions: every actual f32
  position change advances the revision, including an integration followed by
  an arena clamp back to the previous final coordinate;
- camera fields compare the final coordinate only, so a body moving against an
  arena edge can update visual 49 without camera 5.

The peer publisher keeps revisions independently of final camera bits and
clears both baselines on leave/re-entry. Deletion/reset clears the stream
caches. Repeating a scalar field samples its current displayed value into its
previous value and restarts its clock even when the target is unchanged; the
receiver preserves that rule.

## Events

The header's event count covers events written by `SnapshotWriter`:

- opcode 9 — chat: NUL-terminated string;
- opcode 11 — entity time: handle;
- opcode 14 — petal transfer: handle + slot index.

`WorkerApi` synthesizes one opcode-11 event per coalesced hit in a tick.
Pickup/slot assignment queues the actual drop handle and selected slot in
`PlayerLoadout`; the live writer drains the queue once. A collected pickup
remains for 2000 ms so the receiver can process the event, and cannot be
collected twice. An exhausted carried inventory uses the 255 sentinel. The drop
publishes its real petal type and the collected bit.

## Client decoding

- `client/src/state/snapshot.ts` — `BareSnapshotDecoder` with
  `DensePlanDecoder`; events 9/11/14; rejects truncated packets, non-canonical
  varints, unknown opcodes, trailing bytes and non-finite f32 values.
- `client/src/state/field-types.ts` — field-type sets, 19 dense groups and
  `FIELD_COMPONENTS`.
- `client/src/state/world.ts` — `WorldState.applyPartial` merges health, maximum,
  kind, species, position, angle, dense fields and component offsets; keeps
  interpolation anchors, chat lines and visual hit indices.

There is no `SkeletonSnapshotDecoder` or composite fallback; every packet is
decoded against the live mask/dense contract.

## Tests

- `test_domain_snapshot` checks the compact domain packet bytes.
- `test_snapshot_writer_fields` writes one delete, one update and one event-14
  payload and checks all three blocks.
- `test_worker_api` spawns a Cactus, checks a domain snapshot, despawns it and
  verifies the delete block, then emits chat event 9.
- `client/tests/snapshot-domain.test.mjs` covers mask/dense decoding, absent
  groups, component-pointer gating, health/kind projection and malformed input.

## Open

- exact revision publication for fields not listed above;
- full per-instance recharge timer behavior behind field 61;
- peer visibility subset for entities outside the local interest set.
