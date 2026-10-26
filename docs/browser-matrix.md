# Browser and device matrix

## Post-audit execution status — 2026-10-25

> **Browser tooling is repaired; final stable-source full acceptance and original equivalence remain pending.** The dated results below are historical snapshots, not a current all-green matrix or final source-bound report.

Current CI uses one Ubuntu `acceptance` job with the pinned toolchain and
Chromium; Firefox/WebKit and physical-device results do not gate this checkout.
The production matrix exercises desktop, Retina and a 390×844/DPR3 touch
profile. Touch must satisfy the actual mobile-UI UA predicate and uses trusted
directional input; `hasTouch` alone is insufficient. Main will bind final
counts, run IDs, hashes and residuals after the source stops changing.
Temporary runs use `--diagnostic` and cannot close acceptance. See
[goal.md](../goal.md) and [environment.md](environment.md).

Historical status (2026-10-23): Chrome passed the macOS unit/e2e and parity
checks listed below, including an emulated mobile viewport/touch path. These
results do not sign off the current source. Firefox/WebKit were not installed,
Safari automation was disabled, and physical devices were not verified in that
environment. Current acceptance targets Chromium only; see the runner contract
below.

## Tested (2026-10-23, macOS 26.0 arm64)

| Target | How | Result | Evidence |
| --- | --- | --- | --- |
| Chrome 156 headless (`HeadlessChrome/155.0.0.0` UA for goldens) | Playwright `chromium` with `CHROME_PATH` | ✅ | `npm run test:client` (68/68), `npm run test:parity` 8/8, `npm run parity:client` 8/8 |
| Chrome mobile emulation (390×844, DPR 3, `hasTouch: true`, `isMobile: true`) | Playwright context + CDP `Input.dispatchTouchEvent` | ✅ | `client/tests/worker-shim.test.mjs`: canvas backing store 1170×2532, touch start enters the garden, joystick drag moves the player +x |
| Desktop DPR 2 / resize | Playwright `deviceScaleFactor: 2` | ✅ | `client/tests/worker-shim.test.mjs` canvas/camera test |
| Chrome 156 desktop smoke against `dist-next` | `node serve.mjs` | ✅ | `serve.mjs` default root is `dist-next`; `GET /index.html` and `/server.wasm` (211,588 B) served with the right MIME types |

## Not tested here

The following preserves the historical environment gaps. Other browser engines
need a dedicated supported harness before they can enter acceptance; the current
`tools/browser-matrix.mjs` rejects every `BROWSER` value except `chromium`.

| Target | Historical blocker | Follow-up outside the current gate |
| --- | --- | --- |
| Firefox (Playwright) | `~/Library/Caches/ms-playwright` had no Firefox build; installation lacked network access | Install Firefox and add a supported Firefox harness before testing |
| WebKit / Safari (Playwright) | no WebKit build in the cache | Install WebKit and add a supported WebKit harness before testing |
| Safari (system) | `safaridriver --enable` required interactive admin approval; remote automation was off | Enable WebDriver and provide a Safari harness before testing |
| Real iOS/Android device | no device attached | open the served URL on the device, check menu→start→joystick→inventory |

## Decision (2026-10-23)

The port targets **Chromium-based browsers** (desktop Chrome/Edge and Chrome on
Android, including the mobile viewport/touch path) and sign-offs Firefox,
WebKit/Safari and physical iOS/Android devices as **non-goals** for this
checkout. Rationale: the original Florr build is a Chromium-era web game, the
environment cannot install Playwright Firefox/WebKit or enable `safaridriver`,
and the mobile input path is already exercised through CDP touch events on a
390x844/DPR3 emulated context. Re-opening this decision requires harness, evidence,
documentation and CI changes; installing another browser alone is insufficient.

## Gate definition

A browser may be declared supported when all of the following pass in that
browser:

1. `client/tests/worker-shim.test.mjs` (menu→garden, suicide→death→restart,
   equip/attack/defend/discard/swap/chat/drop, DPR/resize, worker envelope);
2. the mobile test above with a real touch device or an emulated touch context;
3. `tools/parity/run-client-scenario.mjs --all` produces the recorded canvas
   digests (no `deterministic: false`);
4. no page error and no worker error in any scenario.

`tools/browser-matrix.mjs` runs the worker desktop/touch suite in Chromium only,
using `CLIENT_ROOT=dist-next` by default. It requires Playwright and a launchable
Chromium executable; browser startup and test failures exit 1, never `skip`.
Unsupported `BROWSER` values also fail. This suite is one acceptance step; the
full runner separately requires all 24 production cases and the original-client
command/pixel gates described in [environment.md](environment.md).
