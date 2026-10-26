# Legacy JavaScript / wasm oracle

The shipped browser build under `web/` and the decompiled machine-code functions
under `source/` are kept as the behavioural oracle. They are **not** replaced by
the C++/TypeScript rebuild.

## Local acceptance — 2026-10-25

Two complete stable-source runs pass, followed by an actual archive move/restore rehearsal, final move, and a third complete post-move run. Required JS, engine TAP, all five CTest targets, client/delivery/browser tests, original comparisons and production interaction checks all pass. The source/client/oracle identities are identical across the three runs.

See [local release evidence](release-acceptance.md) and [`release-acceptance.json`](../reports/release-acceptance.json) for exact run IDs, counts, residuals, hashes and archive history. Original-client integration now verifies same-RAF native gameplay, trusted movement/attack/defend, corpse→unbound→new-handle restart and multi-byte sequences. This is separate from original golden Canvas/pixel equivalence.

Remote Ubuntu CI has not run: this directory has no .git/remote or container runtime. CI wiring is fixed; no remote success is claimed. Browser scope remains Chromium desktop/retina/emulated touch; field26 remains the accepted permanent domain extension. Dated results below are historical.


## Inventory

- `source/decompiled/` contains the client and server machine-code views;
  historical function counts are not a current completion metric.
- `source/game/` contains the recovered game scripts.
- `source/javascript/` and `source/wasm/` contain the frozen runtime.
- `web/` is the original served client and
  `web/sp_server.wasm` remains the parity oracle used by
  `tools/parity/*`.

Read frozen file counts, byte sizes and hashes from `reference/manifest.json`
and archive inventory from `legacy/archive-manifest.json` at the time of the
operation. Archive metadata records a particular copy/move; it is not evidence
of current acceptance or permission to move the originals.

## Policy

1. Do not rewrite or delete these files while parity is red.
2. New code lives in `engine/`, `client/` and `tools/`; the legacy tree is
   read-only for the rebuild.
3. `node tools/archive-legacy.mjs` is read-only by default; `--copy` rehearses
   archive copying and records its inventory without moving the originals.
   `--move` remains blocked until its real mainline acceptance prerequisites
   pass, then leaves compatibility links to the archived trees.
4. `npm test` runs the JavaScript suite. Every `test:all` acceptance run reruns
   that suite via `test:javascript:tap`, engine TAP and the CTest
   `engine_tests`, `engine_sim_tests`, `engine_peer_visibility_tests`,
   `engine_schema_contracts` and `engine_schema_contracts_checker` suites.
   See [schema coverage](schema-coverage.md) for the layout checks and limits.
   An unchanged JS oracle is not a reason to skip any required suite.
5. Schema-4 report policy allows only named current report publications to be
   updated and permits added files. All other existing reports and all frozen
   report keys are locked per file; restore validates them and preserves new
   report output. Static oracle trees and old manifests without that policy
   retain strict whole-tree checks. The whitelist includes only the three named
   entrypoint smoke outputs, not every existing file in `reports/entrypoints/`;
   frozen keys still take priority. See the exact whitelist in
   [archive recovery](environment.md#archive-rehearsal-and-recovery).
6. The required `entrypoint smoke` runs both real `serve.mjs` modes with their
   actual Workers, trusted keyboard/mouse input, served byte hashes and a
   screenshot transition, without state injection or replacement worker code.
   It and the separate production 24-profile integration coverage do not
   establish original equivalence or final acceptance.
