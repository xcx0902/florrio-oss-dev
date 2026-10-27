# Rendering parity investigation, 2026-10-27

Updated 2026-10-28. The requested filename retains the investigation date.

## Ownership and current status

Rendering owns `client/src/render/entity-art.ts`, `world.ts`, the new
`petal-effects.ts`, `client/tests/helpers/rendering-oracle.mjs`,
`client/tests/rendering-parity.test.mjs`, and this report. The user subsequently
assigned the bounded production publication changes in
`engine/src/net/worker_api.cpp` and the poison hit-feedback fix in combat/effects.
Other agents own `main.ts`, death, menu wheel/overlevel, and projectile simulation.
The user added the built-worker integration case in `worker-shim.test.mjs`.
No original artifact, recovered original source, golden or existing oracle is edited.

Native rendering comparisons pass. The built-worker integration test passes for
all eight special petal types. Poison feedback is implemented and its native
regression executable matches the immutable original WASM's feedback trace.
Source files are frozen at the user's 2026-10-28 request. Delivery WASM/build
gates remain with the coordinating/death worker; no further source edits are planned.

## Immutable evidence

- Original `legacy/web/client.wasm` SHA-256:
  `c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1`.
- Original `legacy/source/wasm/client.wat` SHA-256:
  `d186265b47a67de04afd06540925c28f323e3e3f7f0cdff1d97b1e3e8d8fcd31`.
- Original `legacy/web/sp_server.wasm` SHA-256:
  `75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d`.
- The user independently verified the online client WASM has the frozen SHA.
- `node tools/verify-reference.mjs` checks the frozen trees and 15 key artifacts.
- `web`, `source/game`, and `source/wasm` resolve into the preserved original;
  these paths are evidence, never output destinations.

The reverse-engineer-anything skill was used. Its REA backend was unavailable;
investigation used the existing WAT, recovered source and executable WASM probes.
Recovered names aid navigation; actual original WASM execution supplies the oracle.

## Findings, sources and changes

| Item | Exact original evidence | Confirmed result and implementation |
| --- | --- | --- |
| Hornet missile | Client func760, WAT 128970–129733; `legacy/source/game/client/entity-renderer.mjs`, `drawTriangleComponent` | Triangle `(11,0),(-11,-6),(-11,6)`, fixed f32 scale 1.3, stroke 5, round join/cap. Collider radius must not scale this model. `drawHornetMissile` follows that component. |
| Missile petal | Client func3596, WAT 721497 | Same triangle at scale 1 with a round join. Existing points were correct; the miter join caused the sharp tip. |
| Antennae menu art | Client func4064, WAT 748401 | Existing curves match. Restore the native round join at the antenna tips. |
| Peas cluster | Client funcs3628/3649/4283, WAT 723295/724861/765818 | Four separately painted circles at diagonal offsets `(±6,±6)`, radius 7. Legendary uses `(±7,±7)`, radius 10. Icon angle is 1 radian. The previous axial cross and Legendary radius were wrong. |
| Peas animation | Client bind func821, WAT 172583; renderer funcs3628/3649/4283 | Seed a persistent phase from the native Park–Miller stream; advance by f32(`old + f32(delta)*.001`) before drawing. |
| Single launched Pea | Client func760, WAT 129740–130412; original server `legacy/source/game/server/petals-special.mjs:214–285` | Native component at entity+68 replaces the catalogue cluster. Its flags bit 0 selects purple, bit 1 selects radius 10 rather than 7. The split callback writes 0/1/3 for types 11/12/34. |
| Ground Web | Client func760, WAT 130868–131784; recovered `drawSpokedEffectComponent` | Five scalloped rings (radii 10,20,30,40,50), 13 segments each and 13 spokes to radius 55; white stroke 3. Scale grows toward 1 with retention .7 and opacity is progress*.5. Existing-in-view webs start at 1; creation-marked webs grow from 0. |
| Unique Basic | Client func4355, WAT 769322; base body func1134, WAT 439323 | Persistent white world-space particles, radius 3, 50 ms emission budget, maximum 32, velocity 70. Native f32 opacity decay, movement and swap-removal are reproduced. Synthetic yellow orbiting dots were removed. |
| Unique Square | Client func3486, WAT 714705; ctor1674, WAT 458855 | There is no particle emitter. It rotates the square with a random initial phase and advances by f32(`old + f32(delta)*.0003`) after drawing. |
| Missile/Dandelion direction | Original server `legacy/source/game/server/petals.mjs:218–241`, `aimedProjectileOrbit`; client Dandelion func3787, WAT 733624 | Server publishes atan2(petal-owner). Native Missile points along local +x; Dandelion has stem `(0,0)->(-16,0)` and head radius 9. Do not reverse either drawing to compensate for a server angle. Projectile simulation agent owns the callback correction. |
| Iris flashes | Original server func654, WAT 149103–149648; `simulation-tick.mjs:3344–3365`; damage func43, `damage.mjs:414–454` | Poison still damages each tick. The low byte of damage options suppresses hit notification until 600 ms have passed since the previous poison notification. Client flash duration remains the original 150 ms. |

