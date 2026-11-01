# C++20 product engine

The native and wasm builds share `engine_core`; the offline Worker and C ABI
live in the explicit `engine_worker_adapter` library. `sources.cmake` owns both
disjoint source lists. Rules remain deterministic with a fixed 50ms tick and f32
positions/angles. `schema/` owns protocol and catalogs; committed generated views
let native compilation run without invoking Node.

```sh
npm run build:engine         # incremental native Release configure/build
npm run build:engine:clean   # explicit fresh configure/build
npm run test:engine          # build + all 13 manifest-listed CTest targets
npm run build:engine:wasm    # pinned Emscripten CMake -> build/wasm/server.wasm
node tools/verify-abi.mjs    # manifest/header/worker/actual wasm consistency
```

Strict options include `-Wall -Wextra -Werror -ffp-contract=off -fno-fast-math
-fno-exceptions -fno-rtti`. Toolchain pins are not upgraded by this refactor.

## Boundaries

- `model/entity_pool.hpp`: FIFO slot allocation and generation-checked handles.
- `model/world.hpp` + `src/model/world.cpp`: authoritative domain data,
  reset/initialize/destroy, per-world collision cache and destruction notifications.
- `model/world_records.hpp`: domain records without a complete World dependency.
- `model/entity_relations.*`: distinct controlling-root / owning-player queries.
- `model/world_config.*`: explicit seeds/population and shared fixed-tick RNG
  compatibility; two population draws and six draws per world tick.
- `net/worker_api.*`: offline adapter input dispatch and output coordination.
- `net/snapshot_publisher.*`: one current publisher and ReplicationSession with
  optional per-handle history, viewer retention and reentry invalidation.
- `net/snapshot_codec.*`: one SnapshotEncoder, schema-checked typed writes,
  sparse/dense framing and event encoding.
- `sim/combat.cpp`: contact tree update and the current strategy 6 solver.
- `sim/damage.cpp`, `death.cpp`, `loot.cpp`: health, death domain and loot rules.
- `sim/ai.cpp`, `targeting.cpp`, `ai_profiles.cpp`, `species_attacks.cpp`: ordered
  AI entry, eligibility/selection, steering profiles and actual attacks.
- `sim/petals.cpp`, `petal_lifecycle.cpp`, `petal_effects.cpp`: orbit,
  spawn/recharge and special effects; shared data comes from Catalog.
- `wasm/abi.cpp` + `diagnostics/commands.cpp`: offline-only ABI singleton and
  diagnostic thunks, never part of core or the native host.
- `diagnostics/entities.*`: reusable diagnostic mutations take an explicit World;
  they do not initialize or access WorkerApi.

`abi-exports.json` is the only export list: 8 core and 5 product diagnostics,
plus malloc/free and explicit toolchain support. Original replay/contact/field
probe exports, ComponentStore, skeleton writers and full-field injection state
are retired. No original adapter is linked.

World destruction invalidates ownership, AI, pickup, effect and spatial records
once; publication consumes it rather than rescanning for destroyed entities in
send/think. A peer gets no spatial entities before join, retains its last viewer
after death and receives complete initial values on reentry. Flush drains once.

CTest includes the main topic-fragment suite, existing simulation/domain suites
and `engine_structure_tests` (dual-world isolation, reset, ownership cycle/stale
handle, one destruction notice and typed codec rejection). Hand byte vectors and
`engine_native_snapshot_fixture` test real C++ input/think/publication into the
current TS decoder. `engine_benchmark` links a separate instrumented core and covers nine fixed
workloads in native/WASM; it is not an extra CTest or a production dependency.
Run `npm run perf:engine`; see [M4 measurements](../docs/m4-performance.md).

See [M3 mapping](../docs/m3-structure.md) and [release](../docs/release.md).

## Native host boundary (M01)

The root CMake project builds `florr_server -> server_runtime -> engine_core`.
`cmake -S engine -B build/engine` remains independent of Boost and the root build.
Existing Worker-dependent tests and the native snapshot fixture explicitly link
`engine_worker_adapter`; simulation-only tests and `engine_native_link_tests`
link only core. The instrumented benchmark has its own core/adapter pair.
Strict engine options are PRIVATE, and do not propagate into the host or Boost.

`initialize_world(World&, WorldConfig)` owns handle/game/death seeds and optional
population. `advance_world(World&)` performs exactly one 50ms simulation followed
by the legacy six RNG draws, even without snapshot publication. The low-level
`tick()` keeps its existing phase ordering. Native hosts initialize new Worlds
with explicit config; offline init on an existing Worker preserves its historical
independent death-shuffle stream. No connection-count RNG behavior is introduced.

The native-only test compares isolated runs against interleaved Worlds with
different seeds, including explicit domain values, snapshots, events, RNG and
collision counters. See [native host instructions](../server/README.md).
