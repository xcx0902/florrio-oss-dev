# Snapshot packets

Status: `sp_server_think` enqueues a **domain original-style snapshot** per
50 ms tick (`WorkerApi::domain_snapshot_bytes`). It uses the original type-1
header, one mask update per entity, sparse fields `2/5/7/8/24/26/28/31/38/49/53/55`, event
opcode 11 for coalesced hit notifications, automatic opcode 14 pickup transfers and
opcode 9 chat. `WorkerApi::set_full_field_framing(true)` emits every sparse field
types through the recovered writers for tests (60/61 are player-only); the compact subset remains the
live default. The TypeScript client decodes all 63 field ordinals, all 19 dense
groups, and events 9/11/14, and renders chat plus hit visuals.

## Skeleton fallback

```
u8      type = 1
varint  sequence
varint  reliableAck
varint  deleteCount
varint  updateCount
varint  eventCount
u32     deleted handle * deleteCount
record* updateCount:
  u32   handle (wire form)
  u8    kind
  f32   x
  f32   y
  f32   angle
  f32   health
  f32   maxHealth
  u8    level (player only; 0 otherwise)
event* eventCount:
  u8    opcode (9 chat, 11 entity-time, 14 petal transfer)
  u32   entity handle
  u8    transfer slot index (opcode 14 only)
```

The header/count framing is the original type-1 layout; the update entry body is
the transitional fixed record, not component declarations/fields. This format is
now only a fallback; the live server writes the domain mask entry below.

`WorkerApi::despawn` removes an entity and records it in `pending_deletes_`;
`WorkerApi::emit_event` queues an event. `WorkerApi::snapshot_bytes` writes
pending deletes/events once and clears both lists. `SnapshotWriter::write_delete` records entity removals in the
real delete block;
`write_event` appends an opaque event opcode/payload. Client decoding currently
supports chat opcode 9 (NUL string), entity-time opcode 11 (u32 handle) and
petal-transfer opcode 14 (u32 handle + u8 slot index).
`SnapshotWriter::write_world` emits every active entity in slot order and wraps
the records in the original type-1 header/count framing. `WorkerApi::snapshot_bytes(sequence)` exposes the same writer for native tests;
`WorkerApi::enqueue_snapshot(sequence)` puts one packet on the output queue.
`SkeletonSnapshotDecoder` reads the bytes into `Snapshot`/`EntityState`;
`WorldState.apply` stores it.

This fallback is deliberately narrow: update entries carry the fixed record
rather than component declarations/fields. The live path uses the original
mask/dense framing described below.

## Domain live snapshot

`OriginalSnapshotWriter::write_mask_domain_fields` writes one mask entry with
these ascending sparse fields:

| Field | Value | Component evidence |
| ---: | --- | --- |
| 2 | player packed look byte; species id for other kinds | constructor 491 offset 8 |
| 5 | camera-follow x | interpolated position (478 + 16) |
| 7 | physics collider radius, also the client's visual radius | interpolated radius (467 + 8) |
| 8 | positive remainder × shipped f64 scale, truncated to u16; only when encoded value changes | 609 + 8 |
| 24 | camera-follow y | interpolated position (478 + 112) |
| 26 | permanent domain kind (1 player, 2 mob, 3 petal, 4 drop, 5 projectile) | 491 + 9, domain extension |
| 28 | visual world y | interpolated position (609 + 40) |
| 31 | player expression/action bits; loadout instance for other kinds | 491 + 10 |
| 38 | visual lifecycle death bit (0 alive, 1 death processed) | constructor 809 offset 8 |
| 49 | visual world x | interpolated position (609 + 64) |
| 53 | current health | 458 + 8 |
| 55 | maximum health | 458 + 12 |

Field 7 comes from original server entity+188, component+8
(`simulation-tick.mjs:7735–7773`). The Basic initializer func433 stores 10 there
(`petals.mjs:37`), and all five original starter petals report 10 at runtime.
The native catalog draw radius is 14; that catalog value is not field 7.
Both sparse and default dense snapshots now use `Entity::collision_radius`;
neither the catalog nor the collision simulation was changed for this fix.
The strict server comparator already checks this same physics radius.

