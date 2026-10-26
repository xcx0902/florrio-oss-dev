# Environment and browser matrix

## Local acceptance — 2026-10-25

Two complete stable-source runs pass, followed by an actual archive move/restore rehearsal, final move, and a third complete post-move run. Required JS, engine TAP, all five CTest targets, client/delivery/browser tests, original comparisons and production interaction checks all pass. The source/client/oracle identities are identical across the three runs.

See [local release evidence](release-acceptance.md) and [`release-acceptance.json`](../reports/release-acceptance.json) for exact run IDs, counts, residuals, hashes and archive history. Original-client integration now verifies same-RAF native gameplay, trusted movement/attack/defend, corpse→unbound→new-handle restart and multi-byte sequences. This is separate from original golden Canvas/pixel equivalence.

Remote Ubuntu CI has not run: this directory has no .git/remote or container runtime. CI wiring is fixed; no remote success is claimed. Browser scope remains Chromium desktop/retina/emulated touch; field26 remains the accepted permanent domain extension. Dated results below are historical.


## Verified environment (2026-10-23)

> Historical local environment, not a fresh version check or current acceptance
> report. The toolchain pins and run-identity requirements below define the
> current procedure; main will bind final runtime versions to the stable run.

| Component | Version |
| --- | --- |
| Node.js | 24.13.0 |
| npm | 11.6.2 |
| Chrome | 156 (Playwright `executablePath`), UA pinned to `HeadlessChrome/155.0.0.0` |
| Emscripten (`emcc`) | 6.0.10, pinned by `.emscripten-version`; local Homebrew reports `6.0.10-git` |
| OS | macOS (darwin arm64) |

