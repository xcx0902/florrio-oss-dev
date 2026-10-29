# Environment

## Requirements

| Component | Requirement |
| --- | --- |
| Node.js | 24+ (`node:test`, ESM, `WebAssembly`) |
| npm | 11+ |
| CMake | 3.24+ (`--fresh`) |
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
(`tools/lib/chromium.mjs`):

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
npm run build:engine:wasm   # emcc -> client/public/server.wasm
npm run build:client        # tsc -> client/public
npm run build:dist-next     # package dist-next/
```

`build:dist-next` runs the engine wasm, client build and packaging steps unless
`--skip-build` is passed. The output is self-contained: `index.html`,
`server-worker.js`, `server.wasm`, client JS/CSS, fonts and icons.

## Test

```sh
npm run test:unit           # protocol/wire unit tests
npm run test:tools          # delivery and verification tool tests
npm run test:engine         # native build + 12 CTest targets
npm run test:client         # typecheck + retained client tests
npm run verify:dist-next    # delivery manifest, hashes and source identity
```

The client tests launch a real Chromium and load `client/public` or `dist-next`
via `CLIENT_ROOT`. They do not read `archive/`.

## Full acceptance

```sh
npm run test:all
```

The runner performs, in order:

1. native engine build;
2. engine wasm build;
3. client build;
4. protocol unit tests;
5. tool tests;
6. CTest;
7. retained client tests;
8. `dist-next` packaging;
9. delivery identity and integrity checks;
10. delivery smoke tests against the packaged tree;
11. entrypoint smoke with a real Worker, keyboard and mouse;
12. Chromium browser matrix.

It writes `reports/current-verification.json`. A failed or interrupted run does
not produce a passing record. `reports/` is gitignored; attach the JSON and the
entrypoint screenshots when a result needs to be shared.

## Clean-checkout check

The archive is not an input. To prove it, copy the source tree without
`archive/` (and without generated output), then run the same commands:

```sh
rsync -a --exclude archive --exclude build --exclude dist-next \
  --exclude node_modules --exclude reports --exclude .git \
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
- **Stale `client/public` output** — `npm run build:client` rewrites the compiled
  JS and declarations; do not edit them by hand.
