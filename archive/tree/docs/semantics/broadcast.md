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
WorkerApi::think ──► pending_deletes_ / pending_events_ / world state
        │
        ▼
domain_snapshot_bytes(sequence)
        │
        ▼
sp_server_flush ──► worker envelope (callbackId, finalResponse, transferable)
        │
        ▼
CompositeSnapshotDecoder ──► WorldState.apply / applyPartial ──► Canvas2D
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

Delete entries are emitted before updates and events. A deleted handle is
removed from the client's entity map before the same packet's updates are
applied, which lets a slot be reused in a later tick without stale components.

## Event opcodes

| Opcode | Payload | Meaning |
| ---: | --- | --- |
| 9 | NUL-terminated string | Chat line. Appended to `WorldState.chat` and rendered in the HUD. |
| 11 | `u32` wire handle | Entity-time/hit notification. The client records the timestamp for the target. |
| 14 | `u32` wire handle + `u8` index | Visual hit index 1..4; rendered as a short expanding ring. |

Hit events are coalesced per `(target, tick)` by the server: one opcode 11 and
one opcode 14 per target per tick even when several contact/damage passes touch
the same entity. This is the original 4124-byte message's observable shape and
keeps the packet bounded during dense collisions.

Event order inside one packet is stable:

1. pending deletes from the previous tick's entity destruction;
2. coalesced hit events, target order;
3. chat lines in enqueue order;
4. mask updates in slot order;
5. optional dense groups attached to their entity update.

## Known-entity and packet-cache gates

The server tracks `known_entities_` so it only emits full component
declarations when a client first sees a handle. Later ticks use the component
mask plus sparse field deltas. The client's `OriginalBareSnapshotDecoder`
mirrors this with a `masks` map keyed by handle; a delete drops the cached mask.

`WorkerApi::despawn` and `World::destroy` both remove the handle from the cache
and queue a delete. Tests cover that a deleted handle is not resurrected by a
stale update in the same packet.

## Chat queue

`WorkerApi::emit_event(9, text)` appends a NUL-terminated chat payload. The
client trims at 8 visible lines and preserves receive order. Chat is not
deduplicated: repeated identical strings remain separate events, matching the
original queue behavior.

## Extension points

- New event opcode: add a writer in `OriginalSnapshotWriter`, a decoder branch
  in `client/src/state/snapshot.ts`, and a consumer in `WorldState`.
- New sparse field: add the field ordinal to `schema/protocol.yaml`, regenerate
  `DENSE_GROUP_SPECS`/`FIELD_COMPONENTS`, and extend `projectDomain`.
- New dense group: add the group offset and specs to `schema/protocol.yaml`;
  both the C++ writer and the TypeScript plan table are generated from it.

## Non-goals

The reconstructed server does not emulate WebSocket framing, reliable-ordered
delivery or the original serializer's heap addresses. The worker envelope is
the transport boundary; snapshot blocks, event order and observable state are
the compatibility contract.
