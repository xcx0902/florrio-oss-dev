# Refactor continuation after the early archive

This document records the completion of goals 02 (test system) and 03 (schema
and generation) after `01-archive-and-disable` was executed at `08e6b5b`. It is
a product record, not a second archive inventory.

## Corrective rules applied

The archive is not rolled back and `archive/operations/01-archive.mjs` was not
run again. No root `web/upstream/source` links were restored. Old oracle and
parity gates remain retired. No product script, test or build reads `archive/`,
old Git commits, old goldens or the original WASM. Missing archived files are
neither “blocked” nor “done”; they are historical evidence.

New retirements went to the append-only
[`archive/addenda/02-03-completion/`](../archive/addenda/02-03-completion/README.md)
inventory. The original `archive/inventory.json` and `archive/tree/` were not
modified.

## Review gaps at checkpoint `5a6d9f3`

| Gap | Correction | Verification |
| --- | --- | --- |
| 01/02 archived fixed layouts still shipped | Moved `simulation_frame.hpp` (1152 bytes) and `hit_message.hpp` (4124 bytes) to the append-only addendum; removed `World::frame()`, the attribution wrapper and their size tests; domain clock/events remain `World::tick()`, `World::time_ms()` and `HitEvent` | no active-tree symbol or size assertion remains; native engine reports 113/113 cases and 10/10 CTest targets |
| 02 zero-test suites exited successfully | `tools/run-tests.mjs` now always requests TAP, parses it and rejects a suite with no discovered test even when the child exits 0; regression test drives an empty `describe` through the real runner | `tests/tools/test-runner.test.mjs` covers the empty-describe case; unit 39/39 and tools 12/12 pass |
| 02 native fixture bypassed input/think | Fixture now sends opcode 6 (spawn), opcode 12 (movement), opcode 5 (chat), runs real `think()` ticks, then publishes the post-spawn, input+mob+event, deletion and wire-boundary snapshots; the TS test compares moved player position with the post-spawn baseline and checks real default loadout | native cross-end fixture 3/3; player movement, inventory, mob, chat, deletion and `255` species/loadout bytes asserted |
| 03 Catalog still linear and sparse ids rejected | `Catalog` builds one-time sparse `unordered_map` indexes for petals, entities, spawn defaults, combat and drop tables; validation accepts unique sparse ids instead of forcing `0..N-1`; generator test exercises id `100` | `npm run schema:check` verifies 15 outputs; sparse-id and 255/256 boundary tests, native boundary packet and engine suite pass |
| 03 publishable ids exceeded the one-byte wire | `tools/schema/wire-ids.mjs` defines `PUBLISHABLE_TYPE_ID_MAX = 255`; every petal/entity/combat/spawn/default/alias/reference id is capped and ids `256` / `300` are rejected while `255` remains sparse-valid; native fixture carries a real `SnapshotWriter` `255` species and loadout byte | schema boundary tests pass; native cross-end boundary test decodes `255` as `255`; full and clean-copy acceptance pass on this tree |
| 03 alias chains used one-hop copy order | `tools/schema/drop-chances.mjs` resolves the full alias chain with a memo, rejects cycles, and copies from the canonical root; test uses `16 → 18 → 17` | alias-chain test passes; schema check keeps 102 drop rows byte-identical |

## 02 — test system

