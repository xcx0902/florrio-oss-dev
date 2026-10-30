# C++20 engine

Domain-organized reconstruction of the Legacy Florr server and shared rules.
The engine is a deterministic, fixed-step simulation compiled to WebAssembly and
also built natively for tests. It does not read the original WASM/WAT, recovered
JavaScript or parity recordings; those live in [`../archive/`](../archive/README.md).

## Layout

```
include/engine/core/      f32, Vec2, RNG, fixed-step clock, byte reader/writer
include/engine/model/     Entity, EntityHandle, EntityPool, World, Catalog, ComponentStore
include/engine/net/       input decoder, snapshot writer, WorkerApi
include/engine/sim/       tick, movement, spawn, spatial, collision, combat, damage, loot, petals, progression
include/engine/schema/    generated layout accessors (do not edit)
include/engine/catalog/   generated catalog types/data (do not edit)
src/                      implementations
tests/unit/               native unit tests
```

`schema/` is the source of truth for protocol framing, struct layouts and
catalogs. Generated files are committed so a native build does not need Node.

## Build and test

```sh
npm run build:engine        # cmake --fresh -S engine -B build/engine -DCMAKE_BUILD_TYPE=Release
npm run test:engine         # build + ctest --output-on-failure --no-tests=error
npm run build:engine:wasm   # em++ -> client/public/server.wasm
```

The native build uses `-Wall -Wextra -Werror -ffp-contract=off -fno-fast-math
-fno-exceptions -fno-rtti`. CTest runs twelve targets: the main engine suite plus
centipede, death lifecycle, simulation, projectiles, poison flash, rose,
passives/pets, peer visibility, pickup arrival and the two schema-contract
checks. Schema contracts require Node because they invoke
`tools/check-schema-layouts.mjs`.

The wasm build uses Emscripten pinned by [`.emscripten-version`](../.emscripten-version)
and writes `client/public/server.wasm` plus a build manifest. The module has no
CRT constructor pass: `sp_server_init` placement-news `WorkerApi` into static
storage before calling `init(true)`.

## C ABI

`include/engine/abi.h` exports:

| Export | Meaning |
| --- | --- |
| `sp_server_init` | reset world, initialize entity handles |
| `sp_server_send(ptr, len)` | decode one input packet |
| `sp_server_think` | run one fixed 50 ms tick |
| `sp_server_flush` | drain the output queue |
| `sp_server_entity_count` | active entity count (diagnostic) |
| `sp_server_output_count/data/size` | worker shim access to flushed packets |

`malloc`/`free`/`memory` are exported for the worker shim. The production worker
(`client/public/server-worker.js`) drives `send`/`think`/`flush` on a 50 ms timer;
`?manual=1` disables the timer for deterministic tests.

## Simulation invariants

- One tick is exactly 50 ms. Input packets are decoded once and applied to the
  next tick; no wall-clock time enters the simulation.
- Positions, angles, radii and velocities are `f32`. Arithmetic keeps
  `-ffp-contract=off` and no fast-math so native and wasm results stay close.
- The world starts with the three reserved storage records and the player spawn
  placeholder, then allocates gameplay entities from slot 3.
- Entity handles are stable for an entity's lifetime; death and pickup remove
  the handle, and a respawned player receives a new handle.
- Snapshot output is sparse: component masks select dense groups and individual
  fields carry their schema-defined widths. The writer preserves field order,
  the 256-byte XOR packet key, mask semantics and f32 bit patterns.
- Spawn, collision, combat, loot, petal and progression rules live in
  `src/sim/`; `src/net/` only encodes/decodes and never invents gameplay state.

## Tests

- `engine_tests` (`tests/unit/test_main.cpp`) is a thin runner; its 113 cases
  live in `tests/unit/cases/` grouped by core, entity pool, spawn/loadout,
  snapshot codec, WorkerApi, catalog, AI, domain snapshot, combat, dense
  framing and tail invariants.
- Domain suites cover centipede, death lifecycle, simulation, projectiles,
  poison flash, rose, passives/pets, peer visibility and pickup arrival.
- CTest registers ten targets. The retired layout/schema probe targets are not
  registered; `tools/run-tests.mjs engine` fails if the CTest inventory differs
  from `tests/product-tests.json`.

Native tests use the same `WorkerApi`, `domain_snapshot_bytes()` and C ABI entry
points as the wasm product, so a passing native suite exercises the shipping
code path rather than a separate test-only adapter.