Field 8 uses `pack_snapshot_angle`: fmod by tau, add tau if negative, multiply
by exact `0x1.45f1c0e995ab9p+13`, truncate, keep u16. Original func94 compares
the encoded packets when marking a revision; changing a simulation angle
within one quantization bin does not publish field 8. Native probes capture
0.00005 -> 0, -1 -> 55104 and pi -> 32767. No simulation angle rounding changed.

Fields 53/55 are the recovered health component (`constructor 458`, offsets 8
and 12) from `source/game/client/entity-snapshot.mjs`; the same table is in
`schema/protocol.yaml:output.snapshot.fieldComponents`. Field 26 is a documented
permanent domain extension. For players it occupies the original model byte;
the domain client defaults the model to zero rather than interpreting kind 1
as original model 1. Field 2 must not be filled with a synthetic player species:
accepted input stores `Entity::player_look`, and both sparse and default dense
writers publish that byte. Field 31 publishes `player_expression`; its low two
bits are attack/defend (`buttons & 3`), while other bits are preserved. Semantic
state dumps still report player species/type 0.

The runnable original-WASM probe is
`engine/tests/oracle/player-wire-evidence.mjs`. Original input writes avatar
`entity+200` bytes 8/10 (`source/game/server/input.mjs:698–723`), which the
snapshot sender publishes as fields 2/31. Field 22 is **not** the input buttons:
its sender reads `entity+100+8`, and that component is absent in the probed
player. Client constructor 670 targets `entity+52`, whereas the renderer's
`entity+144` comes from constructor 756 / field 14 (effect flags). The original
model byte (field 26) remains separate from the accepted permanent domain
extension: the archived-client adapter publishes model 0, while the domain
transport retains its signed-off kind semantics.

Equipped petals publish domain byte fields **11 = slot, 12 = instance** in
the live compact path, not only in the optional full-field test mode. Values
come from `create_equipped_petal` / `spawn_petal` and the actual loadout state;
instance zero represents the slot, and field 2 retains the petal catalog type.
These reuse original world-capacity field ordinals as an explicit domain
extension; they do not claim original per-petal semantics for fields 11/12
(`simulation-tick.mjs:7981–8066` reads original world+624 bytes 248/249).

Players additionally publish actual carried types in field **60 byte[16]**
and latched slot recharge in **61 u16[8]**. These are indexed sparse arrays,
including explicit zero inventory entries after discard/clear, sent initially
and when the corresponding array changes. Reserve types survive profile
restoration; absent petal entities do not erase a cooling-down slot's type.
Nonplayers and full-field placeholder writers do not fabricate these arrays.
Source: `simulation-tick.mjs:10516–10665`, loadout+20 and loadout+100.

Field 61 is readiness, not remaining time: 65535 is ready, and each slot takes
the minimum progress of its missing catalog instances. The original computes
f32(elapsed * 65535) / duration, truncates/clamps, then publishes a u16.
The value is latched during equipped-petal refresh before contacts, preserving
the original phase even if a petal dies later in that tick. The native domain
derives elapsed progress from its existing remaining recharge timers; this
does not claim to reconstruct all original independent-instance timer behavior.
`tests/oracle/loadout-wire-evidence.mjs` invokes original funcs43/94 and ticks:
Basic's 50/1250/2450/2500ms progress is 1310/32767/64224/65535, with type1
retained while its petal is absent.