| Item | Status | Product result |
| --- | --- | --- |
| T00 corrective execution | 已核验 | archive kept; no restore/replay; status words follow doc 10 |
| T01 dependency split and migration table | 已核验 | [`test-migration.csv`](test-migration.csv) has 353 archived test/client-test rows with dependency, original/golden flags, status, replacement and verification |
| T02 client mixed files and indirect goldens | 已核验 | 9 client unit files and 7 client integration files; worker-shim split into RPC, codec and browser suites; text cache rewritten as pure product tests |
| T03 layout and discovery | 已核验 | explicit [`tests/product-tests.json`](../tests/product-tests.json); no blacklist and no archive recursion; missing browser/fixture/test file fails; a zero-test TAP result is rejected even when the child exits 0 |
| T04 domain coverage | 已核验 | native engine 113 cases; client 63 unit + 74 integration cases; native bytes -> TS decoder integration 3 cases; delivery/browser suites |
| T05 independent fixtures | 已核验 | hand vectors [`manual_vectors.json`](../tests/fixtures/product/protocol/manual_vectors.json), native `WorkerApi` fixture, fixture policy README |
| T06 massive engine test split | 已核验 | [`test_main.cpp`](../engine/tests/unit/test_main.cpp) is a runner; 113 named cases live in 12 topic fragments with a generated [`case map`](../engine/tests/unit/cases/README.md) |
| T07 commands and acceptance | 已核验 | `test:unit`, `test:tools`, `test:engine`, `test:client`, `test:integration`, `test:delivery`, `test:all`; runner checks the 10-name CTest inventory and nonempty TAP results |

### Test commands

```sh
npm run test:unit           # product schema/protocol unit tests
npm run test:tools          # delivery, verification and manifest-runner tests
npm run test:engine         # native build + exactly 10 CTest targets
npm run test:client         # client unit (9 files) + integration (7 files)
npm run test:integration    # native WorkerApi fixture -> TypeScript decoder
npm run test:delivery       # packaged dist-next worker/menu smoke
npm run test:all            # complete product acceptance
```

`test:client` is the combined client command; the two suites are also listed
separately in the manifest. `test:integration` does not reuse the client
integration suite.

### Client migration decisions

| Old area | Current placement | Decision |
| --- | --- | --- |
| `text-cache.test.mjs` old `func444`/WASM comparison | `client/tests/unit/text-cache.test.mjs` | product cache behavior retained; original calls retired |
| `menu-controls.test.mjs` original changelog/wheel curves | `client/tests/integration/menu-controls.test.mjs` | IME, nickname, focus, wheel, panel and tooltip interactions retained |
| `worker-shim.test.mjs` | `worker-rpc.test.mjs`, `snapshot-codec.test.mjs`, `worker-browser.test.mjs` + `client/tests/support/worker-fixture.mjs` | real worker path, dense/delta/events/deletion retained; injection-only history retired |
| `loadout`, `death-lifecycle`, `death-pickup-regression`, `menu-animation`, `movement-helper`, `petal-transfers`, `snapshot-domain` | `client/tests/unit/` or `client/tests/integration/` | product regressions retained; imports rewritten to active `client/src` and `client/public` |
| golden/parity camera, HUD, menu, render, art and UI detail tests | archive only | historical gray-box comparisons; no replacement pixel baseline was invented |

Every archived test or client-test row, including the 331 root tests and 22
client golden tests, is classified in [`test-migration.csv`](test-migration.csv).
Rows marked `历史退役` are not counted as passing product tests.

### Oracle, parity and golden disposition

| Archived group | Current status |
| --- | --- |
| `engine/tests/oracle/*` (native replay, publisher evidence, state soaks) | 历史退役; no build target or test caller |
| `test/helpers/{oracle-harness,wasm-probe,readable-probe,server-world}.mjs` | 历史退役; no product import |
| `tests/parity/**` (recordings, reports, `next` and `next-ui-v2` trees) | 历史退役; no parity runner reads them |
| `client/tests/{fixtures,helpers}` and all camera/HUD/menu/render/art golden screenshots | 历史退役; product helpers were rewritten without original refs or function numbers |
| `engine/tests/unit/test_original_client_adapter.hpp` and its registration | 历史退役; current publisher tests use `WorkerApi` directly |
| `engine/tests/unit/test_schema_contracts*` and probe CMake targets | 历史退役; product schema checks replace them |
| `test/client-*.test.mjs` original-WASM comparison tests | 历史退役; see the 22 client rows in the migration CSV |
| all 331 root `test/*.test.mjs` | classified individually in the migration CSV; 315 historical, 38 migrated/verified against current product code |

No product command opens `archive/`, an old golden or the original WASM.

### Engine split mapping

