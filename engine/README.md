# C++20 engine

## Local acceptance — 2026-10-25

Two complete stable-source runs pass, followed by an actual archive move/restore rehearsal, final move, and a third complete post-move run. Required JS, engine TAP, all five CTest targets, client/delivery/browser tests, original comparisons and production interaction checks all pass. The source/client/oracle identities are identical across the three runs.

See [local release evidence](../docs/release-acceptance.md) and [`release-acceptance.json`](../reports/release-acceptance.json) for exact run IDs, counts, residuals, hashes and archive history. Original-client integration now verifies same-RAF native gameplay, trusted movement/attack/defend, corpse→unbound→new-handle restart and multi-byte sequences. This is separate from original golden Canvas/pixel equivalence.

Remote Ubuntu CI has not run: this directory has no .git/remote or container runtime. CI wiring is fixed; no remote success is claimed. Browser scope remains Chromium desktop/retina/emulated touch; field26 remains the accepted permanent domain extension. Dated results below are historical.


Domain-organized reconstruction of the Legacy Florr server and shared rules.
The original wasm/WAT is an oracle, not a source to translate line by line.

## Layout

```
include/engine/core/      f32, Vec2, RNG, fixed-step clock, byte reader
include/engine/model/     Entity, EntityHandle, EntityPool, World, Catalog, ComponentStore
include/engine/net/       protocol queue, input decoder, snapshot writer, WorkerApi
include/engine/sim/       tick, movement, spawn, spatial, collision, combat, damage, loot, petals, progression
include/engine/schema/    generated layouts (do not edit)
include/engine/catalog/   generated catalog types/data (do not edit)
src/                      implementations
tests/unit/               native unit tests
```

## Build and test

```sh
npm run test:engine        # fresh CMake Release + engine TAP + mandatory CTest suites
npm run build:engine:wasm  # em++ -> client/public/server.wasm
```

The native build uses `-Wall -Wextra -Werror -ffp-contract=off
-fno-fast-math -fno-exceptions -fno-rtti`.

Both `test:engine` and `test:all` require
`ctest --test-dir build/engine --output-on-failure --no-tests=error`, covering
`engine_tests`, `engine_sim_tests` and `engine_peer_visibility_tests`.
`test:all` records this as the required `native suites` step, separately from
the `engine_tests --tap` capture; its TAP count is not a total of all native
suites. `tools/verification-evidence.mjs` includes `engine/tests` and
`engine/CMakeLists.txt` in source identity, so changing a native test invalidates
the previous source-bound evidence.

Browser acceptance is Chromium-only with desktop/touch coverage. Production
integration records eight scenarios across desktop, retina and mobile-UA touch
profiles (24 recordings) against the packaged delivery. This real-worker path
is separate from strict simulation, original-client protocol and pixel/Canvas
equivalence gates; a production diagnostic cannot close those gates.

## C ABI

`include/engine/abi.h` exports:

| Export | Meaning |
| --- | --- |
| `sp_server_init` | reset world, initialize 16,384 handles |
| `sp_server_send(ptr, len)` | decode one input packet |
| `sp_server_think` | run one fixed 50 ms tick |
| `sp_server_flush` | drain the output queue |
| `sp_server_entity_count` | active entity count (diagnostic) |
| `sp_server_output_count/data/size` | worker shim access to flushed packets |

`malloc`/`free`/`memory` are exported for the worker shim. The standalone
wasm module has no CRT constructor pass, so `sp_server_init` placement-news the
`WorkerApi` into a static storage buffer before calling `init(true)`.

## Implementation notes and historical evidence

These are implementation notes with their original test/fixture scope. Any
passing counts below require fresh, bound evidence before they can become a
current acceptance claim; the local acceptance summary above takes precedence.

- Core math/bytes/RNG, entity pool, world initialization, catalog view,
  protocol framing and a basic tick are implemented and tested.
- `World::initialize()` matches the original first handle
  `1048936448` and final LCG state.
- `SpawnTable` reproduces all 8 original band totals/counts/order, the weighted
  choice, the 100-trial clear-position loop and band positions in the current
  world dimensions. Ant Hole children and the 9/49-segment Centipede chain are
  spawned with owner/attached-child links.
- `WorkerApi` owns the World/clock/output queue and is shared by the C ABI and
  native tests; it exposes `spawn` (catalog defaults), `occupied`
  (`SpatialQuery::from_world`), and original/skeleton snapshot bytes.
- `ComponentStore` provides 30 dense component pools with FIFO index reuse.
- `EntitySpawnDefaults` is generated from a direct function-144 probe (19
  species: radius, health, contact damage, flags). `configure_rock`,
  `spawn_rock` and `spawn_from_band_function144` implement the dynamic
  Rock/Boulder formula plus function 144's three pre-draws.
