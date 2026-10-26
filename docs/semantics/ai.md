# AI, steering, target selection and cached bounds

Status: the recovered 92-byte behavior record, the Ladybug/Ant/Centipede/
Beetle/Spider/Bee/Hornet/Square initializers, target acquisition, guard-point
wander, lead prediction, wave/sine locomotion, the 0,2,1,3 quadtree visit order
and the memoized collision rectangle including attached children are
implemented and covered by native tests. AI+144 callback 74 (Hornet stinger) is
dispatched through `spawn_hornet_stinger`; behavior-modifier vtable values are
still unprobed but the domain multipliers are covered by tests.

## Evidence

- `source/game/server/combat.mjs` (168 target eligibility, 205/208/210 family
  profiles, 415 Beetle, 426 attacker aggro, 167 cached bounds);
- `source/game/server/components.mjs` (114 configureBehavior, 113 population
  band, 115 lazy behavior component);
- `source/game/server/entities.mjs` (Spider/Square/Bee/Hornet/AntHole/Cactus
  constructors);
- `source/game/server/simulation-tick.mjs` (654 tick, steering and snapshot
  write order);
- `source/decompiled/sp_server/functions-654.dcmp` and the 114/205/208/210/415
  pseudocode;
- `reports/server-spatial-ai.md`, `reports/server-combat.md`;
- `engine/src/sim/ai.cpp`, `engine/src/sim/spawn.cpp`, `engine/src/sim/bounds.cpp`.

## Behavior-record layout (AI+offset)

The original copies a 92-byte settings struct into AI+60 in function 114. The
domain `AiState` keeps the same values under names:

| Offset | Domain field | Meaning |
| --- | --- | --- |
| +8 | `enabled` | AI record is live |
| +9 | `aggressive` | acquire targets |
| +10 | `worker` | worker-ant caste byte |
| +12 | `drift_rate` | idle angle drift per second |
| +16 | `clock_valid` | cached-clock flag |
| +24 | `clock_ms` | cached server clock (double) |
| +32 | `timer_active` | random-angle timer armed |
| +40 | `timer_deadline_ms` | next timer deadline (double) |
| +48 | — | sign draw; shipped value is always 0, so idle turn is `-turn_rate` |
| +52 | `current_angle` | timer/drift angle |
| +56 | `attack_cooldown_ms` | attack cooldown |
| +60 | `turn_rate` | idle turn rate |
| +64 | `angle_locked` | face the computed direction directly |
| +68 | `drift_rate` | idle drift rate |
| +72 | `idle_speed` | idle/guard movement speed |
| +76 | `wave_amplitude` | wave envelope amplitude (observed 2.0 on Bee/Ladybug) |
| +80 | `wave_frequency` | wave frequency |
| +84 | `wave_power` | wave exponent (Bee 0.5) |
| +88 | `sine_enabled` | sine wobble |
| +92 | `sine_frequency` | sine frequency |
| +96 | `sine_amplitude` | sine amplitude |
| +100 | `timer_interval_ms` | random-angle timer interval |
| +104 | `territory` | arena threshold fraction |
| +108 | `aggressive` | duplicate aggressive gate |
| +109 | `can_alert` | accept attacker aggro |
| +110 | `chase` | lead-prediction movement |
| +112 | `lead_divisor` | lead divisor |
| +116 | `chase_speed` | chase speed |
| +120 | `radius` | acquisition radius |
| +124 | `range_multiplier` | acquisition range multiplier |
| +128 | `attack_range` | strafe/attack distance |
| +132 | `attack_speed` | speed inside attack range |
| +136 | `guard_radius` | guard-point radius |
| +140 | `leash` | owner leash |
| +144 | `attack_callback` | original indirect callback id |
| +148 | `attack_cooldown_gain` | cooldown gain |
| +152 | `target` | intrusive target handle |
| +164 | `owner` | owner handle |
| +176/+180 | `guard_point` | guard point |
| +184 | `guard_active` | moving to the guard point |

The domain also keeps `predecessor` for the original entity+212 links
component. Only a segment with a live predecessor AI adopts its target; a plain
owner (for example an Ant Hole) does not gate the child's AI update.

