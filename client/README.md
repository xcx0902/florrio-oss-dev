# TypeScript + Canvas2D client

The client owns input, interpolation, rendering and UI. It talks to the C++
engine through a small worker envelope; it never loads the original client or
the archived oracle.

## Build and test

```sh
npm run build:client   # tsc -> client/public
npm run test:client    # typecheck + product client tests
```

`client/public/index.html` is the entry point. `client/public/server-worker.js`
loads `server.wasm`, forwards `sp_server_init/send/think/flush`, and posts each
flushed packet as an intermediate response before the final response.
`ServerWorkerClient.requestStream()` forwards every packet; `request()` resolves
the final payload.

## Layout

```
src/net/          worker client + wire types
src/state/        snapshot decoders, world table, interpolation
src/input/        pointer, keyboard, touch joystick
src/render/       Canvas2D wrapper, paths, text, sprites, world, HUD, menu
src/audio/        silent audio boundary
src/schema/       generated protocol types, catalogs and the project changelog
```

## Runtime

- `main.ts` drives a 50 ms `send`/`think`/`flush` loop. The menu waits for
  Enter/click, then sends opcode 4 (restart) to create the default player;
  opcode 12 carries pointer/keyboard/touch direction and buttons each tick.
- Every intermediate flush packet is decoded by `BareSnapshotDecoder`
  with the dense plans from `schema/protocol.yaml`. There is no skeleton or
  alternate framing fallback: malformed packets are rejected.
- `WorldState.applyPartial` merges health, maximum, kind, species, position,
  angle, dense fields and component offsets without dropping prior values.
  `healthKnown`/`maxHealthKnown` distinguish an absent field from a real zero.
- Dense groups use native component-pointer presence tracked from the mask or
  ordinal declarations (`componentPointers`); groups without a declared
  component stay absent.
- Events 9/11/14 are decoded into `Snapshot.events`; `WorldState` keeps the last
  eight chat lines, a 1000 ms hit clock and a 180 ms pickup-transfer index. The
  HUD and world passes render them.
- Input: pointer aim/buttons, WASD/arrows, `I`/`Tab` inventory, `1`–`5` hotbar
  selection, `Esc` close. The encoder supports restart/discard/swap/spawn.
- Camera: `CameraState` follows the player with an exponential lag, tracks
  DPR/resize and converts screen to world. The renderer draws the player flower,
  equipped petals, species-colored mobs, petals, drops, health bars, hit rings,
  menu, death overlay, HUD/hotbar/inventory and chat.
- The client projects field 2 to `speciesId`, field 26 to `kind`/`typeId`, and
  fields 53/55 to `health`/`maxHealth`. Field 26 is a documented domain
  extension; the catalog species id remains field 2.

`window.__florr` exposes `freeze()`, `resume()` and `setSnapshot()` for
deterministic product tests and browser diagnostics. It does not expose the
archived original runtime.

## Tests

`client/tests/*.test.mjs` covers the retained product surface: boot and worker
shim, snapshot decoding, movement, loadout, petal transfers, death lifecycle,
event effects, menu animation/interactions, canvas context and tooltip UI.
Original-WASM comparisons, golden screenshots and parity recordings live under
[`../archive/`](../archive/README.md) and are not run by the product suite.
