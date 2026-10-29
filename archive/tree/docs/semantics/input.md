# Input packets

Status: framing, fixed-size commands, NUL-terminated strings, opcode-4 restart
player creation, opcode-6 spawn, per-message sequence gating, latest-value
input application and the original lossy out-of-bounds readers are
implemented; per-session sequence slots and the full 160-byte command frame
side effects are still open.

## Framing

1. Copy the packet and apply the 256-byte rolling XOR key (`web/sp_server.wasm`
   key at `4576`; generated as `engine::net::kPacketXorKey`).
2. Read an unsigned LEB128 sequence (`max 5 bytes`), then one unsigned LEB128
   command opcode and its operands.
3. Repeat from step 2 until the buffer is exhausted. One send buffer can carry
   several independent messages, each with its own sequence number; the
   original `sp_server_send` loops over `(sequence, command)` pairs.

The original rejects a packet larger than 65,536 bytes and applies duplicate
suppression per message when the sequence is nonzero. `accept_input_sequence`
implements the strictly-increasing gate and is called once per message;
sequence 0 is always accepted. The ABI currently uses one global slot, not the
original per-network/local session slots.

## Command layouts

| Opcode | Meaning | Operands |
| ---: | --- | --- |
| 3 | suicide | varint argument |
| 4 | restart | none |
| 7 | disconnect | varint argument |
| 8 | discard petal | u8 slot, u8 petal |
| 10 | swap petals | u8 slotA, u8 valueA, u8 slotB, u8 valueB |
| 12 | input state | varint buttons, f32 angle, f32 strength |
| 13 | bench cycle | none |
| 0 | handshake | u8 prefix, 3 NUL-terminated strings |
| 2 | handshake | u8 prefix, 2 NUL-terminated strings |
| 5 | string | one NUL-terminated string |
| 6 | player spawn/name | one NUL-terminated string |
| 1, 9, 11 | reserved | opaque remaining bytes |

For opcode 12, `readSanitizedFloat` uses the original bit test:

```
if ((bits + 8388608) & 2130706432 == 0) value = 0
```

This maps subnormals, NaN and infinities to zero. The ABI stores the latest
input in `World::PlayerInput`: buttons, angle, non-negative strength,
`normalized_angle = fmod(angle, TAU)` and the packed 32-bit direction. Every
accepted opcode-12 message overwrites angle and strength; the movement impulse
is applied once per simulation tick from these latest values, not once per
packet.

Direction packing:

```
normalized = f32(fmod(angle, TAU))
wrapped    = fmod(f32(normalized), TAU)
scaled     = floor(fmod(wrapped + TAU, TAU) * DIRECTION_SCALE)
direction  = 0 <= scaled < 2^32 ? uint32(scaled) : 0
```

`TAU = 0x1921fb54442d18 * 2^-50`, `DIRECTION_SCALE =
0x144ad13d5bfeba * 2^-47`. Tests cover 0, 1, -1, π and 7000.

Accepted input also publishes the original avatar side effects: packed
direction becomes player field 2, and the low two bits of player field 31
become `buttons & 3`, preserving its other bits. These are separate per-entity
bytes (`player_look` / `player_expression`), so a respawn starts at zero and
does not inherit the previous avatar's look/expression. At angle 1 the original
look byte is 40; at -1 it is 214. Native tests cover button masks 0/1/2/3/4/5,
preserved upper expression bits and respawn reset. Both sparse and dense
publication are decoded through EOF in the native boundary test.

Source: `source/game/server/input.mjs:698–723`; original sender reads avatar
`entity+200` bytes 8/10 for fields 2/31. Run
`node engine/tests/oracle/player-wire-evidence.mjs` for original-WASM evidence
using real accepted input packets. Field 22 belongs to a different component,
absent on that player; it must not be labeled original action bits. Original
field 26 is the model byte, but the permanent domain contract reserves it for
kind, so model publication still needs a separate explicit extension. The
special model-toggle input is not reconstructed by these look/expression
changes.

## Restart and spawn

Original opcode `4` requests a restart. In the observed golden traces the
restart path creates the default player before any opcode-6 packet arrives
(`garden-idle` spawns at 1472 ms, while its first opcode 6 is at 1584 ms). The
engine treats opcode 4 as "create the default player when none exists", then
spawns the loadout petals; a later opcode 6 is ignored by the existing
`has_player` gate.

Opcode `6` carries one NUL-terminated player name. When the world has no
player, `WorkerApi` calls `spawn_player_default` (or the explicitly configured
spawn path) and `spawn_loadout_petals`.