`domain_snapshot_bytes` writes pending deletes, pending events, one opcode-11
event per coalesced hit, real pickup-transfer events, then one mask update per active
entity. When full field framing is enabled, it also writes every remaining
sparse field id through the existing `OriginalSnapshotWriter` helpers. Entities
with a configured dense group / byte group / mask fallback get an additional
`write_dense_values` entry after the compact record. When no explicit value is
configured and `default_dense_groups()` is true (the default), the writer can add
the derived groups 52 (fields 22/54), 56 (field 36), 72 (camera), 116
(health/maxHealth), 120 (raw angle + visual y/x), 140 (radius), and 152
(look/species, kind, expression/variant). The dense payload is exactly 63 bytes;
profile records retain the complete declaration mask so the next dense record
has the same length. This redundant dense record is omitted unless both camera
axes and the encoded angle changed: its complete group72/120 payload would
otherwise republish an unchanged target. `set_default_dense_groups(false)` restores the
compact-only framing used by the exact-byte `test_domain_snapshot`. The client
decoder projects field 2 to `speciesId`, field 26 to `kind`/`typeId`, fields
53/55 to `health`/`maxHealth`, and merges those in `WorldState.applyPartial`.
`healthKnown`/`maxHealthKnown` distinguish an absent health field from a real
zero value.

The live writer tracks each wire handle: camera fields5/24 publish initially
and only when their respective f32 bits change; score59 uses score f32 bits;
angle8 uses the encoded u16. Visual fields49/28 have independent per-axis
position revisions: every actual f32 position change advances its revision,
including integration followed by an arena clamp back to the previous final
coordinate. Camera fields5/24 compare the final coordinate only. Thus a body
moving against an arena edge can update visual49 without camera5. The peer
publisher remembers revisions independently of final camera bits and clears
both baselines on leave/re-entry. Neither the full-field path nor redundant
default dense records may reintroduce unchanged axes. Repeating a scalar field
samples its current displayed value into its previous value and restarts its
clock even if the target is unchanged; the receiver must preserve that rule.

Evidence: original X/Y setters44/47 in
`source/decompiled/sp_server/functions-0000-0063.dcmp`, and the visual49
revision test versus camera5 in `source/game/server/simulation-tick.mjs`.
Native peer regressions cover sparse/default-dense and full-framing variants,
single-axis changes, ULP changes, clamping and re-entry.
Deletion/reset clears these stream caches. Explicit configured dense fixture
values remain an override. The scalar clock rule above follows original
`readInterpolated` (`entity-snapshot.mjs:208–218`); no receiver equality
suppression is implied.
Exact original revision publication for the remaining fields is still open.

The populated production API does not introduce spatial entities before its
first controlled player. Original `beginSnapshot` always adds metadata/control
records, but only enables `queryVisibleEntities` when viewer+100 is nonzero
(`simulation-tick.mjs:5897–5959`). The original boot oracle has 866 simulated
bodies, no controlled body, and its visibility flag remains zero: its first
packet is 148 bytes and subsequent packets are 28 bytes. The domain transport
has no standalone metadata records and emits an empty entity/event block at
boot. It does not seed camera/angle caches with unseen mobs. After joining,
ordinary publication resumes; the established stream remains active through
death. `engine/tests/oracle/boot-visibility-evidence.mjs` checks three boot
ticks and the first joined tick against the original. Unpopulated native
fixtures still publish their explicitly created entities without a session.

Input commands can remove entities before `think()` captures its before-list.
`send()` therefore records handles removed by accepted input mutations in the
same pending deletion queue. The real discard→swap capture regression checks
every decoded/native petal handle set over 68 flushes and verifies that the
deleted handle occurs exactly once. This covers the production input packets,
not merely a direct `World::destroy` call.

Full sparse field 14 is `Entity::effect_flags` (entity+192 effect component+8,
`simulation-tick.mjs:8108`), never a population band or synthesized input bits.
Field 36 is AI+8 activity flags (`simulation-tick.mjs:9290`), never a loadout
slot. The target AI branch sets bit0 and its idle/guard branch clears bit0
(`1557`, `1672`), preserving other bits. A later contact target change does not
publish activity early; dead/skipped AI retains the last value. Compact, full
and default dense group56 share that state. Native tests cover branch timing,
other-bit preservation and all three field36 encodings.

