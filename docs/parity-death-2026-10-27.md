# Death/restart parity investigation — 2026-10-27

## Ownership

Death/progression worker owns `client/src/main.ts`, death metadata in
`client/src/state/world.ts`, the death-only `HudDeathState`/`drawDeathOverlay`
block in `client/src/render/hud.ts`, and engine player/death/progression
lifecycle changes. New focused tests/probes belong to this worker.

The coordinating user owns `client/src/input/menu.ts`, `hud.ts`
`drawZoneWarning`, menu wheel/overlevel, and zone progression. Other workers
own passives/AI, projectile simulation, and renderer art/models. Preserve their
changes and coordinate shared-file edits. Original oracles and frozen artifacts
are immutable.

## Original identity and method

The investigation started on October 27 and continued on October 28, 2026
(Asia/Shanghai). The filename is the coordinating ledger's requested date.
Original artifacts, existing oracle helpers, and frozen captures were not edited.

| Artifact | SHA-256 |
| --- | --- |
| `web/sp_server.wasm` | `75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d` |
| `web/client.wasm` | `c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1` |

New, separately named probes reuse the existing original-WASM helpers.
`engine/tests/oracle/death-lifecycle-evidence.mjs` boots the actual original
server, adds exports in memory without changing instructions, and exercises
original43/145 and real opcode6. Its explicit fixture sets level, carried
inventory, partial XP, score, game RNG47, and independent shuffle RNG1.
`engine/tests/oracle/death-client-evidence.mjs` runs the frozen original client
and server in Chromium using the unchanged parity clock/worker/Canvas helpers.
The isolated UI fixture sets a corpse's level and carried slots in live memory;
it is not an unmodified gameplay recording or a claim of whole-frame pixel parity.

## Confirmed lifecycle and loss semantics

1. **Death and corpse timing.** Original `damage43` immediately sets HP to zero,
   processes death and records a deadline exactly 1,000 ms after the damage call.
   At +950 ms the original controller still owns the corpse; at +1,000 ms the
   body is removed. Recovered `input.mjs`'s opcode3 invokes damage synchronously
   when its original permission gate allows it. The old C++ assertion ran one
   50 ms `think()` after `send()`, so its remaining deadline is **950 ms**.
2. **Final stats and inventory remain on the corpse.** Death does not replace
   the carried inventory with the survivor list. The full carried slots, final
   level, score, and partial XP remain available during that second. Owned
   petals are killed separately. The client must retain this snapshot after
   corpse/controller deletion, including when both packets arrive before RAF.
3. **Ground drops and respawn survivors were reversed in the caller.** Despite
   their historical C++ names, `LootResult.retained` is the first three eligible
   ground drops; `LootResult.lost` is the next up to ten petals saved in the
   controller for respawn. Original controller field16/count34 contains the
   latter list. Basic never enters either result. Candidates are processed by
   descending rarity, shuffled within rarity, and discarded on a 10% roll.
   Ground drops of rarity >=2 additionally have a 1% Pollen conversion roll.
4. **Level and XP.** Controller field47 is the level at death. Field1 is
   `floor(deathLevel * 3 / 4)`. Spawn clamps the remembered level to at least1,
   discards partial XP, and rebuilds cumulative points by awarding successive
   level thresholds. It does not preserve the previous score or level.
5. **Next equipment.** Restore the controller survivors in their existing
   order, then add Basic until the active row is full. Survivors may occupy
   reserve slots. Clear the consumed survivor list and the old backpack.
   The rare starter roll applies only to Basic filler, with legendary uniqueness.
6. **Spawn cooldown.** Original spawn sets controller+288 to 2,500 ms. With an
   immediate death, real opcode6 at +1,000 ms is rejected with 1,500 ms remaining;
   +2,450 ms is still rejected and +2,500 ms succeeds. This deadline starts at
   the previous successful **spawn**, independently of the 1,000 ms corpse.
   A death after that cooldown expired adds no new 2,500 ms delay.

Direct source cross-checks: `legacy/source/game/server/damage.mjs:169` (selection)
and `:414` (death); `legacy/source/game/server/input.mjs:467` (spawn), `:586`
(level restoration), `:728` (suicide), `:744` (restart request).
The remembered-level multiplication is original145 in
`source/wasm/sp_server.wat` around line31290.

### Observed deterministic cases

Carried types are `[1,2,6,7,8,9,10,12,15,18,19,22,25,29,34,36]`, prior score
1234.5 and partial XP2.5. Each row is an independently restored original fixture;
all respawns have partial XP0. The fixture respects each level's slot capacity.

