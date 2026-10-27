# Engine passives and pets parity — 2026-10-27

## Ownership and integration

This worker owns `engine/src/sim/passives.cpp`, `pets.cpp`, their new headers,
`engine/src/sim/ai.cpp`, passive/orbit/Egg sections of `petals.cpp`, the passive
health sections of `player.cpp`, a standalone native test, and the original
probe below. CMake and the explicit WASM source list include the two new units.
The second review added scoped ownership of the World-aware discard overload
and recharge cache in `player_loadout.{hpp,cpp}`, plus only the opcode8 call
site in `worker_api.cpp`; the death worker retains its other API blocks.
Other workers own projectiles/combat effects, death lifecycle, client/rendering,
and zone presentation. The zone timer calculation is unchanged. Following
Halley's review, the zone-disabled equipped-handle damage sweep was corrected
to include pets. No frozen original file was edited.

Shared-file handoffs completed through the coordinator:

- Projectile owner (Tesla): removed the old anonymous `hatch_egg` and its
  timed-behavior trigger from `petal_effects.cpp`. Egg now hatches in `update_petal_orbits`,
  delegating to `hatch_equipped_egg` from `engine/sim/pets.hpp`. Original hatching
  runs after AI, during the petal orbit callback; running it before AI would
  also steer the new pet prematurely.
- Combat owner (Tesla): uses `same_controlling_root(world, a.handle, b.handle)` from
  `engine/sim/ai.hpp` for allegiance instead of suppressing every mob/mob
  contact. The helper preserves the common manager allegiance of wild mobs,
  and resolves a player's pet to its player. Shared changes belong to their
  respective owners; this worker did not edit either shared effects/combat file.
- Lifecycle owner: passive-only changes to `player.cpp` preserve the new
  respawn implementation. Level-up health includes the Cactus contribution.
  No new test was added to the shared `test_main.cpp` registrar.

The coordinator relayed Halley's independent P2 finding: the former zone damage
loop visited orbit records, while a hatched pet occupies only an equipped
handle. The replacement sweep visits all 8×3 equipped handles, calls the existing
death path, releases dead pet slots, and advances recharge without spawning.
The original capped-zone probe below and a full-tick native regression verify
this fix. This is not an independent review of the entire shared integration.

Halley's second review found two more bounded issues, now fixed: opcode8 lost
the pet handle before damaging its occupant, and disabled slots retained a
ready field61 cache. Discard now validates the slot, expected type and catalog
entry before `clear_handles`, then reuses the existing profile discard helper
for XP/backpack behavior. The disabled sweep refreshes the cache to zero and
ordinary refresh restores actual progress after re-enabling. Both new native
regressions failed before these fixes and pass afterward. Sources are frozen
after these changes.

## Immutable original identity

`node tools/verify-reference.mjs` passed before implementation: all four
frozen trees, all 15 key files, no issues, build baseline 3850 recovered / 1129
remaining. This checks the original JS as well as WASM and WAT.

| Artifact | SHA-256 |
| --- | --- |
| `web/sp_server.wasm` | `75e51b2c50c9f6ca6f3b5232a0a89b396f8b0c14c0268dceece87641aacbe46d` |
| `web/client.wasm` | `c1e574288f05e4387c888e375952f0b61a1a5f185cef25ad74d0c1088759a4b1` |
| `web/sp_server.js` | `8707e432f0fabae308f8006c934e3370f50f19085552edffe8fd7f9587200989` |
| `web/client.js` | `77619b3c63477b29f509c0e79ef7c8768aa6f4b32e1a652a6821f20369e0de69` |
| `source/wasm/sp_server.wat` | `dc74b9ef1c8b3f87e95ec37f9b604f5f23ebff9c947e811ea340cd1e392719d8` |

No online-original execution or network identity check is claimed by this
worker. The coordinator separately reported an online client-WASM SHA match.

## Original functions and exact probes

The complete retained output is `docs/parity-passives-pets-2026-10-27.json`.
The reproducible probe is
`node engine/tests/oracle/passives-pets-evidence.mjs`. It uses
`test/helpers/server-world.mjs` and `wasm-probe.mjs` to instantiate the frozen
`web/sp_server.wasm`. Only the in-memory export section gains exports; original
instructions and files are unchanged. It uses the captured startup/join packets
from `tests/parity/golden/attack/server.json`, deterministic clock/entropy,
and actual functions 125/397 to configure and spawn petals. It calls original
145 for maximum health, advances original 654, and calls original 168 for
eligibility. Original390 with the original162-derived root equality flag
confirms pet health40→30 after a wild mob's contact damage10. Death is through
original43. There are assertions, rather than
only a printed trace. No recovered-JS function replaces an original function
in this probe.