Field 38 is published from `Entity::death_processed`, not inferred from
`health == 0`. Original damage sets health's death bookkeeping and ORs bit 0
into the shape component (`damage.mjs:451–453`); the sender reads shape+8
through entity+184 (`simulation-tick.mjs:9391–9434`). The client maps it to
constructor 809+8. Mobs, petals and projectiles remain authoritative corpses
for 1000 ms before the tick removes them, so the visual death flag must reach
the client during that window. The existing 63-byte default dense payload is
unchanged; field 38 travels in the sparse record and is not overwritten by
the following dense record. Full-field mode publishes the same lifecycle bit.
Other original shape flags are not claimed reconstructed by this death-bit mapping.

`Entity::component_presence_bits` is the native 30-slot `std::bitset` presence
table; `Entity::component_presence` is its 30-bit wire projection.
`WorkerApi::set_component_presence(index 1..30)` updates both, and
`Entity::component_present(index)` reads the table. Field 26 is an explicit
**permanent domain extension** (the original has no field-26 species/kind
record), not a transitional placeholder. The client's `componentPointers` is a
`handle -> Set<ordinal>` presence table populated from the mask/ordinal
declarations and used to gate dense groups; it is the semantic equivalent of
the original's per-entity component pointers.

The archived-client writer (`OriginalClientSnapshotWriter`) now takes a
per-entity `component_mask`. Its default is `0x00184003` — components 1
(entity), 2 (definition), 15 (transform), 20 (health), 21 (angle) — and
`WorkerApi::original_client_snapshot_bytes` ORs `Entity::component_presence`
into it, so a caller can add components 1..30 without changing the default
record. `OriginalClientSnapshotWriter::decrypt()` reverses the packet XOR for
tests and diagnostics; `test_original_client_component_mask` parses the
decrypted block and asserts the handle, flags byte and mask.

## Event writers

`OriginalSnapshotWriter` writes chat (9, NUL string), entity-time (11, handle)
and petal transfer (14, handle + slot index) events. Event count is in the header.
Only event 11 is synthesized from coalesced damage. The previous arbitrary
event-14 index `1 + (hit.count & 3)` was removed: original damage emits 11
(`damage.mjs:107–149`), while 14 originates in pickup/slot assignment after
`setEquippedPetalType` (`simulation-tick.mjs:898–1128`). The original receiver
stores a per-slot transfer visual using the entity's marked type and the slot's
recharge fraction (`snapshot-decoder.mjs:465–505`). `collect_drops` now queues
the actual drop handle and selected slot in `PlayerLoadout`; the live writer
drains this queue once. An exhausted carried inventory uses original byte255
sentinel. Collected pickups remain for 2000ms, avoiding removal before the
receiver handles the event, and cannot be collected twice. Drop field22 is
the real petal type;54 is collected bit0 (original pickup+8/+9).
This implements transfer publication and retention, while original pickup
500ms eligibility/proximity rules and the native backpack fallback remain
separate incomplete simulation semantics.

## Dense group specs

`client/src/state/field-types.ts` also carries `FIELD_COMPONENTS`, the recovered
field -> constructor/offset table for all 63 ordinals. Decoded fields are
projected into `EntitySnapshot.components[constructor][offset]`, and
`WorldState.applyPartial` merges nested component offsets. `DENSE_GROUP_SPECS` for all 19
groups, using the same field-type names as `DenseGroupDecoder`.
`DensePlanDecoder` accepts an explicit present-group set; absent groups consume
no bytes, matching the original target-existence gate. `OriginalBareSnapshotDecoder`
now uses the native component-pointer proxy for that gate, not a precomputed
mask argument. It supports the same
field types as `DenseGroupDecoder` (byte/f32/f64/varint/angle/string/bit/
reference and the array shapes).

## Client field catalog

`client/src/state/field-types.ts` mirrors the schema field-type sets and the 19
dense groups. `OriginalBareSnapshotDecoder` uses those sets instead of inline
ordinal lists. The decoder now tracks the declared component ordinals in
`componentPointers` and gates dense groups on those pointers; the old
`presentFor` mask callback remains available for tests. Group 152 still reads
only fields 2/26/31 unless `flags & 64` is set.

## Dense group catalog