The pre-split `test_main.cpp` had one anonymous namespace and 115 tests; the two
archived fixed-layout wrapper tests were retired, leaving 113. The runner now
includes topic fragments in their original order, so helper visibility and test
order are unchanged. `CHECK`, counters and the TAP runner
live in `engine/tests/support/test_support.hpp`.

The case files are `core`, `entity_pool`, `spawn_loadout`, `snapshot_codec`,
`worker_api`, `catalog`, `ai`, `snapshot_domain`, `combat_ai`,
`snapshot_dense`, `ai_families` and `core_tail`. The exact test-name-to-file map
is generated in [`cases/README.md`](../engine/tests/unit/cases/README.md); the
total is 113. Existing centipede, projectile, rose, passives/pets, poison,
peer-visibility and pickup CTest targets were retained.

## 03 — schema and generation

| Item | Status | Product result |
| --- | --- | --- |
| S00 corrective execution | 已核验 | active layout/probe/generator remnants retired through the addendum; no old producers reconnected |
| S01 protocol vs original memory layout | 已核验 | `schema/layout/*`, old generated C++/TS and probe targets are archived; wire mapping is generated from `protocol.yaml`; product invariants live in `engine/src/core/contracts.cpp` |
| S02 no `source/semantic` dependency | 已核验 | inputs are `protocol.yaml`, `transport.json`, catalogs and `CHANGELOG.md`; modules are `tools/schema/{load,validate,protocol,catalogs,transport,menu,drop-chances,outputs,write}.mjs` behind `tools/generate.mjs` |
| S03 duplicate data merged | 已核验 | one owner per attribute; sparse publishable ids (`0..255`) use one-time Catalog indexes; `PetalCatalogEntry` replaces `petal_defaults.hpp`; `Catalog::drop_table` replaces `drop_table.hpp`; collision/draw/label radii are distinct |
| S04 probe output as product data | 已核验 | active catalogs keep only product fields; opaque values that still have consumers are named `opaque*`; provenance records remain in the archive, not in generation |
| S05 drop and gallery flow | 已核验 | pure `tools/schema/drop-chances.mjs`; `drop-rules.json` owns constants; alias chains resolve to their canonical root independent of input order; `gallery-overrides.json` owns only reasoned display differences; 102 drop rows reproduce the prior table |
| S06 menu content | 已核验 | `CHANGELOG.md` is the only source; `tools/schema/menu.mjs` parses and generates `menu-content.ts`; no second JSON content file |
| S07 generate/check contract | 已核验 | 15 outputs, input validation before writes, byte-idempotent regeneration, read-only check, stale/missing/orphan detection |

### Generated outputs

`npm run schema:generate` validates every input in memory and writes 15 outputs:

- protocol JSON, C++ and TS views;
- packet key C++ and TS;
- catalog types/data, spawn defaults, petal combat and drop chance headers;
- derived `drop-chances.json`;
- client petals, mob gallery and menu content;
- `docs/catalogs.md`.

`schema/generated-outputs.json` records path, byte size and SHA-256. `--check`
never writes. It rejects missing, stale, obsolete and unregistered generator
outputs. A failed validation leaves every previous output byte-identical.

### Shared protocol fixture

`tests/fixtures/product/protocol/manual_vectors.json` is hand-authored: an empty
snapshot header and a bare activation vector encode sequence, handle flags,
widths and byte order without asking the generator for the expected answer.
`tests/fixtures/product/protocol/native_fixture.cpp` drives opcode 6 spawn,
opcode 12 input, `think()` and `domain_snapshot_bytes()`; it emits a post-spawn
baseline, an input+mob+chat publication and a deletion snapshot. The integration
test decodes the first three with the product TS decoder and checks player movement,
default inventory, mob, chat event, a truncated packet and deletion; the fourth
packet is the direct `SnapshotWriter` `255` boundary probe. See the
[fixture policy](../tests/fixtures/product/README.md).

## Remaining/open work

This table must not be pre-filled with “pass”. It is updated only after the
corresponding command has actually run on the current tree.

