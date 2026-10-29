# Protocol

Source of truth: [`schema/protocol.yaml`](../schema/protocol.yaml) for framing and
[`schema/transport.json`](../schema/transport.json) for the packet XOR key. This
document summarizes the worker envelope, input packet, output packet and
snapshot framing. It describes the implemented product contract, not every
historical reverse-engineering observation.

## 1. Worker envelope

Client → worker:

```ts
interface WorkerRequest {
  funcName: 'sp_server_init' | 'sp_server_send' | 'sp_server_think' | 'sp_server_flush';
  callbackId: number;   // -1 for init, otherwise a callback slot
  data?: Uint8Array;    // transferred; absent for init/think/flush
}
```

Worker → client:

```ts
interface WorkerResponse {
  callbackId: number;
  finalResponse: boolean; // true completes the callback
  data?: Uint8Array;
}
```

| Function | Behavior |
| --- | --- |
| `sp_server_init` | initialize world/catalogs and the 50 ms tick; flush initial output |
| `sp_server_send` | decode one input packet and apply its commands |
| `sp_server_think` | one 20 Hz simulation tick |
| `sp_server_flush` | drain the output queue, send a final empty response, free packets |

`server-worker.js` dispatches the exported C function, copies `data` into a
malloc buffer, and posts each response with the request's `callbackId`.
Intermediate packets use `finalResponse: false`; the empty completion uses
`finalResponse: true`.

## 2. Input packet

- Maximum length: 65,536 bytes.
- First stage: in-place rolling XOR with the 256-byte key in
  `schema/transport.json` (`packetXor.keyHex`).
- Then: unsigned LEB128 sequence number (at most five bytes), used to suppress
  duplicate/stale commands.
- Then: one or more commands. Implemented opcodes are 0, 2, 3, 4, 5, 6, 7, 8,
  10, 12 and 13; 1, 9 and 11 are reserved.

| Opcode | Role | Fields |
| ---: | --- | --- |
| 0 | handshake string | string |
| 2 | alternative handshake string | string |
| 3 | suicide | — |
| 4 | restart | — |
| 5 | string | string |
| 6 | player spawn/name | name string, level |
| 7 | disconnect | — |
| 8 | discard petal | slot |
| 10 | swap petals | slot A, slot B |
| 12 | input buttons/angle/strength | buttons, angle, strength |
| 13 | bench cycling | — |

Opcode 12 angle uses binary64 constants and is normalized before use. Name
strings are trimmed and UTF-8 truncated on the spawn path.

## 3. Output packet

The engine keeps a bounded queue of packets. `sp_server_flush` sends every
queued payload with `finalResponse: false`, then one final empty response with
`finalResponse: true`, then frees the packets and clears the queue.

Payload first byte selects the decoder:

| Type | Meaning |
| ---: | --- |
| 0 | handshake |
| 1 | entity snapshot |
| 5 | events |
| 2 | unknown/reserved |

## 4. Entity snapshot

- Sequence: varint, duplicate suppression.
- Payload after the sequence is XORed with the 256-byte snapshot key from
  `schema/transport.json`.
- Reliable acknowledgement: varint, followed by an ordered-queue binary search.
- Entity handle: 32-bit, low 14 bits index, high 18 bits generation; wire form is
  rotated left by 14 bits.
- Entity deletes: count + handles.
- Entity updates: count + handle + component declarations + field values.
- Events: count + opcode payloads.
- Trailing framing: preserved by the decoder.

Component model: 30 components, 63 sparse fields, 19 dense groups; dense
component 30 has six extra fields (58–63). Component declaration flags:

| Flag | Meaning |
| ---: | --- |
| 1 | declarations use a 32-bit mask instead of ordinal deltas |
| 2 | skip component declarations |
| 8 | dense existing-component fields |
| 64 | dense component 30 includes fields 58–63 |
| 128 | mark entity byte 44 bit 0 |

Event opcodes 9 (chat string), 11 (entity time) and 14 (visual) are decoded;
2–8, 10, 12 and 13 are not emitted by the current server.

Field 2 is the species id, field 26 is the entity kind (a permanent domain
extension), and fields 53/55 are health/maximum health. The full field ->
component projection is in `schema/protocol.yaml`.

## 5. Validation

`DecodeError` rejects truncated packets, non-canonical varints, unknown opcodes,
trailing bytes in a command and non-finite f32 values. The worker shim reports a
decode failure as an error response; it never falls back to a second framing.
