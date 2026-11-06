# AI, steering, target selection and cached bounds

Status: the behavior record, the Ladybug/Ant/Centipede/Beetle/Spider/
Bee/Hornet/Square initializers, target acquisition, guard-point wander, lead
prediction, wave/sine locomotion, the 0,2,1,3 quadtree visit order and the
memoized collision rectangle including attached children are implemented and
covered by native tests. The Hornet stinger callback is dispatched through
`spawn_hornet_stinger`; behavior-modifier values remain open, but the domain
multipliers are covered by tests.

## Behavior settings

The domain `AiState` keeps the settings under named fields:

| Domain field           | Unit     | Meaning                                                         |
| ---------------------- | -------- | --------------------------------------------------------------- |
| `enabled`              | flag     | AI record is live                                               |
| `aggressive`           | flag     | acquire targets                                                 |
| `worker`               | flag     | worker-ant caste                                                |
| `drift_rate`           | rad/s    | idle facing drift when `angle_locked` is off                    |
| `clock_ms`             | ms       | AI clock, stamped at spawn                                      |
| `timer_active`         | flag     | random-angle timer armed                                        |
| `timer_deadline_ms`    | ms       | next timer deadline                                             |
| `current_angle`        | radians  | timer/drift angle                                               |
| `attack_cooldown_ms`   | ms       | remaining attack cooldown                                       |
| `turn_rate`            | radians  | idle facing angle when the steering direction is not recomputed |
| `angle_locked`         | flag     | face the computed direction directly                            |
| `idle_speed`           | px/s     | idle/guard movement speed                                       |
| `wave_enabled`         | flag     | modulate idle speed and turn as a wave                          |
| `wave_amplitude`       | factor   | wave envelope amplitude                                         |
| `wave_frequency`       | rad/ms   | wave phase rate                                                 |
| `wave_power`           | exponent | wave curvature                                                  |
| `sine_enabled`         | flag     | add the idle sine wobble                                        |
| `sine_frequency`       | rad/ms   | sine phase rate                                                 |
| `sine_amplitude`       | radians  | sine wobble amplitude                                           |
| `timer_interval_ms`    | ms       | random-angle timer interval                                     |
| `territory`            | fraction | arena threshold fraction                                        |
| `can_alert`            | flag     | accept attacker aggro                                           |
| `chase`                | flag     | lead-prediction movement                                        |
| `lead_divisor`         | factor   | lead divisor                                                    |
| `chase_speed`          | px/s     | chase speed                                                     |
| `radius`               | px       | acquisition radius                                              |
| `range_multiplier`     | factor   | acquisition range multiplier                                    |
| `attack_range`         | px       | strafe/attack distance                                          |
| `attack_speed`         | px/s     | speed inside attack range                                       |
| `guard_radius`         | px       | guard-point radius                                              |
| `leash`                | px       | owner leash                                                     |
| `attack`               | enum     | `AttackBehavior` (`None`, `HornetStinger`)                      |
| `attack_cooldown_gain` | ms       | cooldown added per attack                                       |
| `target`               | handle   | intrusive target handle                                         |
| `owner`                | handle   | owner handle                                                    |
| `guard_point`          | px       | guard point (x, y)                                              |
| `guard_active`         | flag     | moving to the guard point                                       |
| `behavior_choice`      | bit      | configure-time draw selecting the turn sign                     |
| `modifiers`            | factor   | `speed`/`turn`/`attack` behavior multipliers                    |

The domain also keeps `predecessor` as the linked-segment predecessor handle.
Only a segment with a live predecessor AI adopts its target; a plain owner (for
example an Ant Hole) does not gate the child's AI update.

`wave_enabled` is a separate domain flag set by each `configure_*` profile; it is
independent of `wave_amplitude`. The family table below lists the profile
values.

## Linked segments

Entities with a live predecessor link are removed from the per-entity steering
list and their AI record is attached to the predecessor before the target/guard
block. A segment therefore never runs its own target search, guard steering,
wave/sine update or velocity impulse; its position and facing come from the
`constrain_linked_entities` chain constraint. This applies whether or not the
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

Target eligibility resolves each entity to a controlling root through its
owner/parent links and rejects pairs that share it. The domain has no manager
entity, so every uncontrolled mob root counts as one shared controller: two
wild mobs always share the same root and can never target one another; only the
player is a distinct root. `same_controlling_root` therefore returns true for
mob/mob pairs. This fixed the Beetle/Spider/Ladybug target divergence (they
previously could acquire each other when the player was absent).

