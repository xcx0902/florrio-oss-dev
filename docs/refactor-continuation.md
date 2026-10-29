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

## 02 — test system

| Item | Status | Product result |
| --- | --- | --- |
| T00 corrective execution | 已核验 | archive kept; no restore/replay; status words follow doc 10 |
| T01 dependency split and migration table | 已核验 | [`test-migration.csv`](test-migration.csv) has 353 archived test/client-test rows with dependency, original/golden flags, status, replacement and verification |
| T02 client mixed files and indirect goldens | 已核验 | 9 client unit files and 7 client integration files; worker-shim split into RPC, codec and browser suites; text cache rewritten as pure product tests |
| T03 layout and discovery | 已核验 | explicit [`tests/product-tests.json`](../tests/product-tests.json); no blacklist and no archive recursion; missing browser/fixture/test file fails |
| T04 domain coverage | 已核验 | native engine 115 cases; client 63 unit + 74 integration cases; native bytes -> TS decoder integration 2 cases; delivery/browser suites |
| T05 independent fixtures | 已核验 | hand vectors [`manual_vectors.json`](../tests/fixtures/product/protocol/manual_vectors.json), native `WorkerApi` fixture, fixture policy README |
| T06 massive engine test split | 已核验 | [`test_main.cpp`](../engine/tests/unit/test_main.cpp) is a runner; 115 named cases live in 12 topic fragments with a generated [`case map`](../engine/tests/unit/cases/README.md) |
| T07 commands and acceptance | 已核验 | `test:unit`, `test:tools`, `test:engine`, `test:client`, `test:integration`, `test:delivery`, `test:all`; runner checks the 10-name CTest inventory |

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

The pre-split `test_main.cpp` had one anonymous namespace and 115 tests. The
runner now includes topic fragments in their original order, so helper
visibility and test order are unchanged. `CHECK`, counters and the TAP runner
live in `engine/tests/support/test_support.hpp`.

The case files are `core`, `entity_pool`, `spawn_loadout`, `snapshot_codec`,
`worker_api`, `catalog`, `ai`, `snapshot_domain`, `combat_ai`,
`snapshot_dense`, `ai_families` and `core_tail`. The exact test-name-to-file map
is generated in [`cases/README.md`](../engine/tests/unit/cases/README.md); the
total remains 115. Existing centipede, projectile, rose, passives/pets, poison,
peer-visibility and pickup CTest targets were retained.

## 03 — schema and generation

| Item | Status | Product result |
| --- | --- | --- |
| S00 corrective execution | 已核验 | active layout/probe/generator remnants retired through the addendum; no old producers reconnected |
| S01 protocol vs original memory layout | 已核验 | `schema/layout/*`, old generated C++/TS and probe targets are archived; wire mapping is generated from `protocol.yaml`; product invariants live in `engine/src/core/contracts.cpp` |
| S02 no `source/semantic` dependency | 已核验 | inputs are `protocol.yaml`, `transport.json`, catalogs and `CHANGELOG.md`; modules are `tools/schema/{load,validate,protocol,catalogs,transport,menu,drop-chances,outputs,write}.mjs` behind `tools/generate.mjs` |
| S03 duplicate data merged | 已核验 | one owner per attribute; `PetalCatalogEntry` replaces `petal_defaults.hpp`; `Catalog::drop_table` replaces `drop_table.hpp`; collision/draw/label radii are distinct |
| S04 probe output as product data | 已核验 | active catalogs keep only product fields; opaque values that still have consumers are named `opaque*`; provenance records remain in the archive, not in generation |
| S05 drop and gallery flow | 已核验 | pure `tools/schema/drop-chances.mjs`; `drop-rules.json` owns constants; `gallery-overrides.json` owns only reasoned display differences; 102 drop rows reproduce the prior table |
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
`tests/fixtures/product/protocol/native_fixture.cpp` drives the real
`WorkerApi`/`domain_snapshot_bytes` path and emits two packets; the integration
test decodes them with the product TS decoder and checks player, inventory, mob,
chat event, a truncated packet and deletion. See the
[fixture policy](../tests/fixtures/product/README.md).

## Remaining/open work

This table must not be pre-filled with “pass”. It is updated only after the
corresponding command has actually run on the current tree.

| Check | State | Evidence |
| --- | --- | --- |
| schema generate/check | 已核验 | `npm run schema:check` reports `verified: 15` |
| native engine + CTest | 已核验 | 10/10 targets pass; `engine_tests` reports 115/115 |
| client unit + integration | 已核验 | 63/63 unit and 74/74 integration pass, including Chromium desktop/mobile |
| native cross-end fixture | 已核验 | 2/2 pass |
| delivery smoke | 已核验 | 22/22 pass against `dist-next` |
| full `test:all` | 已核验 | run `2026-10-29T15-10-57.301Z-e82b1ebd`: PASS, 13/13 steps, stable; 35 unit, 11 tools, 10 CTest, 137 client, 2 integration |
| clean-copy acceptance | 已核验 | R08 copy run `2026-10-29T15-17-21.723Z-a2ed4bad`: PASS; no archive/build/cache/reports |

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
