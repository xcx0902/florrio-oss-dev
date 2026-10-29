# ADR 0002 — Same-frame visual gate

Status: accepted (2026-10-24)

## Context

`tests/parity/golden/<scene>` is recorded from the archived client. Until
2026-10-24 `canvas-trace.js` kept the **first** three frames after the capture
reset while `run-scenario.mjs` saved the screenshot after the full 60-frame
window. The trace therefore described t=1936–1968 ms while the PNG described
t=2880 ms: camera, entity interpolation and even the command count (1,244 vs
913 ops) belonged to different frames. Any pixel comparison built on that pair
was measuring time, not rendering.

## Decision

1. `canvas-trace.js` keeps a rolling buffer of the **last** `captureFrames`
   frames. `export()` still slices the trailing window, so the saved trace and
   the screenshot describe the same frame.
2. The eight goldens were re-recorded with `node tools/parity/run-scenario.mjs
   --all --update`; the screenshot hashes are unchanged, which proves the
   archive is deterministic and only the trace window moved.
3. `tools/parity/visual-check.mjs` (`npm run parity:visual`) is the visual
   gate. It obtains the reconstructed client's screenshots, diffs them against
   the goldens in one Chromium instance, writes
   `tests/parity/visual/report.json` plus per-scene diff images, and exits 1
   above 0.1% changed pixels or a per-channel delta of 8.
4. The gate runs in `test:all` and in the CI `browser-parity` job. The ledger
   derives `knownGaps` from that report instead of hand-written numbers.
5. `tests/parity/golden/<scene>/camera.json` records the archived camera for
   each captured frame. The engine runner may pin it (`window.__florr.setCamera`)
   so a comparison isolates the renderer from camera-follow differences. This
   is a test device only; the client still follows its own camera in play, and
   `camera.json` is optional.

## Consequences

- Command-level and pixel-level comparisons now refer to the same frame.
- Re-recording goldens after this change is mandatory for any older checkout;
  the old first-three-frame traces are not comparable with the saved PNGs.
- The gate is blocking in `test:all`; the visual ratio is now part of
  `reports/current-verification.json`.
