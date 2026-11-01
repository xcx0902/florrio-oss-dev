# Environment

## Requirements

| Component | Requirement |
| --- | --- |
| Node.js | 24+ (`node:test`, ESM, `WebAssembly`) |
| npm | 11+ |
| CMake | 3.24+ |
| C++ compiler | C++20, tested with Apple Clang |
| Emscripten | version from [`.emscripten-version`](../.emscripten-version) (6.0.10) |
| Chromium | version from [`.chromium-version`](../.chromium-version) (156.0.8078.47) for acceptance |

Firefox, WebKit and physical mobile devices are not supported targets. The
browser runner uses Chromium desktop plus a 390×844/DPR3 emulated touch profile.

No remote CI is configured in this checkout. All commands below run locally.

## Install

```sh
npm ci
```

Emscripten must be on `PATH` and `emcc --version` must satisfy the pin. If it is
installed through emsdk:

```sh
source /path/to/emsdk/emsdk_env.sh
emcc --version
```

Chromium selection is shared by every browser runner
(`tools/lib/browser-harness.mjs` and `chromium.mjs`):

1. `CHROME_PATH` explicitly selects an executable and fails if missing.
2. On macOS an installed Google Chrome is used.
3. Otherwise Playwright's bundled Chromium is used for diagnostics.

Acceptance requires the `.chromium-version` pin. Verify it before a full run:

```sh
node tools/check-browser-version.mjs
```

## Build

```sh
npm run build:engine        # native Release build in build/engine
npm run build:engine:wasm   # Emscripten CMake -> build/wasm/server.wasm
npm run build:client        # tsc -> fresh build/client
npm run build               # schema + wasm + TS + dist-next/
```

`build:dist-next` runs the engine wasm, client build and packaging steps unless
`--skip-build` is passed. The output is self-contained: `index.html`,
`server-worker.js`, `server.wasm`, client JS/CSS, fonts and icons.

## Test

```sh
npm run test:unit           # protocol/wire unit tests
npm run test:tools          # delivery and verification tool tests
npm run test:engine         # native build + 18 CTest targets
npm run test:server:native  # root native build + 29 CTest targets (M05 network included)
npm run test:client         # typecheck + client unit/integration suites
npm run test:integration    # native WorkerApi fixture -> TS decoder
npm run build:dist-next     # packaged delivery tree
npm run verify:delivery    # delivery manifest, hashes and source identity
npm run test:delivery       # dist-next online PVP and offline menu smoke
```

The client tests launch a real Chromium and load the packaged `dist-next`
via `CLIENT_ROOT`. They do not read `archive/`.

## Full acceptance

```sh
npm run test:all
```

The sole definition is `tools/verification/gates.mjs`: schema check, native
build/complete CTest, wasm, TS, package once, unit/tools/client unit, cross-end
integration, ABI, delivery integrity, browser scenarios/entrypoint smoke/render
performance in one pinned Chromium process, engine performance and integration
performance, plus the M01 native host build/CTest (17 gates). Each gate binds the same run and delivery identity.

It writes `reports/current-verification.json`. A failed or interrupted run does
not produce a passing record. `reports/` is gitignored; attach the JSON and the
entrypoint screenshots when a result needs to be shared.

## Clean-checkout check

The archive is not an input. To prove it, copy the source tree without
`archive/` (and without generated output), then run the same commands:

```sh
rsync -a --exclude archive --exclude build --exclude 'dist*' \
  --exclude node_modules --exclude reports --exclude .git --exclude .emcache --exclude release --exclude public \
  ./ /tmp/florrio-product/
cd /tmp/florrio-product
npm ci
npm run test:all
```

The result must be identical to the in-place run apart from timestamps and
absolute paths. If a command needs `archive/`, the migration is incomplete.

## Troubleshooting

- **`emcc: command not found`** — load the emsdk environment; the wasm build does
  not fall back to a prebuilt binary.
- **Worker or wasm fails to load** — serve over HTTP (`node serve.mjs`), not
  `file://`.
- **Chromium version mismatch** — set `CHROME_PATH` to the pinned build or install
  it; the acceptance step rejects other versions.
- **Port already in use** — `serve.mjs` increments the port; pass `--port` to
  choose one explicitly.
- **Stale compiled output** — `npm run build:client` atomically replaces `build/client`
  from fresh staging; do not edit generated JS. `client/public` is obsolete.
- **Preparing a release** — see [release.md](release.md); a completed current ledger
  is required, and old reports cannot be inherited.

## Native host dependencies (M01—M05)

`npm run build:server` / `test:server:native` configure the root CMake project.
The server consumes only the Boost 1.86.0 official archive headers locked by
`cmake/dependencies.lock.json`, with mandatory SHA256 validation and no system
fallback. The first root build requires access to that archive, or an identical
local copy passed as `FLORR_BOOST_ARCHIVE=/absolute/path/boost_1_86_0.tar.bz2`.
Standalone `cmake -S engine` and offline WASM builds do not download Boost.
See [server/README.md](../server/README.md) for the native WebSocket service,
strict configuration, finite smoke command and native evidence. M05 provides
the network host; the browser product transport follows in M06.

The browser integration suite also starts `build/native/server/server_browser_fixture`.
Run `npm run build:server` before invoking that suite directly. The ordinary online
entry uses `connection.json`; `node serve.mjs --server ws://127.0.0.1:8787/ws` supplies
an explicit local address. The native service must allow the exact frontend Origin.