Probed anchors: AI+76 is the float wave amplitude (Bee/Hornet carry `2.0`),
AI+80 is `wave_frequency` (`0x3b3c3e58` = 0.0028723683 on Bee/Hornet), AI+84 is
`wave_power`, AI+92 is `sine_frequency`, AI+96 is `sine_amplitude`, AI+108 is
`aggressive`, AI+110 is `chase`, AI+120 is `radius` and AI+144/AI+148 are the
attack callback and cooldown gain. The domain's `wave_enabled` is a separate
domain flag (set by each `configure_*` profile), not a byte read from AI+76;
the amplitude table row is the one that matches the memory dump.

## Linked segments

Function 654 removes every entity with a live predecessor link from the
per-entity steering list and attaches its AI record to the predecessor before
the target/guard block. A segment therefore never runs its own target search,
guard steering, wave/sine update or velocity impulse; its position and facing
come from the 401 chain constraint. This applies whether or not the
predecessor's AI record is live. The domain implements this as an early
`continue` in `update_ai` and a `constrain_linked_entities` pass before
steering. Both are required: without the constraint the chain stretches, and
without the skip each segment steers independently and drifts away.

`constrain_linked_entities` clamps a segment to
`parentRadius + 0.0001 + ownRadius` of its predecessor, writes the facing angle
from the unclamped vector, and recurses through the attached-child list. On the
garden baseline this reduced the maximum first-tick segment position error from
0.48 to 0.004 units and made segment facing bit-identical for the sampled chain.

## Controlling root and target eligibility

Original target eligibility walks `entity+236` to a controlling root and rejects
pairs that share it. Every mob's `+236` points at the shared mob manager, so two
mobs always share the same root and can never target one another; only the
player is a distinct root. `same_root` therefore returns true for mob/mob
pairs. This fixed the Beetle/Spider/Ladybug target divergence (they previously
could acquire each other when the player was absent).

## Hornet stinger (AI+144 callback 74)

`source/decompiled/sp_server/functions-0640-0703.dcmp` `function_695` allocates an
entity, attaches the transform/visual/AI components and writes:

- initial velocity `1.4 * facing` and persistent acceleration `0.6 * facing`;
- spawn position `hornet.position - 20 * facing`, with recoil `-0.4 * facing`;
- radius `11`, health/maxHealth `10`, contact damage `10` and `2000 ms` lifetime.

The domain rebuild is `engine/src/sim/species_attacks.cpp`:

- the tick gate fires when `attack_callback != 0`, `attack_cooldown_ms <= 0`,
  and an eligible target remains retained. `attack_range=500` selects strafe
  versus chase, not whether to fire: a retained target at 800 still fires;
  one at 1000 is invalidated by the `600 * 1.5` retention radius;
- the callback runs **after** the steering walk so the AI handle vector is not
  mutated mid-iteration; spawning consumes no RNG;
- the stinger is a `kProjectile` of the firing species with its Hornet owner;
  it dies at 2000 ms (tick 40), remains a corpse through 2950 ms (tick 59),
  and is removed at 3000 ms (tick 60). Contact deals 10 once and kills the
  stinger, followed by the ordinary 1000 ms corpse-removal delay;
- unknown callback ids increment `species_debug::unknown_callbacks` and are not
  guessed into a species attack.

Evidence: native `test_hornet_stinger_callback` plus 14 controlled
original-WASM-vs-C++ cases in `tools/parity/hornet-stinger-trace.mjs` cover
four facings, retained targets at 500/800, invalidated/absent target, cooldown
1000/51/50, launch/recoil, lifetime and contact. Cooldown 50 expires this tick
and rearms to 2000; cooldown 51 leaves 1 and does not fire. Actor, projectile
and contact-player states are checked for finite values and exact type/kind.
`tests/parity/hornet/report.json` is the controlled result; the optional
`--long-run` report separately checks every one of 1000 production ticks with
the shared strict comparator and actual timed golden inputs. Its general
simulation drift must not be reported as successful long-run parity or as a
proven Hornet-specific failure.

## Hornet initializer draw order

`configure_hornet` consumes one `function_102(0, 1)` draw for the attack-speed
sign before `configureBehavior`, then the usual behavior draws. With
`angle_locked` the first orientation is kept but the second angle draw is still
consumed. The sign maps to `+0.4`/`-0.4` attack speed. Reproducing this draw
order made all 39 spawned hornets' AI angles and first-tick motion match the
original exactly.

## Family profiles

`spawn_entity_from_defaults` dispatches the recovered initializers:

