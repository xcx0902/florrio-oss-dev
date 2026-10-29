# Changelog

All notable changes to this reconstruction are documented here. The in-game
Changelog panel is generated from this file by
`node tools/gen-menu-content.mjs`; edit the Markdown, not
`client/src/schema/menu-content.ts`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dates use `YYYY-MM-DD`.

## [Unreleased]

### Added

- C++20 server engine compiled to WebAssembly, with a deterministic fixed-step
  simulation and a native test suite.
- TypeScript Canvas2D client with the worker envelope, sparse snapshot decoding,
  interpolation, rendering, menu, HUD, inventory and chat.
- Schema-driven protocol, layout and catalog generation under `schema/`.
- A repeatable product acceptance flow that builds, packages and verifies the
  independent `dist-next/` delivery tree.

### Changed

- The product build, tests, runtime and delivery no longer read the
  original-client oracle or recovered source. Historical evidence is preserved
  under `archive/` for manual consultation only.
- The menu Changelog panel now describes this project instead of the upstream
  2020 client.

### Removed

- Original-client snapshot writers, the skeleton snapshot fallback and the
  `original_client_*` worker ABI.
- Reference, recovery, parity and frozen-oracle tooling from the active tree.
