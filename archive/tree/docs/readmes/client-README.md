# TypeScript + Canvas2D client

The client owns input, interpolation, rendering and UI. It talks to the C++
engine through the original worker envelope.

## Build and test

```sh
npm run build:client   # tsc -> client/public
npm run test:client    # typecheck + browser smoke tests
```

`client/public/index.html` is the entry point. `client/public/server-worker.js`
loads `server.wasm`, forwards `sp_server_init/send/think/flush`, and posts any
flushed packets as intermediate responses before the final response.
`ServerWorkerClient.requestStream()` forwards every intermediate packet;
`request()` resolves the final payload.

## Layout

```
src/net/        worker client + wire types
src/state/      snapshot decoder boundary, world table, interpolation
src/input/      pointer, keyboard, touch joystick
src/render/     Canvas2D wrapper, paths, text, sprites, world, HUD
src/audio/      silent audio boundary
src/schema/     generated TS types/catalogs (do not edit)
```

## Current status

- Page boots, Canvas2D surface is created at DPR-aware size, worker init/think/
  flush round-trips in Chrome.
- `main.ts` drives 50 ms `send`/`think`/`flush`. The menu waits for Enter/click,
  then sends opcode 4 (restart) to create the default player; opcode 12 carries
  pointer/keyboard/touch direction and buttons each tick. Every intermediate
  flush packet is decoded. The live C++ server writes the domain mask entry
  (fields 2/5/8/24/26/31/53/55); the fixed skeleton decoder is a fallback.
- `server-worker.js` starts the original 50 ms worker tick in production, reads
  the output queue and transfers each packet. `?manual=1` disables the timer so
  parity drivers advance ticks on the virtual clock.
- Input: pointer aim/buttons, WASD/arrows, `I`/`Tab` inventory, `1`-`5` hotbar
  selection, `Esc` close. The encoder supports restart/discard/swap/spawn.
- Camera: `CameraState` follows the player with an exponential lag, tracks
  DPR/resize and converts screen to world. The renderer draws the player flower,
  five Basic petals, species-colored mobs, petals, drops, health bars, hit rings,
  menu, death overlay, HUD/hotbar/inventory and chat.
- The client projects field 2 to `speciesId`, field 26 to `kind`/`typeId`, and
  fields 53/55 to `health`/`maxHealth` (constructor 458 offsets 8/12). The
  camera follows kind 1; the HUD reads the projected health/maximum.
- `WorldState.applyPartial` merges health, maximum, kind, species, position,
  angle, dense fields and component offsets without dropping prior values.
  `healthKnown`/`maxHealthKnown` distinguish an absent field from a real zero.
- Dense groups use native component-pointer presence tracked from the mask or
  ordinal declarations (`componentPointers`); groups without a declared
  component stay absent. The old mask callback remains for tests.
- Events 9/11/14 are decoded into `Snapshot.events`; `WorldState` keeps the last
  eight chat lines and a 180 ms visual hit index, and the HUD/world pass render
  both.
- `window.__florr` exposes `freeze()`, `resume()` and `setSnapshot()` for the
  deterministic Canvas2D baseline in `tools/parity/run-client-scenario.mjs`.
- `npm run parity:client` compares the 8 new-client scenes in
  `tests/parity/next/`; this is a self-consistency baseline, not the original
  JS-client golden set.