## Production wire handoff and integration

Native component ordinals come from the original client decoder1015 and
`legacy/source/game/client/snapshot-decoder.mjs:11–25`:

| Model | Entity pointer | Mask ordinal / bit | Sparse field |
| --- | --- | --- | --- |
| Launched Pea | +68 | 5 / `1<<4` | 9 = `petal_render_flags` (0/1/3) |
| Equipped/launched petal catalogue model | +76 | 7 / `1<<6` | 50 = petal type |
| Ground Web | +92 | 12 / `1<<11` | No model parameter field |
| Hornet triangle | +108 | 18 / `1<<17` | No model parameter field |

`petal_launched` distinguishes split Peas from their equipped parent on the
server. The production renderer now chooses the declared component and field 9;
slot 255 and collider radius do not select the artwork. Original760's priority
is +108, +68, +152, +76, +92; the domain uses +152 for identity metadata, so its
petal/projectile path selects the four art components independently of that metadata.

The compact domain writer has a fixed dense payload. New art declarations are
appended **after** that payload, with the appropriate mask and fields. Adding
group 68 or 76 to its earlier mask without extending the dense payload corrupts
decoding. Full-field mode's generic field 9/50 values are overridden by this final
model record. The archived-client publication branch carries the same native
components. Newly created ground Webs also carry the arrival marker.

## Reusable probes and verification

`client/tests/helpers/rendering-oracle.mjs` uses `test/helpers/wasm-probe.mjs` to
add selected exports in memory and execute original instructions. It retains
renderer objects across frames, accepts frame delta, position, transform,
opacity and hit flash, and captures actual Canvas/Path2D operations.
`RenderingCanvas` retains paths, transforms, paint ordering, colour, alpha,
stroke width, cap and join. This can be reused for later persistent-frame or
visual regressions without changing the frozen oracle.

The user-added production integration test (`real worker publishes special
petal launch, recharge and artwork components` in `worker-shim.test.mjs`) passed,
recorded in `/tmp/florr-special-worker.tap`: 1 integration test, 61.784 seconds
for its body. It drives the actual Worker and built WASM through launch,
authoritative u16 recharge start/completion, decoding and `drawWorld` for types
10,11,12,34,19,20,29,30. It verifies four children, component5 and field9=0/1/3,
one rendered disc per child, and component12/five Web rings for both Web variants.
Slot identity is not a launch test for aimed petals: they keep their original
slot, whereas split Peas have temporary child identities.

Current focused checks:

```sh
node node_modules/typescript/bin/tsc -p client/tsconfig.json
node --test client/tests/rendering-parity.test.mjs client/tests/petal-art.test.mjs
node --test client/tests/entity-art.test.mjs client/tests/camera-projection.test.mjs client/tests/drop-art.test.mjs client/tests/species-animation.test.mjs
node --test client/tests/render-camera.test.mjs
node tools/verify-reference.mjs
```

