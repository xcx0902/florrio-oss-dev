# Protocol

Source of truth: [`schema/protocol.yaml`](../schema/protocol.yaml). This document
summarizes the worker envelope, input packet, output packet and snapshot framing.
It is a contract description, not a claim that every command field is known.

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

| Function | wasm index | Behavior |
| --- | ---: | --- |
| `sp_server_init` | 656 | initialize world/catalogs, schedule the 50 ms tick, flush initial output |
| `sp_server_send` | 655 | decode one input packet and apply its commands |
| `sp_server_think` | 654 | one 20 Hz simulation tick |
| `sp_server_flush` | 657 | drain the output queue, send a final empty response, free packets |

The archived `sp_server.js` glue dispatches `Module["_" + funcName]`, copies
`data` into a malloc buffer, and posts the response with the request's
`callbackId`. The parity facade in
[`tools/parity/deterministic-worker.js`](../tools/parity/deterministic-worker.js)
implements the same envelope around the original wasm.

## 2. Input packet

- Maximum length: 65,536 bytes.
- First stage: in-place rolling XOR with the 256-byte key at address 4,576.
- Then: unsigned LEB128 sequence number (at most five bytes), used to suppress
  duplicate/stale commands.
- Then: one or more commands. The original dispatcher handles opcodes 0, 2, 3,
  4, 5, 6, 7, 8, 10, 12 and 13; 1, 9 and 11 are reserved/unknown.

| Opcode | Role | Known fields |
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

Field-level wire types for opcodes 8/10/12/13 are not fully proven; see
`reports/server-input.md` and `source/game/server/input.mjs` for the recovered
control flow.

## 3. Output packet

The output queue is a `u8` count at 8,545,512 and a pointer array at 8,545,516,
capacity 16. Each packet object has:

| Offset | Field |
| ---: | --- |
| +4 | payload length |
| +12 | heap payload pointer, or zero for inline |
| +16 | inline payload, 4,096 bytes |

`sp_server_flush` sends intermediate packets with `finalResponse: false`, then
one final empty response with `finalResponse: true`, then frees every packet and
clears the queue.

Payload first byte selects the decoder:

| Type | Meaning |
| ---: | --- |
| 0 | handshake (medium confidence) |
| 1 | entity snapshot |
| 5 | events |
| 2 | unknown |

## 4. Entity snapshot

- Sequence: varint, duplicate suppression.
- Payload after the sequence is XORed with the 256-byte key at address 32,272.
- Reliable acknowledgement: varint, followed by an ordered-queue binary search.
- Entity handle: 32-bit, low 14 bits index, high 18 bits generation; wire form is
  rotated left by 14 bits.
- Entity deletes: count + handles.
- Entity updates: count + handle + component declarations + field values.
- Events: count + opcode payloads.
- Trailing framing: preserved, not fully named.

Component model: 30 components, 63 sparse fields, 19 dense groups, and dense
component 30 has six extra fields (58–63). Component declaration flags:

| Flag | Meaning |
| ---: | --- |
| 1 | declarations use a 32-bit mask instead of ordinal deltas |
| 2 | skip component declarations |
| 8 | dense existing-component fields |
| 64 | dense component 30 includes fields 58–63 |
| 128 | mark entity byte 44 bit 0 |

Event opcodes 9 (chat string), 11 (entity time) and 14 (visual) are decoded;
2–8, 10, 12 and 13 hit the original `unreachable` path.

## 5. Evidence

- `source/javascript/sp_server.js` — worker glue.
- `reports/server-behavior.md` — init/think/send/flush and queue layout.
- `reports/server-input.md` — recovered opcode dispatcher.
- `reports/client-snapshots.md`, `reports/client-entity-snapshot.md`,
  `reports/client-snapshot-decoder.md` — snapshot/event decoding.
- `source/game/client/entity-snapshot-map.json` — 63 field records with wire
  types and interpolation rules.
