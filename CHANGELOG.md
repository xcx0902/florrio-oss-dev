# Changelog

All notable changes to this reconstruction are documented here. The in-game
Changelog panel is generated from this file by
`node tools/generate.mjs` (or `npm run schema:generate`); edit the Markdown, not
`client/src/schema/menu-content.ts`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Dates use `YYYY-MM-DD`.

## [2.0.0] - 2026-11-02

### Added

- Native authoritative C++20 game server on Boost.Asio/Beast: binary v2
  WebSocket, one shared World per room, fixed 50 ms tick, independent
  per-connection snapshots, health/readiness/metrics and graceful drain.
- Multiple `PlayerState`s in one World with explicit PlayerId, LifeEpoch input
  adoption, PVP ownership, unique pickups, death drops and respawn.
- Schema-generated v2 protocol with full/delta snapshots, area-of-interest
  filtering, public/private field projection and reconnect tokens.
- Default browser network client with a 50 ms InputPump, explicit
  PlayerId/controlled handle, command results and bounded reconnect. The online
  entry does not load `server.wasm` or `server-worker.js`.
- Network clock sampled from Pong, tick-ordered remote interpolation and bounded
  local movement prediction/replay with bounded visual correction.
- Native, protocol, real-socket and dual-browser multiplayer regression suites,
  including a 16-case RTT/jitter matrix and 250 ms RTT PVP comparison.

### Changed

- The default runtime is now the native WebSocket server plus browser network
  client. `?profile=offline` keeps the previous Worker/WASM single-player path
  as an explicit diagnostic profile.
- v2 field layouts changed during development; client and server must be
  rebuilt together. Earlier development v2 builds are not compatible.
- Room defaults remain two players and two rooms. The eight-player capacity
  target, Linux release package and TLS deployment profile are not certified by
  this release.

### Fixed

- Continuous movement no longer stops and jumps between 50 ms prediction
  states; the displayed body, camera and own petals interpolate between fixed
  steps and calibrate the server clock gradually.
- Reconnect/respawn races no longer apply a stale life's input or replace a
  fresh spawn confirmation with an older death snapshot.

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
