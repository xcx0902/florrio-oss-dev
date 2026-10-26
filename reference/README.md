# Frozen reference

This directory records the identity of the archived game and the current
reconstruction baseline. It is **reference only**: do not edit files under
`web/`, `dist/`, `dist-readable/`, `dist-reference/`, `source/wasm/*.wat`,
or `source/javascript/*.js` to make a test pass. If a reference change is
unavoidable, regenerate this manifest and record why in `docs/parity.md`.

The checkout has no `.git` directory, so the planned `reference-<date>` tag is
represented by content hashes in [`manifest.json`](manifest.json).

## Identity

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `web/client.wasm` | 1,844,233 | `c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1` |
| `web/sp_server.wasm` | 477,558 | `75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d` |
| `source/wasm/client.wat` | 24,294,384 | `d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31` |
| `source/wasm/sp_server.wat` | 5,913,819 | `dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8` |

Directory trees (path + size + content hash, sorted):

| Tree | Files | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `web/` | 21 | 2,611,163 | `362654c738597f7ab64caa46767aafe6a718f85f5949c2f9dad2240dfb3735b3` |
| `dist/` | 631 | 7,212,605 | `7ca94db6b9a1d2d636cfed1368194f7110e15655a61085a1f4ecbb03f29a02eb` |
| `dist-readable/` | 113 | 4,638,799 | `f2d931c22f9e8d6fe0117d6091aa051007e23a077a8e57090cfb3731f627c9f0` |
| `dist-reference/` | 21 | 2,836,745 | `a38f11ff9e57bab718d46ae6abfbd38501e84a98b6de9436650f0e7fc333fac7` |

## Reconstruction baseline

Authoritative counts from [`reports/build.json`](../reports/build.json):

| Module | Recovered as high-level JS | Still machine code | Total |
| --- | ---: | ---: | ---: |
| client | 3334 | 911 | 4245 |
| sp_server | 516 | 218 | 734 |
| **total** | **3850** | **1129** | **4979** |

These numbers supersede older prose counts in `goal.md` §5.1 and the
"coverage" table in `reports/RECONSTRUCTION.md`. The latter counts a different
quantity ("functions migrated into high-level execution" versus "functions whose
original body is still present"); `build.json` is the single source of truth for
the remaining-work baseline.

## Commands

```sh
npm ci --ignore-scripts
npm run build                 # rebuild dist/ from source
npm test                      # function-level oracle tests
npm run test:reference        # verify this manifest and the frozen trees
npm run test:engine           # C++20 core native unit tests
npm run build:engine:wasm     # C++20 core -> client/public/server.wasm
npm run test:client           # TypeScript typecheck + browser smoke tests
npm run test:parity           # Canvas2D/screenshot/server trace parity
npm run test:all              # all of the above, in CI order
node tools/reference-manifest.mjs   # refresh this manifest
```

## Test inventory

319 function-level test files are recorded with SHA-256 in
`manifest.json`. The manifest does not claim they currently all pass; run
`npm test` for that.

## Environment

- Node v24.17.0, darwin/arm64
- Emscripten: emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.10-git
- Chrome: Google Chrome 155.0.8059.85