- `population_targets` reproduces the original area scales; `replenish_population`
  fills the eight bands to 120/120/119/120/119/119/40/40 at 50000x4000. The
  C ABI enables auto-population; native tests keep it off unless requested.
- `SnapshotWriter::write_world` serializes active entities with the fixed
  skeleton record; the live `sp_server_think` path uses
  `OriginalSnapshotWriter::write_mask_domain_fields` with original
  component/mask/event framing; configured dense groups are appended by
  `write_dense_values`, and `set_full_field_framing(true)` covers all sparse
  field ids for differential tests.
- Fixed-size input commands (3/4/7/8/10/12/13) decode with the original
  sanitized-float bit test; 8/10 use the original u8 slot/value bytes, and the
  sequence gate is strict-increasing. String/name opcodes scan NUL-terminated
  strings; original pending-byte alignment and command side effects are open.
- Player defaults/profile: collision radius 25, health 100, contact damage 60,
  level thresholds, five Basic starter petals, 0.00005 rare starter, level-band
  spawn placement, opcode 6 default spawn.
- Petal combat: 39-row collision radius/damage/health table, orbit profiles
  (Basic/Fast/Heavy/Rock/Iris/Heaviest/Wing), input-driven radius, owner/slot
  links, recharge and respawn.
- Combat/death: contact separation and bilateral contact damage, petal death
  recharge, mob drop roll + scale experience, player retention/lost list and
  pickup spawn, 32/42/52/62/62 s pickup lifetime.
- Movement uses the recovered `0.992^dt` damping and
  `125 * (1 - 0.992^dt)` displacement with input acceleration; active slow
  effects scale acceleration.
- AI: `target_eligible` (arena/range/leash/root gates), `alert_nearby`,
  `find_target` player/aggressive/nearest selection through the quadtree,
  `find_pickup_recipient` (strict 70-unit cutoff), local original-426
  `alert_to_attacker`, the recovered Ladybug/Ant/Centipede/Beetle profiles,
  0,2,1,3 quadtree traversal, cached collision bounds including children, and
  deterministic idle/return movement.
- Collision layers: the recovered 30-layer threshold/side filter
  (`count_matching_layers`, `layers_collide`) is integrated into the contact
  pass.
- Effects: poison damage-over-time, healing suppression, slow, the three
  published effect flags, petal callbacks for Iris/Peas/Cactus/Dandelion/
  Honey/Web, Peas split with a deferred radial launch, Egg hatch, shared
  `EffectPayload` lifetime/refcount, and `replaceAreaEffect` /
  `updateAreaEffectTargets` square-query target maintenance.
- Attribution: per-epoch coalesced hit messages with refcount and a sorted
  known-entity gate, last-attacker and killer-name resolution, death
  score/level, 24-handle child recursion, and rarity-5 legendary duplicate
  suppression through the intrusive pickup registry.
- Loadout: 16 slot types, 8x3 intrusive handles, pending bytes, per-instance
  timers and replication epochs; `change_slot_type` and
  `create_equipped_petal` implement the recovered 125/397 domain path.
- Snapshots: `domain_snapshot_bytes` is the live `sp_server_think` path with
  fields 2/5/7/8/24/26/28/31/38/49/53/55 and complete default dense groups
  52/56/72/116/120/140/152, opcode-11 hit clocks, explicit opcode-14 petal
  transfers and opcode-9 chat. `set_full_field_framing(true)` exercises every
  sparse field id 1..63 through the recovered writers. The TypeScript client
  decodes all field types, native component-pointer dense presence, events
  9/11/14, and renders chat/hit visuals.
- Historical short server-trace checkpoint: the eight archived scenarios passed the strict
  per-entity gate (`parity:engine-state:strict`, 1e-3 + 2 f32 ULP per axis,
  finite numeric fields and exact type/kind). The Hornet AI+144 callback (74) is rebuilt as
  `spawn_hornet_stinger` and covered by `test_hornet_stinger_callback`.
  Its original-vs-C++ controlled fixture now covers 14 cases, including firing
  outside the strafe band, exact cooldown expiry, contact and corpse removal.
  At that checkpoint, 1000-tick production soaks exposed later general
  simulation divergence. The final bound eight-scenario results in
  [release evidence](../docs/release-acceptance.md) supersede those scenario
  outcomes; neither short fixtures nor finite soaks establish unbounded
  engine equivalence.