| Type ids | Initializer | Key values |
| --- | --- | --- |
| 4, 5, 20, 21 | `configure_ladybug` | health 25/1000/25/25, radius 30/120/30/30, contact 15/50, speed 0.002 (massive 0.001), turn scale 1.0 (massive 0.2), range 600, radius 1000, territory 0.3 |
| 7, 8, 9, 10 | `configure_ant` | health 10/25/40/200, radius 14/20/20/40, contact 10/15/20/30, speed `(0.9 + random*0x1.9999ap-34)*0.002`, worker/soldier flags, soldier range 300/400 and turn scale 0.3, radius 1000, territory 0.3 |
| 12, 13 | `configure_beetle` | health 40/300, radius 40/80, contact 30/20, speed 0.002, range 600, turn scale 1.0/1.1, radius 1000, territory 0.3 |
| 15, 16, 17, 18 | `configure_centipede` | health 50, radius 35, contact 20, speed 0.006, range 1000 (evil 600), turn scale 0.2 (evil 0.16), radius 1000, territory 0.35; heads spawn a 9-segment chain (49 at the 1% rare roll) at 70-unit spacing with `angle += 2π/20` (`2π/100` rare) |
| 22 | `configure_spider` | health 20, radius 25, contact 25, speed 0.002, aggressive, chase, range 600, radius 600, territory 0.45, chase speed 2.88, lead divisor 3.4 |
| 6 | `configure_bee` | health 15, radius 25, contact 50, speed 0.002, range 600, radius 1000, territory 0.3, timer 5000..10000 ms, wave enabled, wave frequency `f32(0x3b3b3b3b)`, wave power 0.5, sine 0.002/0.5 |
| 14 | `configure_hornet` | health 40, radius 25, contact 50, speed 0.002, range 600, radius 600, territory 0.6, timer 5000..10000 ms, attack range 500, attack speed -0.4, callback 74, cooldown gain 2000 |
| 19 | `configure_square` | health 15, radius 30, contact 10, speed 0.002, turn rate 0.12321318, radius 1000, territory 0.3, angle-locked false, idle speed 0.2 |
| 11 | Ant Hole | stationary; six owned children in the caste order 7,7,7,8,8,9, each with a 0.25-unit velocity scatter from one RNG draw |

The generic `configure_mob_ai` profile (radius 600, speed 0.0025) is retained
for any future species without a recovered initializer. Queen Ant (10) and the
two segment records (16/18) are present in the 23-row entity table but absent
from the 19-row spawn-default probe; the family initializer supplies their
body values.

## Steering (original 654)

For every registered AI entity in spawn order:

1. A live predecessor copies its target into the segment.
2. The attack cooldown decreases by `dt`; a target outside the eligibility
   gates is dropped.
3. An aggressive entity without a target runs `find_target`; on success the
   cooldown is floored at `min(attack_cooldown_gain, 500)`.
4. The random-angle timer advances by its interval when `now >= deadline` and
   writes a new `current_angle` from one RNG draw.
5. With a target:
   - lead prediction (chase entities) iterates three times:
     `distance = |source - predicted| / lead_divisor`,
     `predicted = target + distance * (velocity + acceleration)`;
   - the entity faces the predicted aim angle;
   - inside `attack_range` it strafes at `aim + π/2` with `attack_speed`;
     otherwise it moves at the aim angle with `chase_speed`.
6. Without a target, an owned entity may select a guard point:
   - if the current guard point is outside `guard_radius` of the owner, or no
     guard point is active and the entity is outside `guard_radius`, draw two
     RNG values and place the point at
     `owner + 0.9 * guard_radius * (cos, sin)(angle)`;
   - the point is clamped to the arena minus the body radius;
   - within 50 units the entity uses `idle_speed`, otherwise `chase_speed`
     toward the point;
   - the idle turn is `-turn_rate` (AI+48 is always 0);
   - `wave_enabled` and no active guard point scales speed and turn by
     `pow(0.5 - 0.5*cos(t * wave_frequency), wave_power)`; a guard point
     suppresses the envelope;
   - `sine_enabled` adds `sin(t * sine_frequency) * sine_amplitude` to the
     movement angle;
   - `current_angle` integrates the steering value every tick:
     `current_angle = wrap(current_angle + move_angle * dt * 0.001)`; the
     facing angle is `current_angle` (plus the sine wobble), and `angle_locked`
     entities face that integrated angle instead of the raw steering value.
7. `velocity += (cos, sin)(move_angle) * move_speed * dt * 0.001 *
   behavior_speed_multiplier * slow_multiplier`.