The semantics documents read were `docs/semantics/{README,petals,player,ai,
effects,catalog}.md`. Original WAT and the recovered JS/decompiler views were
read together; recovered names are explanatory labels, not recovered C++ names.

| Concern | Original evidence |
| --- | --- |
| Faster | function 654; `legacy/source/game/server/simulation-tick.mjs:3995`–4210 counts ready type-14 slots and writes loadout+284 as f32((2.5 + 0.8*count) * direction * modifier * dt * 0.001 + phase). Instance-zero pending byte at +584 gates the count. |
| Heaviest | function 725 (`source/decompiled/sp_server/functions-0704-0733.dcmp:311`) returns 65 rest/defend and 100 attack; function 726 at line 326 writes mass 4 to physics+40. The common orbit spring is function 654, recovered lines 4775–4860. |
| Cactus | function 145, `source/wasm/sp_server.wat:30293`–30832: level maximum plus 20 per type-13 slot, 40 per type-33 slot, 20 per type-21 slot. Each checks pending instance zero; type 33 counts once despite three instances. Health rescale rounds multiply then divide in f32. |
| Leaf | function 654 recovered lines 4560–4632: base heal dt*maximum/240000 plus dt*ready-type32-count*0.001, with one f32 conversion before original 216. Function 216 (`legacy/source/game/server/entities.mjs:433`) applies live-health and behavior healing-veto gates. |
| Egg | functions 693/719, `legacy/source/game/server/petals-special.mjs:317`–359; the original WAT location for 693 is 206209. Creation-time delta must be strictly greater than 1000/2500 ms; spawned types are 9/12. They replace the existing slot handle with the pet before consuming Egg health. |
| Pet allegiance | functions 168 and 162 walk +236 owner first, then +224 fallback when flag64 is present. See original function168 at `source/decompiled/sp_server/functions-0128-0191.dcmp:2260` and recovered `combat.mjs:318`. Type alone does not define allegiance. |
| Pet guard motion | function 654, recovered simulation-tick lines 1666–1849: 300 guard / 1000 leash from Egg override, random angle f32(f32(rng-1)*2π/2³¹), and clear AI+184 when squared distance to the guard point is strictly less than 2500. |
| Zone-disabled pets | function 654, recovered simulation-tick lines 4242–4330: iterate all 8×3 equipped handles, damage a living equipped body when disabled, unlink its slot, and advance elapsed recharge even while spawning is blocked. This sweep includes the mob handle replacing an Egg. |
| Discarded pets | Original opcode8 (`legacy/source/game/server/input.mjs:667`–694) validates the expected slot type, rewards XP/appends backpack, then calls125 with type0. Original125 (`loadout.mjs:27`–70) damages each occupant through43 before unlinking/resetting its handle. |
| Disabled recharge cache | Original654, recovered simulation-tick lines4320–4326, advances elapsed recharge then writes zero to the blocked slot's loadout+100 cache. Enabled slots subsequently publish computed progress or65535 when ready. |

