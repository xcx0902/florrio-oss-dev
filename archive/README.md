# Archive

This directory preserves the original-client reverse-engineering corpus and the
historical parity/recovery records. **Nothing here is a build, test, runtime or
delivery input.** The product tree must build, test and run with this directory
moved away.

## Layout

```
archive/
  README.md                 this file
  inventory.json            per-file record of the migration
  migration-map.json        disposition, replacement and reason per group
  operations/
    01-archive.mjs          the one-time migration script (historical)
  tree/                     the archived files, at their original relative paths
    legacy/                 upstream web/upstream, recovered JS/WASM, reports
    source/                 runtime/semantic/decompiled/recovered source
    reference/              frozen identity manifests and tarball
    test/                   function-level oracle tests and helpers
    tests/parity/           parity scenarios, recordings, goldens
    engine/tests/oracle/    native oracle evidence and replay
    client/tests/           original-WASM comparison tests and helpers
    tools/                  recovery, probe, reference, parity and report tools
    docs/                   historical work records and pre-rewrite semantics
    dist*/                  local historical delivery trees
```

The archive keeps the original relative path wherever possible. Symlinks are
stored as symlinks, not dereferenced; all five remaining links resolve inside
`archive/tree/`.

The pre-rewrite READMEs and semantics documents are copied under
`tree/docs/readmes/` and `tree/docs/semantics/`. Active `docs/semantics/` was
rewritten to product rules; the copies are the evidence table for original
function numbers, WAT offsets and differential notes.

## Inventory and migration map

[`inventory.json`](inventory.json) records every archived file and every removed
compatibility link:

- `originalPath`, `archivePath`;
- `type` (`file` or `symlink`), `bytes`, `sha256`;
- `linkTarget` for symlinks;
- `tracked` — whether the file exists in a fresh clone;
- `origin` — `moved` or `copy`.

It also records the source commit, a working-tree signature and totals. The
inventory is stable because no product command writes to `archive/`.

[`migration-map.json`](migration-map.json) records the decision for each group:
`archive`, `copy`, `retain-product`, `replace` or `remove-generated`, with the
replacement location and reason. Root `web`, `upstream` and `reports` links are
recorded as removed; `reports/` is now a real product directory.

`tracked: false` entries were local generated artifacts (parity recordings,
legacy reports, `dist*`, `tools/vendor`). They are kept on disk when present but
are gitignored and are **not** part of a fresh clone. Do not treat them as
repository content.

## Reading historical evidence

The archive is plain text where possible. Useful entry points:

- `tree/docs/semantics/` — original field/function tables and differential notes;
- `tree/reports/` — historical investigation reports (local, gitignored);
- `tree/source/wasm/` — WAT dumps;
- `tree/source/game/` — recovered JavaScript;
- `tree/tests/parity/` — recordings, goldens and comparisons;
- `tree/legacy/archive-manifest.json` and `archive-operation.json` — the earlier
  archive operation, preserved verbatim.

Ordering, hashes and offsets in these files describe the archived artifacts,
not the current product. Do not copy original function numbers or addresses into
active source; cite the archived table instead.

## Reproduction and removal

`operations/01-archive.mjs` documents exactly what moved. It is idempotent for
audit purposes but is not part of `npm` scripts. To verify the boundary, copy the
product tree without `archive/` and run the acceptance flow from
[`../docs/environment.md`](../docs/environment.md).

The archive is read-only. Do not add generated output, test reports or build
artifacts here.
