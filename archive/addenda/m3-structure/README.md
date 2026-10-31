# M3 retired structure

Append-only source copies from revision `7200f631eef7bda996c0a6648812b1f14227ad9c`.
`inventory.json` records paths, bytes and SHA-256. The original archive inventory
and archive/tree were not changed; no move/restore script was rerun.

| Saved source | Retired part / current replacement |
| --- | --- |
| WorkerApi | skeleton/full-field injectors, StateDump and parallel caches retired; current SnapshotPublisher + ReplicationSession |
| snapshot_writer.hpp/cpp | parallel PacketBuilder and per-field helpers replaced by one schema-checked SnapshotEncoder |
| abi.cpp | original probes/contact/RNG/field readers retired; core ABI + real product diagnostics |
| combat.cpp | strategies 0–5/7 and global debug retired; strategy 6 with per-World CollisionContext; health/death split |
| component_store.hpp | unused historical pool retired; EntityPool/World domain storage retained |
| snapshot.ts | alternate/skeleton decoders retired; one transactional SnapshotDecoder; small dense adapters only in tests |
| main.ts | parity hooks retired; app/session/loop/input/frame/test API responsibilities separated |
| path.ts / sprites.ts | no product consumers; unused generic caches retired; actual retained resources owned by renderer |

These files are for manual historical inspection only. No product build,
generator, test, identity, performance check or release reads this addendum.
See [M3 implementation mapping](../../../docs/m3-structure.md).
