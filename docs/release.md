# Release and reference freeze

## Local acceptance — 2026-10-25

Two complete stable-source runs pass, followed by an actual archive move/restore rehearsal, final move, and a third complete post-move run. Required JS, engine TAP, all five CTest targets, client/delivery/browser tests, original comparisons and production interaction checks all pass. The source/client/oracle identities are identical across the three runs.

See [local release evidence](release-acceptance.md) and [`release-acceptance.json`](../reports/release-acceptance.json) for exact run IDs, counts, residuals, hashes and archive history. Original-client integration now verifies same-RAF native gameplay, trusted movement/attack/defend, corpse→unbound→new-handle restart and multi-byte sequences. This is separate from original golden Canvas/pixel equivalence.

Remote Ubuntu CI has not run: this directory has no .git/remote or container runtime. CI wiring is fixed; no remote success is claimed. Browser scope remains Chromium desktop/retina/emulated touch; field26 remains the accepted permanent domain extension. Dated results below are historical.


Two build trees coexist during the reconstruction:

| Tree | Purpose | Oracle content |
| --- | --- | --- |
| `dist` | Byte-reproducible rebuild of the recovered JS reference | Yes — `web/`, `dist/`, WAT, original JS |
| `dist-next` | Pure C++ engine + TypeScript/Canvas2D delivery | No — no `source/game`, reports or tests |

## Freeze rules

1. The frozen identity is `reference/manifest.json` (hashes, not git tags; this
   checkout has no `.git`).
2. Never edit `web/`, `source/wasm/`, `source/javascript/` or `source/semantic/`
   while “fixing” a test. Those artifacts are the oracle.
3. Implementation fixes belong in the C++/TS implementation and tooling.
   `source/game/**` remains the frozen executable oracle for this acceptance;
   it is not rewritten to make a comparison pass. Its content is included in
   the run's oracle identity even where it is outside the manifest key set.
4. If an oracle artifact must change, run:

   ```sh
   npm run reference:refreeze -- --reason "why the oracle changed"
   ```

   The command writes `reference/CHANGELOG.md` with the previous/current hash
   for every changed key file and tree, then regenerates the manifest.
5. Review `reference/CHANGELOG.md` and include it in the change description.
6. Run `npm run test:reference` after any refreeze. It must report
   `passed: true`; otherwise the frozen tree and working tree disagree.

## Build commands

```sh
npm run build              # dist (reference-readable mode)
npm run build:reference    # dist-reference (byte-identical reference)
npm run build:engine:wasm  # client/public/server.wasm (em++)
node tools/gen-client-petals.mjs  # schema/catalogs/petals.json -> client/src/schema/petals.ts
npm run build:client       # TypeScript -> client/public
npm run build:dist-next    # pure-Web delivery tree
npm run serve:dist-next    # http://127.0.0.1:8000 over dist-next
```

`dist-next` contains a `build-manifest.json` with every artifact hash and an
explicit `excludes` list. `tools/build-dist-next.mjs` fails if an oracle file
(`source/game`, `test/`, `reports/`) is ever copied into the delivery tree.

## Rollback

The legacy tree is preserved until the final switch. The rollback path is:

1. keep `dist` and `dist-next` side by side;
2. serve `dist` if a `dist-next` regression is found;
3. re-run `npm run test:reference` to confirm the oracle is untouched.

`tools/archive-legacy.mjs` implements the later `legacy/` move. It is
dry-run by default; `--copy` rehearses the archive without touching the
originals and writes `legacy/archive-manifest.json` with each source's file
count, byte size and tree SHA-256. `--move` must not be executed before the
switch checklist in `goal.md` §13 passes. A schema-4 move manifest permits only
the named current report publications to change and allows added report files;
all other pre-existing reports and all frozen report keys remain locked by
per-file byte size/SHA-256. Verified restore checks those files and preserves
the entire current reports tree, including new output. Other oracle trees and
old manifests without a report policy retain strict whole-tree checks. See
[archive recovery](environment.md#archive-rehearsal-and-recovery) for the exact
whitelist and transaction protections. It includes `entrypoint-smoke.json`,
`entrypoints/default.png` and `entrypoints/reference.png` under `reports/`,
so subsequent smoke runs can rewrite these outputs unless they are frozen keys;
other existing files in that directory remain pinned. The actual move/restore rehearsal and post-move full acceptance pass; see
[release evidence](release-acceptance.md).

## Switch status

The default entry-point behavior and the required dual-entrypoint smoke below
are implemented. Current delivery sizes and identities must come from the
final `dist-next/build-manifest.json` and verification report, and archive
inventory from `legacy/archive-manifest.json`; historical size totals are not
current evidence. The local switch and rollback gate is closed by the three bound runs and actual restore rehearsal; remote CI evidence remains outstanding.

`serve.mjs` now defaults to `dist-next` (R29): `node serve.mjs` serves the
reconstructed tree, and `--reference` selects the frozen `web/` oracle. Local
serving is available during reconstruction; archive `--move` still requires
the current completed passing run, ledger and delivery identity as well as the
switch checklist. The diagnostic verification procedure is:

```sh
npm run build:engine:wasm
npm run build:client
npm run build:dist-next
npm run verify:dist-next
node tools/smoke-entrypoints.mjs # actual default + --reference serve paths
npm run serve:next            # node serve.mjs (default dist-next)
```

Every `test:all` run requires `entrypoint smoke` after delivery smoke. It launches
the actual `serve.mjs` default (`dist-next`) and `--reference` (`web`) entrypoints,
uses their real Workers with trusted keyboard/mouse input, checks served
`index.html`/worker/wasm byte hashes against each selected tree, and requires
live packets, a screenshot transition and no page/worker errors. Its observer
does not inject game state or substitute worker code/responses. The JSON report
is `reports/entrypoint-smoke.json`, with screenshots under
`reports/entrypoints/`. Standalone execution is diagnostic; this smoke and the
separate production 24-profile coverage do not establish original equivalence
or replace the final two bound acceptance runs after rebuilding the final source.

Rollback is `npm run serve:reference` (`node serve.mjs --reference`, or
`--root web`); the archived tree is never deleted during the switch.