`engine/include/engine/net/dense_fields.hpp` records the original 19 dense
groups, their component offsets, and the flags&64 extension of group 152
(58, 59, 60, 61, 62, 63). The writer helpers and the TypeScript dense decoders
cover all 19 groups, including the mixed groups 72/-16/-27 and the group 152
base/extended forms.

## Dense byte groups

`OriginalSnapshotWriter` writes dense byte, f32, string and angle+f32 groups
(no field terminator). `DenseGroupDecoder` takes explicit `{field,type}` specs
for byte/f32/f64/varint/angle/string; `DenseByteGroupDecoder`,
`DenseFloatGroupDecoder`, `DenseStringGroupDecoder` and `DenseGroup52Decoder`
are convenience wrappers. Group presence is supplied by the caller or by the
native component-pointer proxy; all mixed groups listed below are implemented.
`write_dense_byte_groups` packs several byte-only groups into one update entry.
`write_dense_bit_group` packs dense bits LSB-first (group 124 fields 29/40);
`write_dense_float_bit_group` covers group -8 fields 13/37;
`write_dense_reference_group` covers group -15 fields 23/57;
`write_dense_group72` covers mixed group 72 (byte/float/string/byte[10]/reference);
`write_dense_group_minus27` covers group -27 (string/varint/f64/string/f32/bit/f64/varint);
`write_dense_group_minus16` covers group -16 (handle[10]/string[10]/bytes/f32/varint/varint[10]/f32/f32/byte/varint).
`write_dense_group152_base` covers fields 2/26/31 (u8) + 58 (varint).
`write_dense_group152_extended` adds 59 f32, 60 byte[16], 61 short[8], 62/63
u8 under `flags & 64`.

## Client path

- `client/src/state/snapshot.ts` — decoder, including event 9/11/14 and native
  component-pointer dense presence.
- `client/src/state/world.ts` — entity table, interpolation anchors, chat lines
  and visual hit indices.
- Browser test `snapshot decoder reads the C++ writer skeleton` builds one
  record and checks sequence, type, position, health, maxHealth and level.
- `test_worker_api` spawns a Cactus, checks `snapshot_bytes(7)`, then despawns
  it and verifies `snapshot_bytes(9)` contains one delete handle and no updates;
  then emits chat event 9 and verifies the event block.
- `test_snapshot_writer` writes one delete handle, one update record and one
  event-14 payload and checks all three blocks.
- `test_worker_api` also calls `original_snapshot_bytes(20,1)` for an active
  Cactus and checks the bare update entry.

## Original header (implemented, standalone)

`write_snapshot_header` writes `type=1`, `sequence` varint and `reliableAck`
varint. `empty_snapshot` appends three zero block counts (deletes, updates,
events). `SnapshotPacketBuilder` assembles delete/update/event blocks with
opaque payloads and computes the counts in `finish()`. TypeScript
`decodeSnapshotHeader`/`decodeSnapshotBlockCounts` read the header and counts.

`WorkerApi::init` resets the original sequence and clears pending deletes,
events and per-handle snapshot value tables. `WorkerApi::original_snapshot_next`
advances an internal original sequence counter. `WorkerApi::original_snapshot_bytes` builds a live original-style
packet from pending deletes/events and every active entity. Priority per entity:

1. byte-only groups 56/68/76/84/100/136/144 when presence bits 1..7 are set;
2. dense group 52 when `snapshot_dense52` or presence bit 0 is set;
3. mask + field 5 + field 8 when `snapshot_component_mask` or
   `component_presence` is non-zero;
4. bare update.

