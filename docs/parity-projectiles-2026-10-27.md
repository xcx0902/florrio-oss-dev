# Projectile and payload parity findings — 2026-10-27

Final integration verification: 2026-10-28. This records engine changes for
Peas, Missile, Dandelion, Pollen and Web. Client rendering belongs to the
rendering worker. The coordinator owns the built-worker/browser regression
and final delivery artifact; this document does not freeze that artifact.

## Original identity and method

| Immutable original artifact | SHA-256 |
| --- | --- |
| `legacy/web/sp_server.wasm` (`web/sp_server.wasm`) | `75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d` |
| `legacy/web/client.wasm` | `c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1` |
| `legacy/source/wasm/sp_server.wat` | `dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8` |

`node tools/verify-reference.mjs` passes: four frozen trees, 15 key files,
no issues. No original WASM, JS, WAT, golden trace or original test oracle was
edited. The coordinator separately reported that the online client WASM hash
matches the frozen client; this worker did not independently fetch it.

The retained probe is `tools/parity/projectile-payload-trace.mjs`. It uses
`test/helpers/wasm-probe.mjs` and `server-world.mjs` to execute the original
binary. Additional exports are added in memory without changing instructions
or files. Original144/397 create real owners and equipped petals. Callback
tests restore a complete memory/stack baseline between cases. Lifecycle tests
advance original654 using the captured startup/join input from
`tests/parity/golden/attack/server.json`. The original binary supplies every
expected numeric value; recovered JS supplies readable cross-references.

Read alongside WAT: `legacy/source/game/server/{petals,petals-special,damage,
simulation-tick,combat}.mjs`, `source/wasm/semantic-names.json`,
`source/semantic/server-behavior.mjs`, `schema/protocol.yaml`, and existing
`tools/parity` state/identity probes. REA tools were unavailable in this
session; these are repository/runtime observations, not REA Evidence IDs.

## Verified behavior and implementation

All release thresholds are strict **elapsed >500 ms**. The petal remains
equipped at exactly500 and releases at500.001; a50 ms simulation first
releases at550. Release detaches the equipped handle and starts its catalog
recharge. Recharge advances from the following tick, rather than immediately
respawning the released petal.

| Concern | Exact original evidence | Result |
| --- | --- | --- |
| Missile, type10 | Original671, WAT198737; `petals.mjs` aimedProjectileOrbit, dispatch539 | Radial facing is f32(atan2(dy,dx)), stored through the transform's f64 remainder setter. Add radial velocity1.4 and acceleration0.6 without Dandelion's f32 impulse conversions. Lifetime1500 ms; recharge3000 ms. |
| Dandelion, type20 | Original689, WAT205253; same recovered routine, dispatch545 | Same facing and1500 ms lifetime. Normalize to f32, then round velocity1.4 and acceleration0.6 products to f32 before adding to f64 motion. Recharge2000 ms. |
| Pollen, type19 | Original686, WAT204728; `petals.mjs:292`–335 | Attack or defend releases it; attack wins with both buttons. Add radial velocity+0.5 for attack or-0.5 for defend. Lifetime is f32(4500 + f32(f32(nextRng-1)*f32(1000/2^31))). Three instances; recharge1000 ms. |
| Web, types29/30 | Original733, WAT215762; `petals.mjs:337`–364 | Attack releases it. Normalize to f32, multiply by2.2 and round to f32. Lifetime650 ms; recharge3000 ms. Type30 has three instances. |
| Peas, types11/12/34 | Original676/681/431; WAT199625/202237/111494; `petals-special.mjs:214`–315 | Attack release splits into four children, rather than splitting on contact. Children have health/max5, lifetime1000 ms, owner attribution, a random-phase sqrt(72) radial offset, and a deferred launch scheduled at now+1 ms. Recharge1000 ms. |
| Peas deferred motion | Original272, WAT64467; `petals-special.mjs:186`–201 | Increment angle by f64(2π/count), then store f32. Original77/78 produce f32 trig values, promoted for multiplication by f64 1.4/0.6, rounded to f32, then added to f64 motion. |
| Ground Web trigger | Original732, WAT214447; `petals-special.mjs:483`–519; original43 death virtual call at `damage.mjs:473` | Only a launched Web's **death slot6** creates ground Web. Contact slot4 does not. Unlaunched death creates no ground entity. The position is the dying Web's position, rather than the collision target's position. |
| Ground Web payload | Original732 and constant virtual methods729/730, WAT214423/214426 | Radius50, health/max5, lifetime12000 ms, physics+50=1, tag+140, area+208 and owner+236. The shared payload vtable is6508; speed multiplier0.25, payload lifetimeInfinity. Leaving the area removes that shared payload. |
| Expiry/corpse | Original654 health lifetime countdown and original43; `damage.mjs:452` | Expiry damages current health and enters the normal death path. Bodies retain the ordinary1000 ms corpse lifetime; they are not immediately erased. |