8. With an eligible retained target and expired cooldown, the domain records
   the cooldown gain and dispatches Hornet callback 74 after the steering walk.
   Unknown callback ids are counted rather than guessed.

`ai.clock_ms` is the AI+24 clock; the current engine leaves it at zero, which is
equivalent to the spawn time for the initial population spawned at `t=0`.
Summoned children would need their own spawn-time stamp. The wave and sine
phases therefore advance with server time. The observed Bee record has
AI+76=2.0 (amplitude), AI+80=0.0028723683 (frequency), AI+84=0.5 (power),
AI+88=1 (sine enabled), AI+92=0.002 and AI+96=0.5. The domain applies
`wave_amplitude` to the envelope but keeps the Bee at 1.0: using the observed
2.0 overshoots the measured trajectory, so the exact AI+76 semantics remain
open.

## Target eligibility (original 168)

`target_eligible` keeps the recovered gates in this order:

1. the target is alive (`health > 0`);
2. the target is a player or mob (actor), not a petal/drop;
3. the target is inside the arena threshold:
   `target.x >= width * (owner ? -0.5 : territory - 0.5)`;
4. squared distance from the seeker is within
   `(radius * range_multiplier)²`;
5. when the seeker has an owner, the target is within `leash`;
6. the seeker and target do not share a controlling root (owner/parent chain).

## Alert and selection

- `alert_to_attacker(world, target, attacker)` is original 426: it resolves the
  attacker to a player root and an actor, assigns the damaged entity's AI target
  when it is empty and eligible, then walks the entity's damage callbacks
  (domain: attached AI children). It does **not** alert every mob in an 800-unit
  radius; `alert_nearby` remains the separate original-196 query.
- `find_target` is original 197 and queries `SpatialQuery::query_circle` rather
  than scanning every entity. It prefers players, then aggressive mobs, then the
  nearest squared distance, and skips controlled entities with a live fallback
  handle (`entity_flags & 64` + owner).
- `find_pickup_recipient` is original 198: the local player must be alive, have
  at least one open carried slot, and be within the strict squared distance
  `4900` (70 units).

## Quadtree traversal order

`QuadTree::query_at` visits child indices `0, 2, 1, 3` (NW, SW, NE, SE), which
matches the original walk's two recursive calls followed by the tail-jumped
quadrant. The index returns candidates; callers run the exact original
predicate, so the order affects iteration/effect-vector order rather than the
set of matches.

## Cached collision bounds (original 167)

`collision_bounds(world, handle)` memoizes the union of the body circle and all
attached children. `Entity::children` is the domain intrusive child list;
`attach_child`/`detach_child` maintain it. `invalidate_bounds` marks the entity
and its owner chain dirty after movement or radius changes, so the cache is
rebuilt once per tick rather than per query. Centipede chains, Ant Hole
children and equipped petals all use the same mechanism.

Idle steering rounds the unwrapped angle sum to f32 **before** applying the
remainder/wrap. The speed impulse rounds speed×milliseconds to f32, promotes
that result, multiplies by the original f64 literal `0.001`, then demotes.
Using a float literal `0.001F` adds an ULP to the Centipede impulse. The original
first head step is exactly -0.32139188051223755; this fixes the former strict
tick260 divergence without changing state tolerances.

The subsequent tick303 contact-order divergence was missing original163
quadtree compaction. After relocation, compaction visits children recursively
and merges four leaf children when their combined item count plus the parent
is at most four. Merge order is 0,1,2,3; query order remains 0,2,1,3. The domain
tree now preserves both orders and reuses released nodes. Original390
call-site diagnostics match through tick305. Fixed artifact
`8649241c5fb4e9ab77b27bd8a7353accccdb7dc900a01deef188b39ab425e176`
passes the unmodified-original strict garden and boot 1000-tick runs, plus all
14 controlled Hornet fixtures. Attack and moving-player long runs still expose
later drop/contact-damage differences; these passes do not establish complete
simulation equivalence. See `tests/parity/hornet/tree-report.json` and
`tests/parity/engine-tree-soak/`.

## Open

- species attack callbacks other than verified Hornet callback 74, and
  behavior-modifier vtables beyond the recorded domain multipliers;
- exact animation/locomotion blend for every species (the wave/sine/drift
  phases are reconstructed, but the original per-species vtable parameters are
  not all probed);
- full quadtree node capacity/split parity with the original allocator (the
  visit order and predicates are covered, the node shape is not).