`WorkerApi::set_snapshot_groups`/`set_snapshot_byte` populate the byte-only
groups from an external per-handle table, keeping the Entity slot small.
`set_snapshot_float`/`varint`/`bit`/`string`/`double`/`reference` plus
`set_snapshot_group` cover live groups 112/116/120/124/-8/-15/-27. Array
setters (`set_snapshot_byte_array`, `byte_array10`, `short_array`,
`string_array`, `handle_array`, `varint_array`) cover 72/-16/152. All 19 groups
now have a live writer path from the external table. `set_snapshot_auto_position`
makes group 72 write `Entity::position` into fields 5/24, matching the client
position mapping. The
mask/field5 values on this alternate path are explicit placeholders; the live
domain path writes real fields. `CompositeSnapshotDecoder` tries the original
bare/mask/sparse decoder first, then the skeleton decoder; `main` applies
original packets with `WorldState.applyPartial` and skeleton packets with
`WorldState.apply`. `WorldState.applyPartial` merges a sparse/original update into existing
entities: missing X/Y/health/flags keep prior values, while field 8/dense angle
and present positions update. Dense, float, byte, varint, reference, string, bit and dense-byte
records are merged rather than replaced, so a sparse update does not drop prior
component values. `OriginalBareSnapshotDecoder` now accepts dense plans plus a present-group set,
so one packet can mix bare, mask/sparse, and dense updates. The original client
gates positive dense groups on the entity component pointer at that offset,
negative groups on entity flag bytes 45/46/48, and group 152's extended fields
on `flags & 64`. The TypeScript decoder does not instantiate the native entity
component table, so `DENSE_GROUP_COMPONENTS` maps each offset to its protocol
component ordinal (for example group 72 -> component 6, group 152 -> component
30) and `densePresentForMask` uses the tracked component-presence mask as a
proxy. Group 152 now reads only fields 2/26/31 unless `flags & 64` is set.
Negative offsets use the component ordinal `abs(offset)` (`-8` -> 8,
`-15` -> 15, `-16` -> 16, `-27` -> 27). Sparse field ordinals outside 1..63
are clamped to field 1, matching the original reader. Mask `field 8` and
dense group 120/152 angle values are converted to radians on the entity, while
the raw dense component value stays available in `denseFields`. Field 5 and
field 24 map to the body component's interpolated X/Y slots (`478+16`,
`478+112` in the recovered decoder), so they populate `entity.x/y`; this is a
high-confidence but still component-local mapping. The live `sp_server_think`
path uses `domain_snapshot_bytes`; `snapshot_bytes` remains the fixed skeleton
fallback used by older packets and tests.

`OriginalSnapshotWriter`/`OriginalBareSnapshotDecoder` implement two original
update entries:

- bare: handle, flags `2` (skip declarations) XOR `54`, sparse delta `0`;
- sparse declarations: flags `0` XOR `54`, ordinal deltas XOR `1`, terminator
  `1`, then field terminator;
- component mask: handle, flags `1` XOR `54`, 32-bit mask, sparse delta `0`;
- mask + field 1: same, then delta `1` + one u8 value + terminator `0`;
- mask + float fields (interpolated 5/7/13/24/28/49/59; static
  19/21/32/42/53/55): ascending deltas + f32 values, terminator; multiple
  fields can share one update;
- mask + field 35/18: delta + f64 value + terminator;
- mask + field 27: delta + f32 value + terminator;
- mask + strings 4/6/48: delta + NUL-terminated string + terminator;
- mask + string arrays 10/25: delta, element delta + string, array/field terminators;
- mask + handle array 3: delta, element delta + u32 handle, array/field terminators;
- mask + references 23/56/57: delta + u32 handle + terminator;
- mask + bit fields 29/33/37/40: delta + one bit + terminator, multiple fields
  share one entry;
- mask + field 8: delta + u16 raw angle (2*pi/65535) + terminator;
- mask + varint fields 15/30/41/44/51/52/58: delta + varint + terminator;
- mask + field 45: delta + f32 + terminator;
- mask + byte fields (1/2/9/11/12/14/17/20/22/26/31/34/36/38/43/46/47/50/54/62/63):
  delta + u8 value + terminator;
- mask + byte arrays 16/60: delta, element delta + u8, array/field terminators;
- mask + varint array 39: delta, element delta + varint, array/field terminators;
- mask + short array 61: delta, element delta + varint (u16 truncation),
  array/field terminators.