The parity harness pins viewport 1280×720, DPR 1, `locale=en-US`,
`timezone=UTC`, a virtual clock, and `navigator.userAgent` via
`tools/parity/pinned-ua.js`:

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36
```

The original client writes the UA verbatim into its first handshake packet;
without the pin, a browser-version change can alter the golden server trace.
The pin is a frozen oracle input; do not change it or re-record goldens to hide
a mismatch. The production touch profile uses its own Android/Mobile UA.
Screenshot hashes are only comparable within this matrix.

## Minimum / supported

- Node.js 24+ (ES modules, `node:test`, `fs.globSync`, `WebAssembly`); CI and the local validation use Node 24.
- Chromium desktop and emulated touch for the Canvas2D and worker paths;
  CI uses the `.chromium-version` Chrome for Testing pin, while local executable selection is
  described below. A native build also needs C++20 and CMake supporting `--fresh`.
- Firefox / WebKit / physical devices are **non-goals** (R23's
  Chromium-only scope includes desktop plus a 390x844/DPR3 touch viewport). The
  automated matrix, the goldens and the CI acceptance job all install and
  run Chromium only; adding another engine requires updating this section,
  `docs/browser-matrix.md` and CI in the same change.
- A Chrome 390×844/DPR3 touch viewport runs in the automated worker suite. Physical mobile browsers remain outside this matrix.

## Reproduce

```sh
npm ci
# Install Emscripten 6.0.10 (CI reads .emscripten-version via setup-emsdk).
# Install Chrome for Testing at the version in .chromium-version.
# Set CHROME_PATH to that executable (CI setup-chrome does both).
node tools/check-browser-version.mjs
node tools/prepare-reference.mjs
node --test test/tools-*.test.mjs test/verification-gates.test.mjs
npm run test:all:twice                # rebuild/package and validate each run
npm run verify:dist-next
node tools/write-current-verification.mjs --strict
```

Run this full sequence only after source edits stop. Individual diagnostic
commands do not create a completed acceptance run, and `status:write` cannot
turn standalone or mixed reports into accepted evidence.

All browser runners share `tools/lib/chromium.mjs`. `CHROME_PATH` explicitly
selects an executable and fails if missing. On macOS an installed system Chrome
is used; otherwise Playwright can launch its bundled Chromium for diagnostics.
Acceptance requires the exact `.chromium-version` pin (156.0.8078.47), matching
all eight frozen scene metadata files. The required `browser version` step
launches the selected executable and rejects any other version. Linux CI uses
`browser-actions/setup-chrome@v2` with that pin and exports its `chrome-path` as
`CHROME_PATH` for every runner. Playwright 1.49.1's bundled Chromium 131 is not
the acceptance browser. The CI definition still needs an actual remote run;
the local browser check does not establish Linux pixel parity.

`.emcache/` stores compiler caches; it does not install or pin a compiler.
`build:engine:wasm` rejects a version different from `.emscripten-version` and
records the compiler identity, C++ input hash and wasm hash next to the wasm.
`build:dist-next` compiles both languages by default. The acceptance runner uses
`--skip-build` after its own compilation steps and before the gates; packaging
still requires its read-only compiler-output checks to pass. Skipping compilation
does not imply acceptance. Delivery
verification rejects stale source identities, compiled-output differences and
missing or additional files.

The ignored historical `dist`, `dist-readable` and `dist-reference` trees are
transported in `reference/frozen-trees.tar.gz`. `prepare-reference` validates
its digest, member paths/types and every extracted file against the unchanged
`reference/manifest.json`, then restores only missing trees. This transports
the original frozen assets; it does not refreeze or regenerate a golden.

CI uses a single Ubuntu 24.04 acceptance job to keep the checkout, toolchain,
wasm and delivery tree together. It installs dependencies, Emscripten and
Chromium, runs tooling regressions, then two full acceptance runs. Each run
includes both real serve entrypoints, desktop/touch interaction,
eight-by-three production integration and performance on its own `dist-next`;
CI then rechecks delivery and the strict
ledger. Workflow configuration is not evidence of a
successful remote Linux run; inspect the uploaded evidence for that result.

## Run identity and delivery acceptance (2026-10-25)

`tools/run-verification.mjs` owns `reports/verification.lock`, builds C++/wasm/TS
once, packages `dist-next`, and validates that immutable version. Each run has
a unique ID and records source, compiled client/wasm, frozen oracle and golden
input hashes. Source or delivery changes during the run make it fail.

Native coverage is mandatory in both `test:engine` and `test:all`:
`ctest --test-dir build/engine --output-on-failure --no-tests=error` runs
`engine_tests`, `engine_sim_tests`, `engine_peer_visibility_tests`,
`engine_schema_contracts` and `engine_schema_contracts_checker`.
The schema targets compile and verify the coverage described in
[schema-coverage.md](schema-coverage.md).
The acceptance runner and ledger require the serial `native suites` step;
`engine_tests --tap` is a separate capture, not an aggregate count for all
CTest suites. Source identity includes `engine/tests` and
`engine/CMakeLists.txt`, so native-test edits invalidate old bound evidence.
Every `test:all` run also reruns the JavaScript suite through
`test:javascript:tap`; an unchanged oracle does not exempt JavaScript or native
suites from either complete acceptance run.

`reports/runs/<id>/run.json` records every command and exit status. TAP captures
are created exclusively as `<name>.tap` / `<name>.meta.json`; JSON producer
reports are copied to `artifacts/<gate>.json` with their SHA-256 in the run
record. Published TAP and ledger files are atomic views of this evidence.
The ledger reads the run snapshots and rejects missing hashes, mixed runs,
duplicate/partial scenarios, corrupt JSON, incomplete TAP and nonzero child
exits. Each TAP and JSON snapshot must also fall within its recorded step's
start/end times, and all required steps must run once in the prescribed serial
order. Outside the authenticated acceptance writer, the run and its final
ledger step must already have completed successfully. A standalone report with
no matching recorded run remains diagnostic. Verification and delivery writers
reject foreign or malformed ownership locks. POSIX interruption also signals
the child process group, and final failure invalidates the published ledger.

Delivery hashes include hidden assets. Nested symlinks and special files cannot
silently disappear from evidence; only explicitly selected oracle roots may
use compatibility links into this checkout. Packaging serializes writers,
requires the entry point, worker and wasm files, verifies the complete copied
inventory, and retains the previous delivery on validation failure.

After packaging, acceptance includes:

- delivery integrity plus worker/desktop/touch tests against `dist-next`;
- the required `entrypoint smoke` step,
  `node tools/smoke-entrypoints.mjs`, exercising both real `serve.mjs` modes;
- `node tools/parity/run-production-scenario.mjs --all --root dist-next`:
  eight scenarios at desktop, retina and touch profiles (24 recordings),
  bound to the actual delivery tree, manifest and wasm hashes, with every
  required protocol/render/input check present and true; touch movement must
  be observed rather than inferred from the profile name;
- `node tools/perf-client.mjs --root dist-next --frames 600`: a renderer budget
  with 872 distinct synthetic entities, an explicitly moving camera, warmup,
  observed draw frames and runtime errors, bound to the same delivery hashes.
  The ledger recomputes FPS/p95/max from all 600 measured intervals.

The entrypoint smoke launches `serve.mjs` with its default `dist-next` root and
again with `--reference` selecting `web`. Each entry runs its actual Worker and
receives trusted Chromium Enter and mouse movement input. The smoke checks
HTTP success and served SHA-256 against the selected tree for `index.html`,
the worker script and server wasm; it also requires live worker packets,
input traffic, an observed screenshot transition and no page/worker errors.
Instrumentation observes the native Worker without injecting game state or
substituting worker code or responses. It checks source/delivery stability and
writes `reports/entrypoint-smoke.json` plus
`reports/entrypoints/default.png` and `reports/entrypoints/reference.png`.
The runner and ledger require the step in serial order and a successful exit;
a standalone smoke result is not acceptance evidence. A changed screenshot
proves a transition for this smoke, not pixel equivalence with the oracle.

The production runner invalidates previous success before reading its inputs
or launching a browser. Startup and browser failures publish a terminal
nonpassing report and release their writer lock and local HTTP server.
Each completed case publishes progress, and failed cases retain their observed
worker requests/responses and decoded world when collection remains possible.
The touch profile uses an Android/Mobile UA plus mobile emulation, not just
`hasTouch`. Its recorded UA must satisfy the client's exact `mobileUi`
predicate, expose touch points and retain the 390-pixel CSS viewport. Touch
movement uses trusted Chromium touch input in an upward direction and requires
the decoded player to move upward, independently of the preceding mouse input.
Equip interactions read the delivered HUD layout instead of fixed desktop
coordinates. Player observations prefer explicit entity kind over type IDs.
An untouched boot-menu recording must remain unstarted, have no player and never
enter the dead state at any checkpoint or frame sample; it must not send a spawn
command. Mob snapshots by themselves do not prove the player entered the world.
Damage checks require an observed health decrease for the same decoded player,
with known health/max-health fields, plus decoded event 11 stamping that player's
`hitTime(handle)` at receipt and a positive `hitFlash(handle, now)`. Event 14 is an indexed petal
presentation transfer and cannot satisfy the damage-hit check.
If the unchanged damage scenario has not produced both observations by
`scenario-final`, the runner records an additional `damage-contact-navigation`
action and its deviations: trusted mouse/touch steering toward a decoded live
mob while defending, bounded to 720 frames. This extends production coverage
without changing the original scenario/golden or injecting game state, and
exhausting the budget does not relax either damage check.

For concurrent development diagnostics, build in a temporary source snapshot
and record into a separate temporary directory with `--diagnostic`. This sets
`reportOnly: true`, which cannot close the acceptance gate even if all 24 cases
pass. `stable` describes the recorded input/delivery bytes, not final mainline
acceptance. That snapshot may be copied
while sources are changing, so its build and browser results describe only
those copied bytes; they make no final checkout provenance or acceptance claim.
Original-client + engine reports require `probe.found === true` and all protocol
checks for every scene. Runs using `POKE_CONNECTED=1` mutate client memory and
are explicitly diagnostic; they cannot close the protocol gate.

Production integration, renderer performance, client self-consistency and
original-client equivalence are separate evidence kinds. All eight pixel
scenarios must still satisfy ratio <=0.001 and max <=8; strict command comparisons
cover all three recorded frames in all eight scenarios, including boot-menu,
at tolerance <=1e-4. Missing/empty frames and unresolved resources fail. Neither integration nor
performance can close an original-client visual or command gap.

For a local engineering check without refreshing the published acceptance
ledger or performance report:

```sh
node --test test/tools-*.test.mjs test/verification-gates.test.mjs
node tools/build-dist-next.mjs
node tools/verify-dist-next.mjs
CLIENT_ROOT=dist-next node tools/run-tap.mjs local-delivery /tmp/florr-delivery.tap -- node --test --test-reporter=tap client/tests/worker-shim.test.mjs
node tools/perf-client.mjs --root dist-next --frames 600 --out /tmp/florr-perf.json
```

Local browser and HTTP checks require permission to listen on 127.0.0.1 in
restricted environments. A denied socket or browser launch is a failure,
never a skip. The full two-run acceptance remains a separate mainline step
after all source edits have stopped.

The tooling suite uses disposable roots for acceptance failures, immutable
snapshot assembly, delivery corruption and archive transactions. Its positive
ledger fixture tests the evidence protocol with synthetic reports; it is not
game acceptance evidence. CI runs this suite explicitly before the two real
acceptance runs and checks the finalized ledger again before uploading delivery.

## Archive rehearsal and recovery

The default archive invocation is read-only. `--copy` verifies and refreshes
existing copies. `--move` first requires a complete passing current mainline
run, ledger and delivery identity. It verifies any existing copy, retains the
original in a transaction backup, creates compatibility links, verifies the
result and only then publishes the completed manifest. `--restore` checks
saved identities before restoring; an unchanged copy can also be undone.

New move manifests use schema 4. Non-report oracle trees retain exact tree
identity checks. For `reports`, the saved `reportPolicy` pins every existing
file by path, byte size and SHA-256 except these current publications:
`current-verification.json`, `latest-run.json`, `perf.json`,
`entrypoint-smoke.json`, `entrypoints/default.png`, `entrypoints/reference.png`,
and the JavaScript, engine, client, delivery and browser TAP files plus their
`.meta.json` files listed in `tools/verification/gates.mjs`. Other pre-existing reports, including
historical reports and run evidence, cannot be changed or deleted. Frozen
`reports/` key files from `reference/manifest.json` always remain pinned, even
if a key names an otherwise mutable publication. New files may be added.
Restore validates that policy and the frozen keys, then checks the complete
current reports tree before and after its transactional rename, preserving
updated publications and added files. Manifests without this per-file policy
retain strict whole-tree matching; they receive no retroactive exemptions.

This is a finite whitelist, not blanket permission to overwrite reports or
everything under `entrypoints/`. The three named smoke outputs may be rewritten
after move unless frozen; other existing files in that directory remain pinned.
The actual move/restore rehearsal and local post-move acceptance pass; see
[release evidence](release-acceptance.md). Current byte sizes and file counts
must be read from `reference/manifest.json` and `legacy/archive-manifest.json`,
not copied from historical size totals.

An exception rolls back completed asset operations and the previous metadata.
If rollback itself fails, `legacy/archive-operation.json` records
`recovery-required` and retains the transaction directory; inspect those
backups before another operation. Unfinished or corrupt journals block further
mutations so recovery data cannot be overwritten. `test/tools-engineering.test.mjs` exercises
copy -> move -> restore and injected mid-operation failures only in disposable
temporary directories. The fixture API explicitly bypasses acceptance for
those fixtures; it is not permission to move project assets before R19 and the
remaining mainline gates pass.
