# Changelog

All notable changes to this reconstruction are documented here. The in-game
Changelog panel is generated from this file by
`node tools/generate.mjs` (or `npm run schema:generate`); edit the Markdown, not
`client/src/schema/menu-content.ts`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dates use `YYYY-MM-DD`.

## [2.0.0] - 2026-11-02

### Added

- Native authoritative multiplayer server with a real binary WebSocket v2 transport,
  room admission, reconnect tokens, bounded queues, heartbeats, graceful drain and
  fixed-label internal metrics.
- Online-capable client transport, input pump, authoritative lifecycle, snapshot
  decoding/resync, network clock, interpolation and bounded local motion prediction.
- Online-only `dist-multiplayer` delivery and `tools/dev-multiplayer.mjs` local
  launcher; it contains no `server.wasm`, Worker, test API or cheat assets.
- Native deployment package with Linux x86_64 CI target, nginx/Caddy examples,
  systemd unit, SHA-256 inventory and a start/drain/proxy-switch/rollback smoke.
- M08 multiplayer verification profile: real dual-browser acceptance, 2 rooms x 8
  players capacity repetitions, 100 lifecycle cycles, slow-consumer isolation and a
  30-minute RSS/entity soak.
- Source-bound release evidence now binds the offline ledger, multiplayer ledger and
  native package to the same source identity.

### Changed

- The default browser entry is online and constructs only `NetworkTransport`;
  the explicit local profile remains available in the offline delivery for tests.
- New packaging and capacity tools are part of the verification/source identity.
- Deployment requires paired client/server protocol and catalog hashes; sessions are
  memory-only and are interrupted by upgrades.

### Fixed

- Slow readers are closed at the 1 MiB per-connection queue bound while healthy
  peers continue receiving snapshots.
- Capacity measurements exclude warmup and use the same generated protocol codec,
  native server and fixed 50 ms tick as production.

## [1.0.0] - 2026-10-31

### Added

- C++20 server engine compiled to WebAssembly, with a deterministic fixed-step
  simulation and a native test suite.
- TypeScript Canvas2D client with the worker envelope, sparse snapshot decoding,
  interpolation, rendering, menu, HUD, inventory and chat.
- Schema-driven protocol, layout and catalog generation under `schema/`.
- A repeatable product acceptance flow that builds, packages and verifies the
  independent `dist-next/` delivery tree.
- Local release archives with a verification-bound manifest and SHA-256 checksums.
- The Ubuntu font copyright notice and licence are included in the static
  delivery and release archive.

### Changed

- The product build, tests, runtime and delivery no longer read the
  original-client oracle or recovered source. Historical evidence is preserved
  under `archive/` for manual consultation only.
- The menu Changelog panel now describes this project instead of the upstream
  2020 client.
- Engine spatial queries, active-entity iteration and snapshot publication reuse
  bounded data structures to reduce repeated work.
- Rendering reuses bounded text, geometry and layout caches; each simulation
  step sends one ordered worker request.

### Fixed

- Mob Gallery drop probabilities are displayed in descending order.
- Long petal names such as Dandelion use the catalog's label size consistently
  on static cards and throughout pickup arrival, settlement and retirement.

### Removed

- Original-client snapshot writers, the skeleton snapshot fallback and the
  `original_client_*` worker ABI.
- Reference, recovery, parity and frozen-oracle tooling from the active tree.