- Player appearance: field 2 publishes original packed aim (1 radian -> 40),
  field 31 publishes expression/action bits (`buttons & 3` in low bits), and
  field 26 remains permanent kind, leaving the original model byte as an
  explicit, accepted domain extension. Field 22 is not original input actions. Equipped
  petals publish actual domain slot/instance bytes 11/12 in the live path.
  See `tests/oracle/player-wire-evidence.mjs` and `docs/semantics/snapshot.md`.
- Visual lifecycle field 38 publishes the processed-death bit while a corpse
  remains authoritative; ordinary hits emit event 11 only. Event 14 is a
  real queued pickup/slot transfer, with its pickup retained 2000ms for the
  receiver; pickup eligibility and full-inventory backpack behavior still
  need complete original equivalence. The live boundary probe
  `tests/oracle/live-snapshot-evidence.mjs` verifies original-vs-engine input
  bytes, garden look148, dead Bee38 and five representatives with field7 radius10.
- Live replication now omits unchanged camera5/24 (f32 bits), angle8 (original
  truncated u16), score59 (f32 bits) and player inventory60/recharge61 arrays.
  Visual49/28 continue each tick. The redundant 63-byte default dense record
  is emitted only when camera axes and encoded angle all change, so it cannot
  undo those omissions. Explicit fixture setter groups remain overrides.
- Player60 holds all16 carried types, including reserves/cleared zeros;61 is
  minimum missing-instance readiness (65535 ready), latched before contacts.
  `tests/oracle/loadout-wire-evidence.mjs` verifies original Basic radius10,
  original angle truncation, and actual 50..2500ms recharge values. The catalog
  draw radius14 is retained separately; collision state and comparator budgets
  were not changed to make the wire/render checks pass.

### R04 production and long-run checkpoint (2026-10-25)

> Historical artifact-specific checkpoint. Counts, hashes, passing subsets and
> then-open residuals below describe that artifact only; they are not the latest
> source status or final acceptance. The seven tasks described here were
> pending at this checkpoint; this is not the current remaining-task list.

- Boot publication now follows the original viewer gate: the population keeps
  simulating, but no spatial entities are introduced until the player joins.
  `tests/oracle/boot-visibility-evidence.mjs` checks three boot ticks and join.
- Accepted input removals now enter pending deletes before `think()`. The real
  production discard/swap replay passes 68 flushes with exact petal handle sets.
- Full field14 reads effects, while field36 reads AI activity in compact/full/
  dense encodings and changes at the actual AI branch. Native suite: 106 tests.
- Idle AI f32/f64 ordering fixes eliminate the former Centipede tick260 failure.
  Original funcs215/145 ground reward scaling, the level99 cap, level max-health
  and per-level proportional health rescale. Strict attack150 ticks now passes,
  including the old6000ms progression failure. Equipped-petal health bonuses
  and discard XP paths still require full source/runtime coverage.
- Original163 quadtree compaction fixes the subsequent tick303 contact-order
  divergence: merge leaf children at total count <=4 in 0,1,2,3 order, retaining
  query order 0,2,1,3 and reusing released nodes. Fixed artifact
  `8649241c5fb4e9ab77b27bd8a7353accccdb7dc900a01deef188b39ab425e176`
  (226759 bytes) passes all14 controlled Hornet fixtures and strict garden/boot
  1000-tick runs with zero mismatches. Comparator tests: 87/87. Attack first
  differs at13800ms in a newly spawned drop; move first differs at15250ms in
  contact damage and resulting level health. Remaining scenarios are still
  running at this checkpoint; no all-eight soak pass is claimed. Reports:
  `../tests/parity/hornet/tree-report.json`,
  `../tests/parity/engine-tree-soak/`, `build-native/r04-tree-contact-order.json`.
- The production boot gate emits no entities before join. Init followed by
  three flushes before the first think emits no payload. Joined peer visibility
  is still a separate publisher task: this artifact publishes the whole world
  after join, not the original peer-visible subset.

## Historical additions — 2026-10-22

- `EntityPool::reserve_front(3)` matches the original world's three storage
  records; gameplay allocation starts at slot 3 and the player lands on the
  original handle after a one-slot spawn placeholder.
- `sp_server_state_record_size` / `sp_server_state_dump` expose 48-byte
  per-entity records (handle, type, kind, x/y/angle/radius/health/maxHealth/vx/vy/ax/ay) for
  the strict semantic trace diff.
- `WorkerApi::dump_state` is shared by the C ABI and native unit tests.
- `server-state-trace.mjs` compares handle sets and per-entity positions/health
  in addition to the old count aggregate; `--strict` makes that the gate.
- Production `client/public/server-worker.js` runs the original 50 ms think
  timer (or `?manual=1`), drains the output queue and transfers packet buffers.

