# Legacy UI detail and centipede parity

Evidence checked on 2026-10-28 against the read-only original client/server
WASM, their decompilation, and the original menu in the browser.

- `client804` places equipped key hints at `slotY - size/2 - 15`, with font
  16. Delete uses font 16 too: below level 15 its hint is centered at
  `(x, y - size/2 - 15)`; from level 15 it is at
  `(x + size/2 + 15, y - size/2 + 8)`. Alpha changes without vertical drift.
- `client623` passes a one-element horizontal-offset array containing `-2`
  to `client691`; `client1099` applies it only to the first (title) line.
  It does not change the tooltip panel's width or the other lines.
- `client587` sets round line joins before its rarity-card border, including
  the retained death row. Its stroked rectangle is rounded by that join.
  The native renderer caches this style; the active gameplay HUD already has
  it, whereas the independent death row must establish it explicitly.
- `client1095` starts connection amount `7926820` at 1 and withdrawal amount
  `7926824` at 0. Each approaches its target by
  `clamp(1 - pow(.9, f32(delta)*.06))`, storing f32 each frame and snapping
  when the remaining distance is below `1e-7` (confirmed in the WAT, whose
  decompiled decimal rendering loses this constant). Hidden amount is the
  maximum of the two; opacity is `1-hidden` and logical translation is
  `f32(f32(-200-inputY)*hidden)`. Desktop `inputY` is `trunc(height/4)+200`.
  A spawn request sets a 3000 ms deadline **after** that frame's input draw.
  Active gameplay passes extend the deadline to at least `now+200`.
  The outer menu overlay amount `7926696` advances by `f32(delta)*.001` and
  clamps to [0,1]. At `>= .9999`, the menu pass stops, including input-state
  updates and deadline refreshes. These resume when returning to the menu.
  The editable DOM text follows the same presentation as the canvas frame;
  the moving frame is excluded from the captured menu iris.
- The menu constructs one catalogue visual from `definition+48` for each
  floating object and invokes that visual once, independently of the slot's
  `definition+32` instance count. Peas' four discs belong to the visual itself.
- `client587` translates each instance by `(10*cos(a), 10*sin(a))` before
  invoking its catalogue visual. Web's one-radian icon rotation belongs to
  each visual, not to the collection of translation offsets. Thus Legendary
  Web has two instances on the left and one on the right.
- `server423` recursively applies the `AI+108 || AI+109` attacker-alert gate
  to descendants. `server654` links each body segment's target reference to
  its predecessor's `AI+152` target reference before skipping independent
  steering. `server205` leaves both alert gates clear for normal centipedes.
  A surviving evil segment therefore retains the player target when its
  preceding segment is removed; a normal segment cannot acquire one merely
  because another segment was hit.
- `server43` calls `server424` at lethal damage, before the 1000 ms corpse
  interval. Every centipede link has its `+76` inheritance flag clear, so
  `server267` detaches both the dead segment and its successor immediately.
  A middle death splits the tail into an independent root too. `server404`
  later reparents ordinary ownership separately; it never reconnects those
  constraint links. The earlier direct-`destroy` test missed the corpse
  interval and incorrectly expected a middle removal to reconnect the chain.
- In `client1095`, the renderer at `156504` is translated by `437368`, the
  death HUD's 0..400 logical-unit slide, before calling every `client803`
  card (active, collected, retired and dragged). Collection-flight coordinates
  and slot anchors stay unchanged. The collected-card renderer previously
  replaced that translated matrix with an absolute screen matrix, leaving
  settled pickups at their old slot positions after the rest of the HUD left.

## Verification and scope

The eight requested discrepancies were checked against original evidence.
The follow-up below strengthens the lethal-damage and collected-card coverage;
the earlier checks did not establish those two lifecycle cases. Original files
and frozen goldens were not rewritten.

- `client/tests/ui-detail-parity.test.mjs` executes original804 at levels
  1/14/15/29/30/44/45 and hint alphas .1/.5/1; checks the transforms from
  original587 for Twin, Triplet, Legendary Web and Legendary Cactus; checks
  one menu visual per object (including the three Peas variants); reads
  original623's title-offset record; and checks death/menu round joins.
- `client/tests/menu-input-parity.test.mjs` runs the original client and server
  at 1280x720 with 16 ms frames: 200 boot, 80 spawn, 80 death, 100 return.
  All 460 frames compare exact opacity and logical translation, the menu-pass
  enable condition, and visible input matrices within 0.0001. The death fixture
  adds an in-memory export of original server43 and invokes its real damage
  and death callbacks. It does not modify animation globals or original WASM
  instructions. The test asserts that a real living body dies and returns.
- `engine_centipede_tests` covers passive damage propagation, head promotion,
  recursive evil-chain alerting, inherited automatic targets, lethal head and
  middle damage, split constraints, ordinary ownership, and corpse removal.
  `engine/tests/oracle/centipede-death-evidence.mjs --native
  build/engine/engine_centipede_tests` compares all 22 50-ms movement/AI/corpse
  frames to original43/654 with exact position and velocity equality. The
  target starts at 750 units: outside 600 acquisition, within 900 retention.
- The collected-card case in `client/tests/event-effects.test.mjs` runs
  original803 with its translated renderer for equipped and storage cards,
  immediate and settled pickups, and both active and retiring visuals.
  Every flight-state f32 store agrees exactly; equivalent border matrices
  agree within 0.0002 through 80 death frames per replay.
- `client/tests/death-pickup-regression.test.mjs` starts the actual client and
  worker, freezes server traffic, installs an isolated world fixture and feeds
  opcode14 through the production decoder. The actual main frame loop settles
  the pickup, observes health death and moves its border below the viewport.
  This specifically catches the former-card-at-old-slot regression.
- Existing menu/HUD command goldens, tooltip/petal/rendering tests, editable
  menu controls, death lifecycle and the actual worker-backed
  start/death/menu/immediate-respawn flow are the related regressions.

The frame comparison above is a defined desktop replay, not a claim that
every pixel of the entire project has been exhaustively compared on every
viewport, browser or device-pixel ratio. Mobile-specific presentation has not
received an additional original-browser replay in this change.