| Death level | Respawn level | Respawn points | Survivors, in order | Ground drops |
| --- | --- | --- | --- | --- |
| 1 | 1 | 0 | 15,9,10,18,8,7,6,2 | 19,12,22 |
| 14 | 10 | 86 | 15,9,10,18,8,7,6,2 | 19,12,22 |
| 15 | 11 | 105 | 15,9,10,18,29,6,7,8,2 | 19,12,22 |
| 30 | 22 | 577 | 12,22,9,29,18,10,6,7,8 | 34,15,19 |
| 45 | 33 | 2008 | 12,22,9,29,18,10,36,8,7,2 | 34,15,19 |
| 99 | 74 | 66523 | 12,22,9,29,18,10,36,8,7,2 | 34,15,19 |

### Independent shuffle stream and seed boundary

Original130 initializes the shuffle stream once from four host `randomGet`
bytes, modulo 2147483647, with zero normalized to 1
(`source/wasm/sp_server.wat` around line27357). Ordinary game RNG and the death
shuffle are separate streams. The shuffle advances across deaths and is not
reset by spawn. Three successive original deaths, with level45/carried items and
game RNG47 restored each life, but shuffle seeded only once to1, produced:

| Death | Shuffle state afterward | Survivors, in order | Ground drops |
| --- | --- | --- | --- |
| 1 | 192302371 | 12,22,9,29,18,10,36,8,7,2 | 34,15,19 |
| 2 | 914937185 | 12,22,18,10,29,9,36,8,6,2 | 34,19,15 |
| 3 | 662405787 | 22,12,10,36,9,29,18,6,8,2 | 25,19,15 |

The C++ world now owns this independent persistent stream. Its explicit default
is the bounded fixture seed1; `seed_death_shuffle()` accepts an explicit seed
with the original normalization. World initialization and respawn do not reseed
it. This fixes the confirmed per-death reset while preserving reproducible
fixtures. The original host's actual initial entropy value is unknown; this
implementation does not claim the same survivor sequence across arbitrary hosts.
No `std::random_device`, entropy WASM import, or extra game-RNG draw is used.

## Confirmed client presentation

The death branch belongs to **outer clientFrame1095**, not world renderer763.
`source/decompiled/client/functions-0704-0767.dcmp:9304` snapshots occupied
carried slots and active capacity once. Around `:9367`, each rendered frame
stores the following binary32 value (dt is also binary32):

```js
progress = Math.fround(progress + (1 - progress)
  * (1 - Math.pow(0.95, Math.fround(dtMilliseconds) * 0.06)));
```

The new original browser probe checks all 80 consecutive 16 ms frames exactly:
frame1 `0.04804885387420654`, frame2 `0.09378901869058609`, frame10
`0.38885167241096497`, frame30 `0.7717347145080566`, frame80
`0.9805386662483215`. The original keeps all16 fixture slots throughout.

Geometry is in `ceil(viewport / uiScale)` logical coordinates:

| Element | Native geometry |
| --- | --- |
| Dim layer | `progress * .25` opacity |
| Illustration/text origin | `(trunc(width/2), trunc(height/2) - f32(f32(1-progress)*height))` |
| Heading, killer, continue text | y=-120, -90, +90 relative to origin; fonts18,24,18 |
| Behind flower slots2,3,4 | offsets (-48,+7.5),(-15,-22.5),(+45,-7.5), scale1.5 |
| Front slots1,0 | offsets (-15,+45),(+52.5,+30), scale1.5 |
| Dead flower | scale1.5, rotation-.2; exact native binary32 sine/cosine constants |
| Stats/points/level box tops | height-160, height-126, height-104; x=20; fonts24,16,16 |
| Carried cards | occupied slots0..15; left20; active size60, reserve50; gap10; centerY=height-45 |
| Lower group entry | add `f32(f32(1-progress)*height)` to stats/card y |

Native petal definition offset40 suppresses its world instance. A direct probe
of the original client table found only type25 (Antennae) with this flag. Cards
still display it. No replacement Basic ring is invented for empty slots.
The original card row keeps empty slots absent rather than packing their indices
into the five-petal illustration. Stats display the death level, independently
of the menu's reduced respawn level.

Source ranges: decompiled outer frame `:9395` (translation/dimmer), `:9600`
(flower transform), `:9840` (labels), `:9900` (stats), `:10090` (cards).
Exact rotation constants are WAT `333929`/`333939`, rather than the decompiler's
rounded decimal display. The previous screenshot-derived stats offsets were
corrected to the original box coordinates above.

