# Web slow and development-cheat parity

Date: 2026-10-28. Oracle artifacts were read-only; no frozen client/server file changed.

## 1. Web slow did not slow the player

### Confirmed original behavior

The original server applies effect multipliers when a behavior produces velocity, not in
`integrateMovement`:

- `sp_server.wat:133346` (`function_608`) seeds `l61 = 1.0` and multiplies
  `l61 = f32(l61 * effect.vtable[+20]())` for every active effect.
- `sp_server.wat:153420-153505` computes the player control impulse from
  `f32(l61 * 2.5)` and `dt * ... * 0.001`, then applies the strength scale. The web
  multiplier is therefore a factor of the impulse itself.
- `sp_server.wat:153560-153600` integrates positions/velocities from the stored
  acceleration; this loop has no effect multiplier and no call to the slow vtable.

The Web payload values are fixed by the oracle: `function_729` returns `0.25`
(`sp_server.wat:214423`) and `function_730` returns `+inf` (`sp_server.wat:214426`).
`WebR2PetalVirtualSlot6` stores `12000` in the tag lifetime field
(`sp_server.wat:214534`, bits `1178304512`), uses collision/tag radius 50 and installs the
50-unit area. Honey remains a finite 4000 ms, 0.5 slow.

### Previous port bug

`integrate_movement` multiplied `acceleration.x/y` by `slow_multiplier(entity)`, while
`apply_player_controls` did not use slow at all. Because the player control path writes a
per-tick impulse into velocity, the old global factor usually changed only residual
acceleration, so a web often appeared to do nothing. It also incorrectly slowed any
non-player entity whose motion reached `integrate_movement` through acceleration.

### Fix

- `slow_multiplier` now starts at `1.0` and multiplies every active slow intensity in
  float32, matching original608's product; it no longer takes the minimum.
- `apply_player_controls` reads `slow_multiplier(player)`, builds
  `behavior_scale = f32(slow * 2.5)`, and computes
  `base = f32(dt * behavior_scale * 0.001)` before the strength branch.
- `integrate_movement` no longer reads effects and integrates `acceleration` unchanged.
  AI already applies `behavior_speed_multiplier * slow_multiplier` at its own movement
  decision point.

### Regression coverage

- `test_status_effects_and_slow`: two 0.5 slows now produce `0.25`, not `0.5`.
- `test_slow_scales_player_control_impulse`: with identical input and `dt`, a 0.25 slow
  produces exactly one quarter of the unslowed `velocity.x` (float32 tolerance `1e-7`).
- `test_slow_does_not_scale_integrate_movement`: a constant acceleration moves the entity
  to the same position with and without a 0.25 slow.
- `test_petal_special_effects`: honey 0.5 combined with the Web area 0.25 yields `0.125`
  under product semantics.

## 2. MOVE RIGHT warning overlapped its countdown

The warning panel width omitted the command gutter. The warning command template writes
`65.0` at `+4` (`client.wat:320237`), original691 carries that qword to the command
record at `+24/+28`, and original1099 adds `record[+28]` to the widest label width. The
port used only the widest label width, so original2636's arc
(`panelLeft + panelWidth - 30`) was 65 logical pixels left of its correct position and
crossed the text.

`drawZoneWarning` now uses `width = max(labelWidths) + 65`. The focused test runs the real
native1099 with its vtable callback2636 for five countdown fractions and checks both the
22px and 18px arcs, including an 8px clearance between the arc and the widest label. It
uses zero text measurement on both sides so the comparison isolates layout; browser text
rasterization is still not claimed to be pixel-identical.

## 3. Development cheat changes

- Spawn coordinates are only copied from the live player when **Use player pos** is
  pressed. The periodic refresh no longer overwrites the X/Y inputs, so a manually typed
  position stays put.
- **Teleport** sends the current X/Y as two little-endian float32 values through
  `sp_server_debug_set_player_position`. The production worker shim maps that command to
  the existing debug ABI: it resolves the player handle and calls
  `sp_server_debug_set_entity_field(handle, 0|1, value)` for X/Y and then clears
  velocity (fields 2/3), so the flower lands exactly on the requested point.
- **Server speed** (1x/2x/4x/8x) makes one received input packet advance N fixed 50 ms
  engine ticks and flush each tick. The wall-clock send cadence stays 50 ms; only
  simulated time is multiplied. A non-integer or out-of-range value is clamped to 1..8.

## Verification

- `npm run test:engine`: 119/119, all 11 ctest targets pass.
- `npm run test:client`: 264/264.
- `npm run parity:engine-state:strict`: all 8 scenarios pass (no slow in those traces,
  so this confirms no unrelated regression).
- `npm run parity:client`: all 8 UI scenarios pass.
- `npm run parity:visual`: all 8 screenshots pass; `move`/`attack` have a maximum
  channel delta of 5 (ratio 0.000%), the other six are exact.
- `npm run parity:canvas`: 7/8 pass. `boot-menu` still reports 9 differences (four
  missing `save`/`restore` pairs at the frame tail); the affected `drawZoneWarning` code
  is not executed in the empty-world boot-menu scene, and the same trace is produced
  when the boot-menu scene is regenerated. Its screenshot remains exact. This residual
  command-stream difference is recorded here rather than silently treated as fixed.
- `npm run build:dist-next` and `npm run verify:dist-next`: 142 files, 1,315,455 bytes,
  no issues; `dist-next/server-worker.js` contains the teleport command.
- Headless browser smoke against `client/public`: a fresh cheat panel kept X/Y at `0/0`
  after the player spawned elsewhere; Teleport moved the flower to the requested area;
  a typed spawn at `(550, 500)` created a mob within 30 units; selecting `8x` updated the
  panel status. These checks exercise the production worker path, not a test-only shim.