The native tests cover real joins/paths/transforms, all three Peas clusters,
random initialization and frame deltas, Hornet angles and flashes, single Peas
at five flash weights, all Web curves/spokes and arrival easing, and 240 moving
frames of Unique particles including retirement. The browser camera regression
passed after granting the local listener access required by Chromium tests.

The poison change is deliberately limited to feedback: `damage_entity` accepts
the original packed option word and suppresses notification when its low byte
is nonzero. Health, attribution and death still run. Each entity retains a
poison notification clock; poison ticks pass option1 until 600 ms have elapsed.
Applying a stronger/replacement poison does not reset this clock. Regular
damage remains independent of the poison clock.

`engine/tests/oracle/poison-flash-evidence.mjs` executes actual original43 with
options 0,1,255,256,257,65280, then actual original747/654 to apply and tick a real
poison payload. Every tick damages the target; notifications at 50,650,1250 ms
demonstrate the 600 ms gate. It compares the C++ regression executable's entire
option/notification trace with those observations. The native test additionally
checks 599.999 versus exactly 600 ms, replacement effects, ordinary damage, quiet
lethal damage, and retained attacker attribution.

```sh
cmake -S engine -B /private/tmp/florr-rendering-native -DCMAKE_BUILD_TYPE=Release
cmake --build /private/tmp/florr-rendering-native --target engine_poison_flash_tests engine_projectile_tests -j 4
/private/tmp/florr-rendering-native/engine_poison_flash_tests
node engine/tests/oracle/poison-flash-evidence.mjs /private/tmp/florr-rendering-native/engine_poison_flash_tests
/private/tmp/florr-rendering-native/engine_projectile_tests
node tools/parity/projectile-payload-trace.mjs /private/tmp/florr-rendering-native/engine_projectile_tests
```

These checks pass. The separate projectile agent's oracle covers 240 callback
frames, 800 release/recharge frames and 36 split children; its native original
mask probe reports `0x03184050` for all three split Peas, field9 0/1/3, and
`0x03184800` for ground Web. The projectile oracle remains owned by that agent.

Both rendering-worker WASM build attempts were correctly rejected by the build
tool because other agents changed C++ inputs during compilation. They retained
the previous WASM and are not production integration evidence. The passing
built-worker test above used the coordinator's stable art/wire build before the
poison change. A delivery build after the final source freeze must include the
poison change as well; its completion is not claimed here.

Final verification records inspected after the freeze:

- 16/16 focused rendering and petal-art tests passed.
- The browser camera regression passed (1/1).
- All 11 native CTest targets passed, including `engine_poison_flash_tests`:
  `/tmp/florr-fixes-ctest-final.log`, 17.94 seconds total.
- Original poison/native trace comparison passed:
  `/tmp/florr-poison-original-final.json` and the reproducible command above.
- The rendering worker's separate `engine_tests`, projectile regression and
  original projectile trace comparison passed.
- TypeScript `--noEmit`, `git diff --check`, and the 15-key-file frozen-reference
  check passed. `world.ts` has one final newline and no extra blank line at EOF.

Existing full-frame tooling is reusable: `canvas-command-diff.mjs`,
`run-client-scenario.mjs`, `run-client-engine-scenario.mjs`, `visual-check.mjs`
and `run-production-scenario.mjs` under `tools/parity`. Use separate output
directories; never re-record or update original goldens for these fixes.

## Limits and remaining checks

- Web path geometry and animation match the original, but the original strokes
  into a scale-dependent cached bitmap before compositing. The current direct
  path has not established pixel identity across zoom and device-pixel ratios.
- Native particle/phase tests match a seeded stream. Other species also consume
  the original global art RNG; complete scene ordering and entropy equivalence
  remain unproven.
- Native command comparisons establish the listed paths and frames. They do
  not establish complete game or full-frame pixel equivalence.
- The original poison payload used for the clock probe is installed by native747
  (Legendary Peas). Iris and all other damage effects share the exact same
  native654 gate; this proves the shared timing/option semantics, not every
  petal's poison intensity or duration.