The Peas probe exposed a native-libm one-ULP sine difference at seed123456789.
`engine/include/engine/sim/projectile_math.hpp` ports original77/78's relevant
positive-angle branches, kernels80/81 and the small-argument reducer284.
The helper is used only for Peas spawn/deferred launch angles in[0,4π].
It retains original hex constants and operation order, with FP contraction
disabled. It does not replace unrelated engine trigonometry. The same child
case now compares exactly, without a tolerance.

## Production model/component mapping

The retained probe calls original393 on real split children and a ground Web.
It asserts the actual four-byte component masks. Component ordinals are
one-based mask bits, not sparse field numbers or the domain identity group152.
`legacy/source/game/client/entity-snapshot.mjs:245` identifies field9's
constructor755 and byte+8; the recovered component table also associates
group68 with field9.

| Entity | Original393 mask | Archived client components / fields |
| --- | --- | --- |
| Equipped Peas parent | `0x03184040` | Petal component7 at entity+76; field50 remains type11/12/34. |
| Split Peas child | `0x03184050` | **Both** petal component7 and added render component5 at entity+68. Field9 is0/1/3 for types11/12/34 respectively; zero is explicitly published. Field50 retains the petal type. |
| Ground Web | `0x03184800` | Ground art component12 at client entity+92. No petal component7 or field50. Field7=50; fields53/55=5; fields49/28 are position; field57 is owner. |

The original server stores the Peas render byte in entity+116→component+8.
Field38 is the separate lifecycle/death byte; render variants must not be
placed there. Ground Web's archived art component is+92, not group152.

`engine/src/net/worker_api.cpp` now declares these components and publishes
the Peas variant/type fields in both production publication paths. Archived
ground Web uses its exact original mask and omits the unrelated effect field14.
Domain art declarations follow fixed dense payloads so adding component5/7
cannot change the byte plan of an earlier dense record. Ground Web's fresh
domain record also carries the arrival marker used by the rendering handoff.
The domain stream retains its existing identity/transport extensions; its
entire byte stream is not claimed identical to the archived transport.

## Shared integration corrections

At the coordinator's request, removed the obsolete anonymous `hatch_egg` and
its pre-AI trigger from `petal_effects.cpp`. Egg ownership/timing stays in the
passives worker's `update_petal_orbits`→`hatch_equipped_egg` path: strict
>1000/>2500 ms, after AI, replacing the slot handle with the living pet.
Original693/719 and `petals-special.mjs:317`–359 establish this behavior.
See `docs/parity-passives-pets-2026-10-27.md` and its retained original probe.

Also replaced the blanket mob/mob damage gate in `combat.cpp` with the
passives worker's `same_controlling_root(world,a,b)`. Original162/390 use root
equality, and recovered `combat.mjs:318` walks ownership. Wild mobs preserve
their common manager allegiance; a player-owned pet can damage a hostile
wild mob. Owner/sibling contacts remain protected. The coordinator explicitly
authorized this shared-file integration; zone-kill and death implementation
remain owned by the other workers.

