# TypeScript + Canvas2D client

The client owns input, interpolation, rendering and UI. It talks to the local
C++ engine through the Worker envelope and never loads archived runtimes.

```sh
npm run build:client   # fresh staging -> build/client (JS only)
npm run build         # schema + wasm + TS + packaged dist-next
npm run test:client    # compiled client unit + real Chromium integration
```

Handwritten index/worker/fonts live in `client/static/`, compiler output in
`build/client/`, and the served product in `dist-next/`. Build the delivery before
running browser tests. Worker inputs are freed in finally; streaming RPC forwards
each packet, and error/messageerror/timeout/terminate settles pending requests.
The main thread owns one 50ms clock; each step transfers ordered inputs and
executes send→think→flush once before its final response.

`FrameContext` retains ordered membership and finished interpolation values;
`RenderResources` owns bounded LRU caches and explicit bitmap release. See
[M4 measurements and budgets](../docs/m4-performance.md).

## Ownership

- `main.ts`: find canvas, create/start GameApp, report boot failure, dispose on pagehide.
- `app/game-app.ts`: dependency composition, resize, start/dispose and optional cheats.
- `app/game-session.ts`: explicit menu/joining/playing/dying/dead/returning/error,
  init/spawn single flight, generation, cooldown, death metadata and resets.
- `app/simulation-loop.ts`: one in-flight 50ms server step and a disposable timer.
- `input/`: composed intentions, typed loadout commands and disposable listeners.
- `net/`: byte reader and the single transactional SnapshotDecoder; no fallback.
- `state/`: schema projection, WorldState authoritative map/player/kind indices,
  explicit full/delta application and independently timed scalar interpolation.
- `ui/layout/`: common HUD, inventory and death rectangles for drawing and hits;
  menu geometry remains in `render/menu-layout.ts`.
- `render/frame-renderer.ts`: frame composition; no network commands.
- `render/hud/`, `render/art/`: local drawing responsibilities.
- `render/resources.ts`: renderer-owned paths, labels, measurements and surfaces,
  selected only during synchronous drawing and released by dispose.
- `render/transitions.ts`: disposable entry/exit canvases.
- `audio/`: minimal SilentAudioBus boundary; sound is not implemented.

SnapshotDecoder validates a whole packet before committing component masks and
pointers. Projection names the death/loadout/domain fields; business code does
not decode numeric wire fields. WorldState distinguishes health 0 from absence,
healthy player from corpse, and clears event indices on deletion/reset/TTL.

`?test=1` explicitly installs `dev/test-api.ts` for product fixtures/performance.
The default delivery excludes its JS; shared test servers enable that one module
explicitly from build/client. The real default entrypoint smoke uses trusted
keyboard/pointer input and the shipped Worker without test API. `?cheat` retains
the existing diagnostic UI and cleans up its DOM and polling on dispose.

See [M3 mapping](../docs/m3-structure.md) for phase transitions, protocol consumers
and tests. Unit/integration tests cover movement, loadout, death/restart, IME/name
persistence, touch, geometry, resource ownership and worker lifecycle. Original
comparisons and old decoders are retired, never invoked by product tests.
