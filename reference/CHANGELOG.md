# Reference change log

## 2026-10-22 — no refreeze

The R21 fixes changed `source/game/client/span-blend-additive.mjs` and
`source/game/server/wide-string-constructor.mjs`. Those files are recovered
implementation JS, not frozen oracle artifacts, so the reference key-file set
and trees are unchanged. `npm run test:reference` still reports `issues: []`.

Frozen oracle artifacts (`web/`, `dist*`, `source/wasm`, `source/javascript`,
`source/semantic`, `reports/`) were not modified. No `reference:refreeze` run
was required.

Future intentional oracle changes must use:

```sh
npm run reference:refreeze -- --reason "describe the oracle change"
```

The command appends a table of previous/current hashes here and regenerates
`reference/manifest.json`.