Probe results with health initially 50/100, level 1, 50 ms step, phase initially
zero (Cactus rows include original145's rescale before the step):

| Equipped types | Maximum | Health after step | Shared phase after step |
| --- | ---: | ---: | ---: |
| Basic 1 | 100 | 50.02083206176758 | 0.125 |
| Fast 2 | 100 | 50.02083206176758 | 0.125 |
| Faster 14 | 100 | 50.02083206176758 | 0.16500000655651093 |
| Faster 14,14 | 100 | 50.02083206176758 | 0.20499999821186066 |
| Heaviest 26 | 100 | 50.02083206176758 | 0.125 |
| Heaviest 26,26 | 100 | 50.02083206176758 | 0.125 |
| Faster + Heaviest 14,26 | 100 | 50.02083206176758 | 0.16500000655651093 |
| Leaf 32 | 100 | 50.07083511352539 | 0.125 |
| Leaf 32,32 | 100 | 50.12083435058594 | 0.125 |
| Cactus 13 or 21 | 120 | 60.025001525878906 | 0.125 |
| Cactus 33 | 140 | 70.02916717529297 | 0.125 |
| Cactus 13,21,33 | 180 | 90.0374984741211 | 0.125 |

Setting pending byte +584 to one for each of types 14,32,13,21,33 gives
maximum100, health50.02083206176758, phase0.125. The probe asserts these values.

For each Egg variant the probe observes the Egg handle at the exact deadline,
a different mob handle at deadline+1, owner set to the player, acquisition
radius1000, guard300, leash1000. Original168 returns pet→wild=1,
pet→owner=0, pet→sibling=0, wild→wild=0 in that fixture. The original guard
arrival byte becomes zero. The live pet remains in its slot through an
additional 1150 ms with recharge elapsed0. Original43 reduces its health to
zero; the following slot sweep clears the handle and records elapsed50 ms.
Original +608 is an f32 elapsed timer; the domain exposes a decreasing catalog
remaining time (950 ms after that same 50 ms tick).

An additional frozen-WASM probe hatches each Egg, sets level60 while the player
is at x=-24856.76953125, and seeds the existing zone timer at its 45000 ms cap.
For both types22/23, the next 50 ms tick changes pet health40→0, clears the slot,
and writes elapsed recharge50. Nineteen further 50 ms ticks leave the slot empty
and advance elapsed recharge to1000. This verifies the equipped-pet damage and
blocked-spawn paths; seeding a capped timer does not independently verify its
45-second buildup or the HUD threshold.

The retained second-review probe also reads the actual loadout+100 cache:
65535 while the pet is alive, zero immediately after zone disable and after
recharge completes while blocked. Moving the original player to x=24000 then
advancing restores65535 for a completed recharge; restoring the first disabled
snapshot and moving to the same safe coordinate yields elapsed100/cache6553
with the slot still empty. These are backing-cache checks, not a complete
serialized-packet replay.

For discard, the probe sends actual original655 packets with command bytes
`[0,8,0,expectedType]`, XOR-encoded with the original table at4576. For each Egg
variant a mismatched expected type preserves the living pet. The matching
packet changes its health40→0, clears slot/type, and appends exactly one item
of the Egg's type to the backpack. Calling original43 on the owner afterward
leaves both owner/pet health0. The native packet regression additionally runs
ordinary ticks through corpse removal and confirms no living owned mob escapes.

## Changes supported by evidence

- Faster already used the original speed formula. Retain it and add focused
  regression coverage, including pending and YinYang direction.
- **No global Heaviest angular slowdown was implemented.** Original probes
  contradict that hypothesis. Its attack radius100 (versus Basic130) gives a
  smaller tangential path at the same angular speed. Missing original mass4
  is restored; the existing radius profile is retained.
- Add Cactus maximum-health bonuses and Leaf healing with original pending,
  active-slot and zone-disabled gates. Preserve health ratio when maximum
  changes, retain bonuses through level rewards, cap healing, and respect
  healing suppression/dead-player gates.
- Replace the blanket mob/mob AI allegiance shortcut with root resolution.
  Keep wild mobs friendly to one another and player's pets friendly to the
  owner/siblings. Original197's fallback check cannot be replaced with an
  ordinary-owner check; that incorrectly excluded owned pets from candidates.
- Correct guard random-angle scaling and clear the arrived guard flag, so an
  idle pet returns to its species' ordinary wandering instead of continually
  steering around the same destination.
- Transfer the Egg slot handle to the pet. Keep that handle while the pet is
  alive and start catalog recharge only when the slot sweep finds it dead.
  Hatch in the original orbit phase and retain the strict delay.
- Zone disable visits equipped handles, so it kills a living pet even after its
  Egg orbit record has been removed. Reuse ordinary death/corpse handling and
  allow recharge to advance while preventing another Egg from spawning.
- Opcode8 retires the pet before resetting the slot; expected-type validation
  occurs before damage. Existing discard XP/backpack logic remains shared.
- Publish zero cached field61 progress for blocked slots even as their recharge
  advances; restore computed progress or ready65535 when spawning is enabled.

## Final validation

Checked against the integrated working tree on local 2026-10-28 (the evidence
filename preserves the requested 2026-10-27 task date):

| Command / check | Result and exact coverage |
| --- | --- |
| `node tools/verify-reference.mjs` | PASS after integration: four frozen trees, 15 key files, zero issues. |
| `node engine/tests/oracle/passives-pets-evidence.mjs` | PASS; retained JSON includes passive/pending assertions, both strict hatch boundaries, eligibility, original390 contact damage, guard arrival, live-pet slot retention, original43 death/recharge, capped-zone pet death/recharge/cache/re-enable and actual opcode8 discard followed by owner death. |
| `cmake --build /tmp/florr-passives-pets-build -j 4` | PASS; all native targets compile, engine core uses warnings as errors. |
| `node tools/build-engine-wasm.mjs --output /tmp/florr-passives-pets-second-review.wasm` | PASS after second-review fixes; explicit production source list links both new units. 273641 bytes, WASM SHA-256 `322eafbeae533bd8989f408a906e0da7c600c09724f804397fc5db382e75c246`, build input SHA-256 `f32156d16dfa41bfc463dbd26a7aec4a8b4d2ef7da6da0fbe571abd19bf94760`. Output is under `/tmp`; this worker did not replace client artifacts. |
| `/tmp/florr-passives-pets-build/engine_passives_pets_tests` | PASS, all eight groups. Includes both variants through actual engine ticks, pet/wild mutual damage and AI acquisition, harmless owner/sibling/wild pairs, ordinary pet death retaining its handle until the next sweep, zone-disabled pet death, blocked spawning/cache0, partial and completed re-enable cache values, and actual opcode8 rejection/discard followed by owner death and corpse removal. |
| `ctest --test-dir /tmp/florr-passives-pets-build --output-on-failure` | Latest second-review run: 9/11 PASS. `engine_tests` aborts with `std::out_of_range: map::at: key not found`; `engine_peer_visibility_tests` fails case16 (death retention/restart: restart creates a new controlled handle). The standalone passives/pets, projectile, death, poison-flash, Rose, simulation, pickup and both schema suites pass. This is not a passing whole-suite result; the other shared integration checks remain with their owners. |
| `node --test test/server-petals-special.test.mjs` | PASS, 8/8 original/recovered special-petal tests. |
| Scoped `git diff --check` | PASS for owned source/build/test/document paths. |
| `update_zone_restriction` comparison against `HEAD` | PASS, function body byte-for-byte unchanged; only the separate disabled damage sweep changed. |

The fifth full-tick Egg group now passes: the obsolete pre-AI trigger has been
removed. There is no remaining hatch/combat integration dependency in these
focused tests.

## Verified boundaries and skipped coverage

| Concern | Verified | Skipped / limitation |
| --- | --- | --- |
| Faster | Existing native formula matches the frozen phase samples; pending gates and YinYang combinations have native regression coverage. | No forced formula change; arbitrary original behavior-vtable rotation modifiers are not reconstructed. |
| Heaviest | Original phase samples show no global angular slowdown; original725 radius100/65 and original726 mass4 support the retained radius and restored mass. | No invented global slowdown or claim that all petal trajectories were replayed. |
| Leaf / Cactus | Exact f32 level1 health samples, stacking and pending gates; native heal veto, cap, dead state, level rewards and slot-unlock cases. | No exhaustive original runtime sweep of all levels, loadout combinations or arbitrary vtable modifiers. |
| Egg ownership / recharge | Both variants, strict hatch delay, ready living-pet slot, ordinary death, next slot sweep, recharge and no duplicate pets through real ticks; actual opcode8 validates before damage, clears the pet and preserves backpack behavior, followed by owner death/reaping. | Original allocator/intrusive-node identity and exhaustive inventory/respawn/owner-removal permutations are not reproduced here. |
| Pet combat / motion | Root allegiance, nearest wild acquisition, mutual contact damage, guard arrival reset and full-circle guard RNG. | No long-run visual oscillation or path-convergence assertion. Original wild→pet eligibility is 0 in the retained fixture because other eligibility gates apply; symmetric acquisition is not claimed. |
| Zone disable | Capped-zone original probes and full-tick native pet death/recharge/blocked spawning; original/native cache0 while blocked,6553 on partial re-enable and65535 when ready; native safe-zone return checks timer decay remains0.1. | No new HUD, coordinate threshold, zone timer formula, full serialized field61 packet replay or exhaustive zone parity claim. |
| Rendering / broader parity | Frozen file identity and scoped engine gameplay-state evidence only. | No browser gameplay/render capture, online-original execution, complete world/packet/render parity, or independent review of every concurrent change. |

There is no claim of exhaustive world/packet/render parity. These are bounded,
source-grounded function and gameplay-state tests. The domain has a single
player profile and represents the original wild manager without allocating
its native entity. No client, rendering, projectile launch or effect behavior
is inferred from these passives/pet tests. The frozen probe has a clamped
simulation delta: its disabled recharge sample uses nineteen actual 50 ms
ticks rather than treating a single 950 ms clock jump as equivalent.