## Hornet stinger (`AttackBehavior::kHornetStinger`)

The population path allocates an
entity, fills the body record and its AI state, and writes:

- initial velocity `1.4 * facing` and persistent acceleration `0.6 * facing`;
- spawn position `hornet.position - 20 * facing`, with recoil `-0.4 * facing`;
- radius `11`, health/maxHealth `10`, contact damage `10` and `2000 ms` lifetime.

The domain rebuild is `engine/src/sim/species_attacks.cpp`:

- the tick gate fires when `attack != AttackBehavior::kNone`, `attack_cooldown_ms <= 0`,
  and an eligible target remains retained. `attack_range=500` selects strafe
  versus chase, not whether to fire: a retained target at 800 still fires;
  one at 1000 is invalidated by the `600 * 1.5` retention radius;
- the callback runs **after** the steering walk so the AI handle vector is not
  mutated mid-iteration; spawning consumes no RNG;
- the stinger is a `kProjectile` of the firing species with its Hornet owner;
  it dies at 2000 ms (tick 40), remains a corpse through 2950 ms (tick 59),
  and is removed at 3000 ms (tick 60). Contact deals 10 once and kills the
  stinger, followed by the ordinary 1000 ms corpse-removal delay;
- no numeric callback remains: `dispatch_attack` switches on the named
  `AttackBehavior`, so an unknown value cannot silently select a species
  attack.

## Hornet initializer draw order

`configure_hornet` consumes one RNG draw for the attack-speed
sign before `configure_behavior_draws`, then the usual behavior draws. With
`same_angle` set, the first orientation is kept and no second angle draw is
consumed. The sign maps to `+0.4`/`-0.4` attack speed. The draw order is
pinned by native fixtures for spawned Hornets' AI angles and first-tick
motion.

## Family profiles

`spawn_entity_from_defaults` dispatches the family initializers:

| Type ids       | Initializer           | Key values                                                                                                                                                                                                                                     |
| -------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4, 5, 20, 21   | `configure_ladybug`   | health 25/1000/25/25, radius 30/120/30/30, contact 15/50, speed 0.002 (massive 0.001), turn scale 1.0 (massive 0.2), range 600, radius 1000, territory 0.3                                                                                     |
| 7, 8, 9, 10    | `configure_ant`       | health 10/25/40/200, radius 14/20/20/40, contact 10/15/20/30, speed `(0.9 + random * 9.313225746154786e-11) * 0.002`, worker/soldier flags, soldier range 300/400 and turn scale 0.3, radius 1000, territory 0.3                               |
| 12, 13         | `configure_beetle`    | health 40/300, radius 40/80, contact 30/20, speed 0.002, range 600, turn scale 1.0/1.1, radius 1000, territory 0.3                                                                                                                             |
| 15, 16, 17, 18 | `configure_centipede` | health 50, radius 35, contact 20, speed 0.006, range 1000 (evil 600), turn scale 0.2 (evil 0.16), radius 1000, territory 0.35; heads spawn a 9-segment chain (49 at the 1% rare roll) at 70-unit spacing with `angle += 2π/20` (`2π/100` rare) |
| 22             | `configure_spider`    | health 20, radius 25, contact 25, speed 0.002, aggressive, chase, range 600, radius 600, territory 0.45, chase speed 2.88, lead divisor 3.4                                                                                                    |
| 6              | `configure_bee`       | health 15, radius 25, contact 50, speed 0.002, range 600, radius 1000, territory 0.3, timer 5000..10000 ms, wave enabled, wave frequency 0.0028723683, wave power 0.5, sine 0.002/0.5                                                          |
| 14             | `configure_hornet`    | health 40, radius 25, contact 50, speed 0.002, range 600, radius 600, territory 0.6, timer 5000..10000 ms, attack range 500, attack speed -0.4, HornetStinger behavior, cooldown gain 2000                                                     |
| 19             | `configure_square`    | health 15, radius 30, contact 10, speed 0.002, turn rate 0.12321318, radius 1000, territory 0.3, angle-locked false, idle speed 0.2                                                                                                            |
| 11             | Ant Hole              | stationary; six owned children in the caste order 7,7,7,8,8,9, each with a 0.25-unit velocity scatter from one RNG draw                                                                                                                        |