An empty opcode 0/2 command at the end of a packet is accepted as an empty
handshake. The original string reader returns an empty string at end-of-buffer
instead of rejecting the packet; this matters for the restart packet
`02 04 03 06 00`, whose trailing `00` is an empty handshake.

## Latest-value input application

Original `655` writes both the wrapped angle and the non-negative strength to
the player record (`player+280/+284`) for every accepted opcode-12 message. The
movement path (`applyPlayerControls`) reads those two fields once per tick, so
the latest packet wins and the impulse is applied once per simulation tick. A
one-send buffer may contain several messages; each is gated by its own
sequence, and the final accepted message determines the tick's angle and
strength. The former first-post-spawn strength latch has been removed.

## Engine API

`engine::decode_input_packet` fills a vector of `InputMessage`:

```cpp
struct InputMessage {
  std::uint32_t sequence;   // per-message sequence varint
  InputCommand command;
};

struct InputCommand {
  std::uint32_t opcode;
  std::uint32_t buttons;
  std::uint32_t argument;
  std::uint32_t slot_a;
  std::uint32_t slot_b;
  std::uint32_t value_a;
  std::uint32_t value_b;
  float angle;
  float strength;
  std::string text;                 // first string, for 0/2/5/6
  std::vector<std::string> texts;   // all strings, for 0/2
  std::vector<std::uint8_t> payload; // unknown commands
};
```

`WorkerApi::send` applies `accept_input_sequence` to each message and then
dispatches the command, so concatenated `(sequence, opcode, payload)` groups in
one send buffer behave like the original loop.

## Evidence

- `source/game/server/input.mjs` `sendInput`, `readVarUint`,
  `readSanitizedFloat`, `inputButtons`.
- `schema/protocol.yaml` `input.commands`.
- Tests: `test_input_decoder` in `engine/tests/unit/test_main.cpp` covers
  opcode 12 fields, the byte layouts of discard/swap, handshake/name strings,
  restart/bench, and the sanitized-float bit test.

## Malformed and truncated packets

The original readers never abort the packet:

- `readByte` returns 0 at end-of-buffer;
- `readVarUint` returns the partial value (0 at end-of-buffer);
- `readSanitizedFloat` returns 0 when fewer than four bytes remain;
- `readString` scans to NUL or end-of-buffer and returns what it has.

`decode_input_packet` mirrors this: a truncated command still produces an
`InputMessage` with zeroed operands, and the loop terminates on the cursor
check. A packet that ends exactly after its sequence byte therefore decodes as
one opcode-0 handshake, which is how the restart packet `02 04 03 06 00`
terminates. Empty packets are accepted (the original loop breaks immediately);
only packets above 65,536 bytes are rejected. `test_input_decoder` covers the
empty packet, a sequence-only packet, truncated opcode 12/8 operands and a
reserved opcode payload.

The pending-byte alignment of the original 388 reader (a flag at reader `+12`
that skips one byte before the next varint/string) is recorded in
`source/game/server/input.mjs`; no shipped command sets the flag, so the domain
reader does not need it yet. The loop's pending branch requires two remaining
bytes; that condition is documented for the future per-session reader.

## Open

- Per-session sequence slots (the ABI keeps one global slot).
- Full input-button state machine; the decoder stores the raw bits and the
  movement/petal layers interpret attack/defend.
- Exact 160-byte command frame side effects and output replies.
- UTF-8 truncation of over-long strings.


## Client encoder

`client/src/net/input.ts` writes the same XOR/varint framing. `spawn(name)` emits
opcode 6; `input(buttons, angle, strength)` emits opcode 12 with little-endian
binary32 angle/strength; `restart()`/`benchCycle()` emit opcodes 4/13;
`discard(slot, petal)`/`swap(...)` emit 8/10; `suicide(argument = 0)` emits
opcode 3. `client/tests/camera-input.test.mjs` pins the exact packet hex for a
scripted restart/input/discard/swap/suicide/bench sequence. `client/src/schema/packet-key.ts` is generated from
`source/semantic/server-catalogs.json` and holds the 256-byte repeating key.

## Player spawn

`WorkerApi::configure_player_spawn(PlayerConfig, position)` keeps an explicit
override for tests and scripted scenarios. Opcode 3 with argument 0 sets the
current player's health to zero; the next tick reaps it. Without an explicit
override, opcode 6 calls
`spawn_player_default`: level 0, five Basic petals, the 0.00005 rare starter
roll, level-band position and the recovered defaults (radius 25, health 100,
contact damage 25, physics bits 0x41c80000). See `docs/semantics/player.md`.
