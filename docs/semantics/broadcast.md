# Broadcast and event semantics

Status: the C++ `WorkerApi` owns the authoritative broadcast order. The
TypeScript client consumes the same type-1 snapshot envelope and event opcodes.

## Authority boundary

```
client input packet (XOR + varint sequence + opcode)
        │
        ▼
WorkerApi::send  ──► decode_input_packet ──► World::apply_input / loadout
        │
        ▼
tick(World, 50 ms)  (fixed 20 Hz)
        │
        ▼
WorkerApi::think ──► pending deletes / events / world state
        │
        ▼
domain_snapshot_bytes(sequence)
        │
        ▼
sp_server_flush ──► worker envelope (callbackId, finalResponse, transferable)
        │
        ▼
BareSnapshotDecoder ──► WorldState.applyPartial ──► Canvas2D
```

The server is the sole authority for positions, health, spawns, deaths, petal
recharge and drops. The client never predicts damage or spawns; it interpolates
only visual transforms between snapshots.

## Type-1 block layout

```
u8      type = 1
varint  sequence
varint  reliableAck
varint  deleteCount
varint  updateCount
varint  eventCount
delete*  u32 wire handle
update*  handle + flags + component mask/declarations + sparse fields + dense groups
event*   u8 opcode + opcode-specific payload
```

Delete entries are emitted before events and updates. A deleted handle is
removed from the client's entity map before the same packet's updates are
applied, so a slot can be reused later without stale components.

## Event opcodes

| Opcode | Payload | Meaning |
| ---: | --- | --- |
| 9 | NUL-terminated string | Chat line. Appended to `WorldState.chat` and rendered in the HUD. |
| 11 | `u32` wire handle | Hit clock. The client stores the receive time for the target. |
| 14 | `u32` wire handle + `u8` index | Petal-transfer visual: the drop handle and destination slot index. |

Opcode 11 is synthesized once per coalesced hit in a tick. Opcode 14 is queued
by pickup/slot assignment, not by damage. The two clocks are independent: event
14 does not overwrite the hit timestamp.

Event order inside one packet:

1. pending deletes (including visibility exits);
2. queued events (chat and other explicit events);
3. coalesced hit events (opcode 11);
4. pickup-transfer events (opcode 14);
5. mask updates in slot order, with optional dense groups attached.

## Known-entity and packet-cache gates

The server tracks `domain_known_` so visibility exits become deletes and a
newly visible handle receives full declarations. Later ticks use the component
mask plus sparse deltas. The client's `BareSnapshotDecoder` mirrors this
with a `masks` map keyed by handle; a delete drops the cached mask.

`WorkerApi::despawn` and `World::destroy` both remove the handle from the cache
and queue a delete. Tests cover that a deleted handle is not resurrected by a
stale update in the same packet.

When visibility is enabled, the server only emits entities intersecting the
viewer rectangle plus the controlled body. Death keeps the last peer view
instead of switching to the world origin or a menu camera.

## Chat queue

`WorkerApi::emit_event(9, text)` appends a NUL-terminated chat payload. The
client trims at 8 visible lines and preserves receive order. Chat is not
deduplicated: repeated identical strings remain separate events.

## Extension points

- New event opcode: add a writer in `SnapshotWriter`, a decoder branch in
  `client/src/state/snapshot.ts`, and a consumer in `WorldState`.
- New sparse field: add the field ordinal to `schema/protocol.yaml`, regenerate
  `DENSE_GROUP_SPECS`/`FIELD_COMPONENTS`, and extend `projectDomain`.
- New dense group: add the group offset and specs to `schema/protocol.yaml`;
  both the C++ writer and the TypeScript plan table are generated from it.

## Non-goals

The reconstructed server does not emulate WebSocket framing or reliable-ordered
delivery. The worker envelope is the transport boundary; snapshot blocks, event
order and observable state are the compatibility contract.