| Check | State | Evidence |
| --- | --- | --- |
| schema generate/check | 已核验 | `npm run schema:check` reports `verified: 15` |
| native engine + CTest | 已核验 | 10/10 targets pass; `engine_tests` reports 113/113 |
| client unit + integration | 已核验 | 63/63 unit and 74/74 integration pass, including Chromium desktop/mobile |
| native cross-end fixture | 已核验 | 3/3 pass (including the `255` boundary packet) |
| delivery smoke | 已核验 | 22/22 pass against `dist-next` |
| full `test:all` | 已核验 | run `2026-10-30T14-10-32.476Z-effaa4d6`: PASS, 13/13 steps, stable=true; 39 unit, 12 tools, 10 CTest (113 engine cases), 137 client, 3 integration, 22 delivery |
| clean-copy acceptance | 已核验 | R08 copy run `2026-10-30T14-23-42.191Z-78662bb1`: PASS, 13/13 steps, stable=true; source identity `a28b21dd…` matches the source-tree run; `archive/`, `build/`, `dist*`, `reports/`, `node_modules/` and `.emcache/` were excluded |

## Clean-copy acceptance

```sh
rsync -a --exclude .git --exclude archive --exclude node_modules \
  --exclude build --exclude 'dist*' --exclude reports --exclude .emcache \
  ./ /tmp/florrio-product/
cd /tmp/florrio-product
npm ci
npm run test:all
```

A product command that requires any excluded path is an unfinished migration.
`.emcache/` is an emscripten build cache and is excluded as generated state,
not as a source input. The result of the current run is recorded in
`reports/current-verification.json`; that report is the authority for this tree,
not historical pass counts.

## M3 — structure convergence (2026-10-31, Asia/Shanghai)

This is a new implementation record for goals 04, 05 and 06. The 02/03 counts
and run IDs above remain historical results; they are not rewritten to describe
the M3 tree. Work began at clean HEAD `7200f631eef7bda996c0a6648812b1f14227ad9c`.

- Engine: one `SnapshotPublisher` / `ReplicationSession` and schema-checked
  `SnapshotEncoder`; separate EntityPool, World lifecycle, per-World collision,
  health/death and AI responsibilities; core ABI plus actual product diagnostics.
- Client: GameApp owns frame scheduling/input dispatch; GameSession owns phase
  changes and exposes a readonly frame view; one atomic decoder, typed projection,
  indexed WorldState, shared layout, scoped renderer resources and complete dispose.
- Build/release: one CMake source list, separate static/compiled/delivery trees,
  common HTTP/browser/process helpers, 15 ordered gates and schema-5 evidence,
  plus local verified tar/manifest/checksum preparation.

| Environment | Initial M3 run (historical; superseded below) | Result |
| --- | --- | --- |
| source tree | `2026-10-30T15-58-17.497Z-c7651172` | PASS, 15/15, stable=true; release prepared |
| clean copy without archive or Git | `2026-10-30T16-00-56.159Z-29a79711` | PASS, 15/15, stable=true; release prepared |

Both runs execute 11 native CTest targets (112 cases in the topic runner), 39
product unit tests, 16 tool tests, 90 client unit tests, 76 browser integration
tests, 3 native-to-TS tests, ABI/delivery checks, real entrypoint smoke and the
three separate performance workloads. No required test is skipped. The clean
copy uses fresh build/output/report/cache directories and lockfile dependencies
installed with `npm ci --offline --no-audit` from the existing npm cache.

The matching product source SHA-256 is
`21212a12209ef649fafc8165e330b4bbae66b0626af01c80c53e7d5170fe3e37`;
verification inputs are
`906e72c72d5f9c84dd226a934c796b3187682ba31af24505f5ef873b228465f4`.
Wasm and the ordered delivery file identity also match in both environments.

The new source-tree package is under
`release/florrio-2.0.0-21212a12209e-2026-10-30T15-58-17.497Z-c7651172/`.
Its tar.gz SHA-256 is
`6abb3a80450c9744f512662e0d49c603d4519e0a0d7e8564e8b62c3d17436493`.
Both environments pass checksum validation. The source-tree archive was also
unpacked, all 81 product files checked, and the unpacked page exercised through
HTTP, a real Worker and trusted Enter input; no page/Worker errors, no installed
test API, and `/dev/test-api.js` returns 404.

