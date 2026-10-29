# Server tick order

Status: the domain tick is ordered after the recovered `spServerThink` phases,
but it is not a phase-by-phase port of the 42,641-line original body.

## Domain order

`engine/src/sim/tick.cpp` first advances `World::time_ms` by the step. Original
`spServerThink` reads the absolute server clock at the start of the tick, so the
clock used by AI/timers is the tick's target time; `advance_tick(0.0)` at the
end only bumps the tick counter and keeps the domain clock in phase. It then
runs:

Each step is bracketed by `World::record_phase(name)` so a test or diagnostic
can read `World::phase_trace()` and assert the exact order:

1. `regenerate-players` — respawn/death countdown bookkeeping;
2. `petal-behaviors` — temporary petal lifetime, Peas split cooldowns, Egg
   hatch timers;
3. `linked-constraints` — centipede/chain segment constraints;
4. `population` — only when `auto_populate` is enabled; runs before the AI
   phase and before the corpse sweep. Original `advanceTimedEntitiesAndAi`
   calls function 400 at ~1416 and steers AI later, so spawn-selection draws
   precede same-tick AI timer redraws and a corpse expiring this tick is
   replaced next tick;
5. `ai` — validate/acquire targets, spawn-protection timer, accelerate or
   wander, AI+32/+40/+100 random-angle timer;
6. `deferred-launches` — due Peas radial-impulse callbacks;
7. `effects` — advance each shared payload once, apply the strongest poison,
   refresh effect flags;
8. `area-effects` — expire/prune area payloads and rebuild target lists from
   the `owner ± scale` square query;
9. `petal-phase` — advance the equipped-petal ring phase (loadout +284);
10. `loadout-petals` — slot recharge, pending timers, missing instance respawn;
11. `petal-orbits` — input-driven radius, orbit acceleration, Rose heal;
12. `player-controls` — input-derived velocity impulse and angle, then
13. `movement` — `dt * acceleration`, `125 * (1 - 0.992^dt)` move,
    `0.992^dt` damping, arena clamp and bounds invalidation. Slow multipliers
    are applied by velocity-producing behaviors, not here;
14. `ant-hole-release` — original `654`'s 4848/4852 table walk, after movement
    and before contact damage: every hole whose current health ratio has
    crossed the next threshold releases one ant (and its 0.25-unit velocity
    scatter) at the hole position. A hit resolved by `contacts` in this tick is
    therefore released on the next tick;
15. `drops` — pickup radius, active-slot equip, backpack overflow;
16. `broadphase`;
17. `contacts` — layer gate, separation, bilateral contact damage, petal
    callbacks; candidates are visited in a **loose-quadtree** order (a body
    descends only when its AABB is fully contained by the child, capacity 4,
    max depth 9, node body list then NW/SW/NE/SE), which reproduces the
    original tick-1 ladybug leaf and cuts the first-tick delta from 0.5265 to
    0.1844;
18. `reap-dead` — death domain for health <= 0 outside the damage path, stale
    orbit cleanup;
19. `expire-drops` — drop and short-lived projectile lifetimes;
20. `corpse-sweep` — destroy health-0 mob/petal entities whose one-second
    corpse deadline has passed;
21. `hit-flush` — move hit messages whose target became known;
22. `advance_tick(0.0)` — increments the tick without moving the domain clock.

Original `updateEquippedPetals` both advances the ring phase and recharges /
respawns petals before `updatePetalOrbits`; a petal recharged this tick
therefore integrates in the same tick (the death trace's 8400 ms respawn is one
movement step ahead of a late spawn).

`World::bounds_rebuilds()` counts `collision_bounds` cache misses. The domain
still computes the rectangle lazily during the collision query, but the counter
makes the hit/miss pattern observable:
`test_collision_bounds_cache_rebuild_counter` asserts that a second query in the
same tick is a hit and that `invalidate_bounds` forces exactly one rebuild.
`apply_player_controls` and `integrate_movement` are separate phases, so the
input-derived acceleration/angle is committed before the movement integration.

`DeferredLaunch` entries carry a monotonic `sequence`; `run_deferred_launches`
collects all entries whose `due_ms` has passed and applies them in
`(due_ms, sequence)` order with `std::stable_sort`, so two callbacks scheduled
for the same millisecond keep their insertion order. The applied spin is the
recovered one: position radius × 1.4, velocity × 0.6, `kTau / count` step, and
the first child uses the stored phase.

`WorkerApi::think` records entities that disappeared during the tick into
`pending_deletes_`; `domain_snapshot_bytes` drains those, pending events and
coalesced hit events into the next packet.

After `tick` returns, `WorkerApi::think` consumes six server-RNG draws. Original
`spServerThink` appends six random bytes to the snapshot seed through six
original-`102` calls; they do not change simulation state, but they advance the
shared RNG and therefore every later spawn roll. The state trace confirms
exactly six draws on every ordinary tick, and the player-spawn tick adds the two
position draws on top.

## Evidence

`source/game/server/simulation-tick.mjs` names the original phases: world/lobby
status, countdown, timed entities and AI, active damage effects, area targets,
equipped petals and orbits, player controls, movement, collision bounds, spatial
rebuild, collisions, player coordinates, broadcast events and snapshot
generation. `reports/server-simulation-tick.md` records the 40-tick/50-tick
memory and output comparisons of the retained JS body.

## Open

- collision-bounds cache rebuild and quadtree rebuild ordering relative to the
  exact original phases (the domain invalidates during movement and rebuilds on
  query);
- player-control phase separation from movement;
- exact 1152-byte simulation frame and residual scratch bytes;
- the original scheduler's tie-break beyond `(due_ms, insertion sequence)`
  when callbacks are cancelled or rescheduled in the same tick (R05e covers the
  ordinary due/insertion case).