## Changes and validation

`DeathLifecycle` owns receipt-time snapshotting and per-frame animation.
`main.ts` observes each applied packet, retains the final carried inventory and
death metadata after deletion, and queues the menu spawn until both the old
corpse is gone and the engine cooldown has expired. The manual worker advances
exactly 50 ms per completed `think()`. Counting those acknowledgements anchors
the next spawn to fifty engine steps after the last spawn, even if the local
timer stalls. The pending intent remains until a healthy authoritative body
arrives; the immediate-Enter regression requires exactly **one** opcode6 request.
There is no wall-clock estimate or periodic retry. The death-only HUD interface
now accepts `progress`; the zone fields/`createHudState`/warning edits were
preserved.

The server enforces the gate for opcode6 and the reconstruction's opcode4
compatibility entry point. Original opcode4 itself requests a transport/game
restart, so direct opcode4 spawn is explicitly compatibility behavior, not an
assertion that original opcode4 directly spawns a body.

Validation completed:

- `node node_modules/typescript/bin/tsc -p client/tsconfig.json`: pass.
- `node --test client/tests/death-lifecycle.test.mjs`: all4 pass, including
  actual transformed text positions, exact native stats boxes, real petal types,
  reserve cards, batched corpse/deletion, binary32 animation and zero stats.
  The earlier full suite's `Stats moves into view` failure was in the recorder
  assertion; it now records the actual CTM at paint time.
- `engine_death_lifecycle_tests`: pass, twelve deterministic level/opcode cases,
  exact 1,000/2,450/2,500 ms boundaries, late death, repeated Basic-only deaths,
  and the three successive original shuffle states/orders above. Values are
  anchored to frozen-server observations, not inferred from the implementation.
- Real Chromium `death:` menu regression: pass on the final WASM; actual keyboard
  death -> menu -> immediate Enter produces a new healthy handle, one opcode6
  packet, and exactly fifty engine steps between spawn requests.
- Real Chromium `single match: spawn, suicide, death overlay and restart`: pass
  on the final WASM, including genuine worker instantiation and a fresh body.
- Final full client integration: **264/264 pass**, recorded in the coordinator's
  `/tmp/florr-client-final.tap`, including the counted-clock spawn regression and
  corrected stats geometry assertion.
- Final clean native integration: **11/11 CTest targets pass**, recorded in
  `/tmp/florr-fixes-ctest-final.log`. The archived death/restart and peer-visibility
  fixtures now wait for the 2,500 ms gate. A clean rebuild resolved stale test
  objects. The coordinator separately corrected the old discard-deletion
  assertions for that petal's 1,000 ms corpse; no death-worker edit was made to
  that block.
- `node tools/build-engine-wasm.mjs`: pass. Final shared
  `client/public/server.wasm` SHA-256 is
  `322eafbeae533bd8989f408a906e0da7c600c09724f804397fc5db382e75c246`.
  Its only imports are `env.emscripten_notify_memory_growth` and WASI
  `fd_close`, `fd_write`, `fd_seek`, all already supported by `server-worker.js`.
- `node tools/verify-reference.mjs`: all four frozen trees and15 key files
  unchanged; no issues.
- `git diff --check`: pass at death source freeze.

After this worker's source freeze, the coordinator corrected the production
scenario driver's obsolete right-click discard input to use actual pointer
drags, without changing game code or relaxing acceptance checks. The final
delivery identity and production packaging/validation are tracked in
`docs/parity-fixes-2026-10-27.md`; this section does not claim an additional
completed browser run.

Reproduce original evidence without writing any reference tree:

```sh
node engine/tests/oracle/death-lifecycle-evidence.mjs --out /tmp/florr-death-lifecycle-original.json
node engine/tests/oracle/death-client-evidence.mjs --out /tmp/florr-death-client-original.json --screenshot /tmp/florr-death-client-original.png
```

## Boundaries at source freeze

- The confirmed 2,500 ms gate and persistent independent shuffle are implemented
  and verified. The remaining RNG boundary is the original host entropy value;
  default seed1 is an accepted explicit fixture, not arbitrary-entropy parity.
- Compact-mode XP multipliers and the entire original death-to-menu iris were
  not isolated as equivalence tests here. The existing menu transition is
  preserved; the confirmed death HUD animation and geometry are covered above.
- Renderer models/artwork, AI/passives, zone progression and projectile behavior
  are other workers' scope. This record establishes death pipeline timing/state
  and geometry, not universal visual equivalence.