The mask is parsed into `EntitySnapshot.flags`; field 1 is exposed as
`byteField1`; all supported float fields are exposed as `floatFields` (and
field 5 also as `floatField5`). Sparse component declarations are parsed into
`componentPointers`; all 63 field ids and the 19 dense groups have decoder
coverage. The live path writes the compact domain subset by default;
`set_full_field_framing(true)` emits every sparse field for coverage tests.

Tests: `test_original_snapshot_writer` checks the bare update; browser
`original bare update decoder` checks handle/type; `test_snapshot_header`
checks `[1,9,3,0,0,0]` and a delete/event builder; browser `original snapshot header decoder` checks
`{sequence:9,reliableAck:3}`, `original snapshot block counts` checks
`{deletes:1,updates:0,events:2}`.

## Original encoding coverage

`schema/protocol.yaml` and `source/game/client/snapshot-decoder.mjs` describe:

- type 1 entity snapshot, sequence, reliable ack;
- entity deletes / updates / events blocks;
- 30 components, 63 sparse fields, 19 dense groups;
- flags for component masks, dense fields and component 30 extras;
- event opcodes 9/11/14 and unreachable event opcodes.

The C++ writer and TypeScript decoder implement the header/blocks, all 63
sparse field types, all 19 dense groups, component masks, component 30 extras
and events 9/11/14. The remaining original-encoding gap is byte-for-byte
equivalence with the original server's per-entity component pointer table and
its exact sparse-field emission order in the compact live path; the opt-in full
framing covers the complete field table for differential tests.

## Evidence

- `schema/protocol.yaml` output/snapshot sections.
- `engine/include/engine/net/snapshot.hpp`.
- `engine/include/engine/net/snapshot.cpp`.
- `client/src/state/snapshot.ts`.
- `engine/tests/unit/test_main.cpp` `test_snapshot_writer`.

## Original client wire framing

The archived client uses a separate adapter from the domain transport.
Function 1015 (`entity-snapshot.mjs`) strips
the first byte as the packet type, reads the sequence varint, then XOR-decrypts
**everything after the sequence** with the 256-byte key at client wasm address
`32272` (`EVENT_XOR_KEY_ADDRESS`). The decrypted stream is:

```
varint  reliable ack
varint  entityBlockLength
varint  removalCount
u16     removal framing
u32*    removed wire handles
u16     entity framing
entry*  u32 wire handle + (flags ^ 54) + declarations/dense/sparse fields
u32     0 handle terminator
u8      event framing byte
varint  event index (0 terminates)
u8      trailing framing byte
varint  ignored
```

`OriginalClientSnapshotWriter` encrypts only the bytes after the complete
sequence varint, including at sequences 128 and 16384. Records declare only
their independently recovered native components; later records publish changed
fields and per-axis position revisions. `WorkerApi` maintains an independent
visible/known set, deletion records and per-think packet queue. The WASM ABI
drains that queue exactly once rather than reserializing already-consumed dirty
fields at flush time. Original hit/pickup events are captured before the domain
publisher clears its event buffers.

The world record constructs original477 (ready flag, 50000×4000 arena). One
controller record constructs original478 and publishes camera, field56 body
reference and death/profile metadata. The body points back through field57;
native client `controller+144` and `body+188` must agree. Equipped petals have
field23 spatial parent 0 and field57 attribution to the body. Their original
catalog type is field50, mob type is field43, drop type is field22; domain field26
is never sent as an original model byte. Inventory/recharge use fields60/61.

`run-original-engine.mjs` validates native decoding and an actual same-RAF
game drawing, then adds trusted movement/attack/defend input after the unchanged
death scenario. It observes petal orbit expansion/contraction, health0 and the
death fade bit, body unbinding and a newly bound handle after trusted Enter.
Opcode3 suicide is explicitly disclosed when used to drive that death path;
it does not claim natural mob death. The state locator requires native world
and controller self-pointers, so packet arrival before native decode cannot
latch an unrelated allocation. No observer writes game memory.

The integration report is `tests/parity/original-engine/report.json`, bound to
the accepted `dist-next/server.wasm`. It is lifecycle evidence, distinct from
the archived golden Canvas/pixel equivalence reports. Historical protocol-only
8/8 results did not prove this path.