Obsolete `test_main.cpp` assertions now trigger Peas on attack and Web on
launched death. The ground-area test guards its pointer before dereferencing.
The Egg regression advances real ticks through its strict boundary. Snapshot
readers consume the additional model/type records, check their masks/values,
and retain dense-length, lifecycle, recharge, record-count and EOF checks.
Pollen/Web30 setup uses the catalog's three-instance count.

## Verification and bounded claims

Commands run from the repository root:

```sh
cmake --build /private/tmp/florr-projectiles-build -j 6
ctest --test-dir /private/tmp/florr-projectiles-build --output-on-failure
node tools/parity/projectile-payload-trace.mjs /private/tmp/florr-projectiles-build/engine_projectile_tests
node --test test/server-petals.test.mjs test/server-petals-special.test.mjs test/server-effects.test.mjs
node tools/verify-reference.mjs
git diff --check
```

Results at handoff:

- Native CTest: **10/10 passed**, including shared engine tests, projectile,
  passives/pets, death, visibility, pickup, Rose and schema targets.
- Native/original probe: **240 callback frames, 800 lifecycle frames and36
  split children pass exact numeric equality**. Inputs cover all attack/defend
  combinations,500/500.001/550 ms, four radial offsets including zero, eight
  projectile types over100 actual50 ms ticks each, and three Peas seeds
  (1,123456789,2147483646). Original393 masks and Web death gating/constants
  are asserted in the same retained probe.
- Focused native regression includes actual serialized archived packets
  decoded by the independent existing test decoder. It checks Peas's two
  components, flags0/1/3, retained type, owner, ordinary corpse fields, and
  ground Web mask/radius/health/position/owner plus absent petal/effect fields.
- Full-tick combat regression uses a real Egg hatchling, runs production
  tick/contact/damage/event phases, and checks health100→89/93 plus two damage
  events for pet/wild contact. Owner, siblings and wild/wild pairs retain100.
  AI is disabled within that contact fixture to keep the bodies overlapping.
- Original JS comparison tests: **26/26 passed**. Frozen reference verification
  passes with no issues. The coordinator also reports the latest
  `build/parity-fixes` shared native/projectile/passives tests pass.

Limitations and unknowns:

- This is finite callback and release/recharge frame parity, not complete
  whole-world parity. Every world position, arbitrary RNG history, collision
  trajectory, allocator failure and partial child allocation is not covered
  by the new native/original probe.
- The positive Peas math helper is bounded to its production angle range;
  negative/non-finite/huge-angle libm equivalence is not claimed.
- Native full-tick combat verifies the integration of existing root rules.
  It is not a new exhaustive paired native/original combat replay.
- Pixel rendering, menu behavior, gallery visuals and the coordinator's real
  browser→worker→built-WASM→decoder→drawWorld regression belong to the client
  integration work. This document does not claim those browser checks passed.
- The modified delivery WASM/build metadata is not frozen by this worker.
  Original artifact identity and final delivery artifact identity are separate.

## Files owned by this change

Projectile implementations: `engine/src/sim/petal_effects.cpp`, the projectile
sections of `petals.cpp`, and `World::run_deferred_launches` in `effects.cpp`;
the adjacent launch/render fields in `engine/include/engine/model/entity.hpp`;
`engine/include/engine/sim/petal_effects.hpp`; new
`engine/include/engine/sim/projectile_math.hpp`.

Integration: bounded projectile declarations/publication in
`engine/src/net/worker_api.cpp`, the single contact-damage allegiance decision
in `combat.cpp`, legacy hatch removal, the projectile test target in
`engine/CMakeLists.txt`, and the related old-test/reader blocks in
`engine/tests/unit/test_main.cpp`.

Retained verification: `engine/tests/unit/test_projectiles.cpp`,
`tools/parity/projectile-payload-trace.mjs`, and this document. Other workers'
passives/AI/player/death/client changes in shared diffs are not claimed here.