The generic `configure_mob_ai` profile (radius 600, speed 0.0025) is retained
for any future species without a dedicated initializer. Queen Ant (10) and the
two segment records (16/18) are present in the 23-row entity table but absent
from the 19-row spawn-default table; the family initializer supplies their
body values.

## Steering

For every registered AI entity in spawn order:

1. A live predecessor copies its target into the segment.
2. The attack cooldown decreases by `dt`; a target outside the eligibility
   gates is dropped.
3. An aggressive entity without a target runs `find_target`; on success the
   cooldown is floored at `min(attack_cooldown_gain, 500)`.
4. The random-angle timer advances by its interval while `now >= deadline`,
   drawing a new `current_angle` for each elapsed interval.
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
   - the idle turn is `+turn_rate` when the configure-time behavior draw is
     non-zero and `-turn_rate` otherwise;
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
   the cooldown gain and dispatches `AttackBehavior::kHornetStinger` after the
   steering walk.

`ai.clock_ms` is the AI clock in milliseconds and is stamped with the entity's
spawn time, so wave and sine phases advance with server time from spawn. The
domain applies `wave_amplitude` to the envelope but keeps Bee and Hornet at
1.0: the observed 2.0 overshoots the measured trajectory, so whether the source
amplitude should be applied remains open.

## Target eligibility

`target_eligible` keeps these gates in order:

1. the target is alive (`health > 0`);
2. the target is a player or mob (actor), not a petal/drop;
3. the target is inside the arena threshold:
   `target.x >= width * (owner ? -0.5 : territory - 0.5)`;
4. squared distance from the seeker is within
   `(radius * range_multiplier)²`;
5. when the seeker has an owner, the target is within `leash`;
6. the seeker and target do not share a controlling root (owner/parent chain).

## Alert and selection

- `alert_to_attacker(world, target, attacker)` resolves the
  attacker to a player root and an actor, assigns the damaged entity's AI target
  when it is empty and eligible, then walks the entity's damage callbacks
  (domain: attached AI children). It does **not** alert every mob in an 800-unit
  radius; `alert_nearby` remains the separate nearby query.
- `find_target` queries `SpatialQuery::query_circle` rather
  than scanning every entity. It prefers players, then aggressive mobs, then the
  nearest squared distance, and skips controlled entities with a live fallback
  handle (`entity_flags & 64` + owner).
- `find_pickup_recipient` requires the local player to be alive, have
  at least one open carried slot, and be within the strict squared distance
  `4900` (70 units).

## Quadtree traversal order

`QuadTree::query_at` visits child indices `0, 2, 1, 3` (NW, SW, NE, SE): the
two recursive calls followed by the tail-jumped quadrant. The index returns
candidates; callers run the exact predicate, so the order affects
iteration/effect-vector order rather than the set of matches.

## Cached collision bounds

`collision_bounds(world, handle)` memoizes the union of the body circle and all
attached children. `Entity::children` is the domain intrusive child list;
`attach_child`/`detach_child` maintain it. `invalidate_bounds` marks the entity
and its owner chain dirty after movement or radius changes, so the cache is
rebuilt once per tick rather than per query. Centipede chains, Ant Hole
children and equipped petals all use the same mechanism.

Idle steering rounds the unwrapped angle sum to f32 **before** applying the
remainder/wrap. The speed impulse rounds speed×milliseconds to f32, promotes
that result, multiplies by the f64 literal `0.001`, then demotes. Using a
float literal `0.001F` adds an ULP to the Centipede impulse. The first head
step is exactly -0.32139188051223755; this fixes the former strict tick260
divergence without changing state tolerances.

The subsequent tick303 contact-order divergence was missing quadtree
compaction. After relocation, compaction visits children recursively and merges
four leaf children when their combined item count plus the parent is at most
four. Merge order is 0,1,2,3; query order remains 0,2,1,3. The tree preserves
both orders and reuses released nodes. Contact-order tests pin the resulting
candidate sequence. Attack and moving-player long runs still expose later
drop/contact-damage differences; this does not establish complete simulation
equivalence.

## Open

- species attack callbacks other than the Hornet stinger callback, and behavior
  modifiers beyond the recorded domain multipliers;
- exact animation/locomotion blend for every species (wave/sine/drift phases
  are reconstructed; per-species blend parameters are not all known);
- full quadtree node capacity/split shape (visit order and predicates are
  covered; the node shape is not).
