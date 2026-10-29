# Browser and device matrix

## Supported

| Target | How it is exercised | Gate |
| --- | --- | --- |
| Chromium desktop (1280×720, DPR 1) | `tools/browser-matrix.mjs` with the packaged `dist-next` | full client suite |
| Chromium Retina (DPR 2) | `canvas-context` / `worker-browser` resize and backing-store checks | full client suite |
| Chromium touch (390×844, DPR 3, `hasTouch`, `isMobile`) | CDP touch events through the worker shim | menu → garden, joystick drag moves the player |
| Chromium headless entrypoint | `tools/smoke-entrypoints.mjs` with a real Worker, keyboard and mouse | live packets, rendered transition, no page/worker errors |

The acceptance browser is pinned by [`.chromium-version`](../.chromium-version).
`tools/check-browser-version.mjs` rejects any other version. `CHROME_PATH`
selects an executable; on macOS an installed Google Chrome is used otherwise.

## Non-goals

Firefox, WebKit/Safari and physical iOS/Android devices are not supported.
Adding one requires a real harness, evidence and a matrix update; installing the
browser alone is not enough.

## Commands

```sh
node tools/check-browser-version.mjs
npm run build:dist-next
CLIENT_ROOT=dist-next node tools/run-tests.mjs client-integration
node tools/browser-matrix.mjs
npm run test:all
```

`tools/browser-matrix.mjs` runs the worker desktop/touch suite against
`dist-next` by default. It fails on an unsupported `BROWSER` value or a missing
executable; it never substitutes `skip`.

## What a browser pass means

A browser pass proves the packaged client boots, decodes live engine packets,
accepts trusted input and renders a changing frame in Chromium. It does not
prove pixel equivalence with the archived original client, and it does not
replace the native engine, protocol or delivery checks.