Full mapping, exact identities, evidence paths and scope are in
[M3 structure](m3-structure.md). Ten retired source copies are preserved in the
append-only `archive/addenda/m3-structure/` inventory. Original archive/tree and
inventory remain unchanged; no historical archive script was rerun. Performance
results are baselines, not an M4 improvement claim. No Git commit or remote
publication was performed by this task.


## M3 audit follow-up — decoder boundary and delivery binding (2026-10-31, Asia/Shanghai)

The initial M3 runs above are historical. A later audit found that sparse field
64 was rewritten to field 1 and committed a new component mask, and that an
independent build had replaced the source-tree delivery with `runId: null`.
Neither the old package nor the old clean-copy pass substitutes for current
source-tree delivery evidence.

The decoder now rejects accumulated field ids outside 1–63. Three new unit
regressions failed before the fix and pass after it: legal boundary fields,
direct/accumulated overflow including the exact audit vector, and transaction
rollback across deletes, masks, earlier records and ordinal component presence.
The browser test that expected clamping now requires rejection and unchanged
dense decoding. The engine implementation and Wasm hash are unchanged.

The pinned Chromium `156.0.8078.47` was selected with `CHROME_PATH`, retaining
`.chromium-version`; the auto-updated system browser was not used for acceptance.
A new clean copy at `/tmp/florrio-m3-audit-clean-47ia00oq` excludes archive, Git,
node_modules, build/dist/reports/release and emcache, installs lockfile dependencies
with `npm ci --offline --no-audit`, and rebuilds every output.

| Environment | Audit follow-up run | Result |
| --- | --- | --- |
| source tree | `2026-10-31T00-48-36.371Z-b9ac5b38` | PASS, 15/15, stable=true; release prepared |
| new clean copy | `2026-10-31T00-51-22.376Z-7cabf9df` | PASS, 15/15, stable=true; release prepared |

Each run passes schema 15 outputs, 11 CTest targets (112 topic cases), unit 39,
tools 16, client unit 93, browser integration 76 and cross-end integration 3,
plus ABI, delivery, real Worker/input smoke and all three performance workloads.
There are no required test failures or skips. Product source, verification inputs,
Wasm and the ordered product artifact identity match across both environments:

- Source: `e1dcb9c9469cab60760bb3979dffbecb78947ee6436277f22dfaed57f2cf7021`.
- Verification: `1e969b35cc084a6a3d09e73ff954f2da399bf4b9e70a6e1065f90b56d3c94fc0`.
- Wasm: `1c5a96253c8c4670162cd4577742f21007ade419c5be89fd7b013de63b12876e`.
- Artifacts: `190f18560a38085ef2d273302fd4c8b6a774398cbfb8a5c76b86d75f17a52baf`.

The current source-tree build manifest is bound to the new source-tree run.
`releaseEvidence()` independently verifies both current deliveries and their
immutable ledgers, logs and reports. Both new packages pass SHA256SUMS and
unpacked path/size/hash validation (81 product files, 668885 bytes). The main
package is under
`release/florrio-2.0.0-e1dcb9c9469c-2026-10-31T00-48-36.371Z-b9ac5b38/`, with tar SHA-256
`c754d79a06a18981c81f5555eb4e55fd7808b83b6b3b3ac6c35b579560f226ab`.
Its unpacked page also passes real HTTP/Worker/trusted Enter smoke: 3 input sends,
31 packets, 2 large packets, no page/Worker errors, no installed test API and
`/dev/test-api.js` returns 404. Extra smoke output is
`/tmp/florr-m3-audit-release-smoke.json` and does not overwrite verified reports.

[Release instructions](release.md) now explain that an independent rebuild
invalidates prior run binding even if product hashes match; rerun `test:all`
before `release:prepare`, without editing evidence manually. See
[M3 structure](m3-structure.md) for the current evidence. No Git commit, external
publication, M4 optimization or archived runtime execution was performed.
