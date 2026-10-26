# Player

## Defaults

The original spawn path writes these values before the avatar is published:

| Field | Value | Evidence |
| --- | ---: | --- |
| Collision radius (physics +8) | 25 | `input.mjs` spawnPlayer double `0x4039000000000000` |
| Maximum health (health +12) | 100 | `float 1120403456` |
| Current health | 100 (or the prior ratio) | `call(18)` / `call(25)` |
| Contact damage (physics +44) | 25 | `uint 1103626240` = `0x41c80000` |
| Spawn clearance radius | 100 (compact) / 800 | `scratch + 132` |
| Inner spawn radius | 50 (compact) / 100 | `scratch + 128` |

`PlayerConfig` carries these as defaults. `spawn_player` still accepts explicit
values for native tests.

## Spawn position

The original chooses a level-dependent horizontal band and a uniform vertical
position:

- level <= 12: `[-half, -half + 0.3 * width]`
- level <= 27: `[-half + 0.3 * width, -half + 0.6 * width]`
- level <= 42: `[-half + 0.6 * width, -half + 0.9 * width]`
- otherwise: `[-half + 0.9 * width, half]`

The horizontal sample is biased by `min(uniform^2 * 0.8, 1)`. Up to 1000 trials
retry when the spatial query reports the position occupied. `World` defaults to
the original 50000 x 4000 arena; `set_dimensions` overrides it.

## Profile and equipment

`PlayerProfile` stores level, experience, a 16-slot inventory and the ten lost
items reported on death.

- Level thresholds: `floor(1.06 ** (level - 1) * level) + 3`, rounded to f32.
- Inventory size: 13 / 14 / 15 / 16 at levels 0 / 15 / 30 / 45.
- A 16-entry backpack FIFO holds discarded petals; the oldest entry is dropped
  when a seventeenth is pushed.
- Active slots: 5 / 6 / 7 / 8 at the same thresholds.
- New players receive five Basic petals (type 1).
- A rare starter roll of `0.00005` replaces slot 0 with type 35 when no other
  rare starter exists. The current implementation only checks the new profile;
  the original also scans other avatars and loose rare petals.
- A prior profile's level and first active inventory entries are restored by
  `spawn_player_default` through `PlayerLoadout::restore_from_profile`; slots
  beyond the level's active count stay empty while the backpack remains in the
  profile.

## Loadout and petals

`PlayerLoadout` owns 16 `PetalSlot`s, an 8x3 intrusive handle array, 8x3
pending bytes and 8x3 timers. `change_slot_type` implements the recovered 125
path: clear the three equipped handles by damaging them, set pending bytes and
zero timers, then install the new slot type and bump the replication/slot
epochs. `create_equipped_petal` implements 397: spawn at radius 65, attach as a
player child, store the handle and clear pending. `spawn_loadout_petals` creates
one entity per configured instance (up to three) at evenly spaced orbit angles
only after the slot recharge is ready. Discard validates the slot against the
level capacity, awards the rarity XP for non-Basic petals, appends the petal to
the 16-entry backpack FIFO, and removes its spawned instances. Swap validates
both slot values and moves the handle/pending/timer arrays and epoch.
`refresh_loadout_petals` advances each slot's recharge timer and respawns a
missing instance when the timer expires. `on_petal_destroyed` clears the slot
handle and starts the catalog recharge.

## Movement

`World::apply_input` only stores the latest buttons, wrapped angle and
non-negative strength; it does not move the player. Original `655` writes every
accepted opcode-12 packet to `player+280/+284`, and `applyPlayerControls` reads
those fields once per tick. `apply_player_controls` (called from `tick`) applies
one impulse per simulation tick:

```
acceleration = f32(dt * f32(modifier * 2.5) * 0.001)
if strength < 200: acceleration = f32(acceleration * f32(strength * 0.005))
else:              acceleration = f32(acceleration * pow_f64(f32(strength * 0.005), 1.4))
vx += f32(cos(direction) * acceleration)
vy += f32(sin(direction) * acceleration)
```

`PlayerConfig.movement_speed` is the explicit `modifier` (0 means 1). The
direction is the original wrapped input angle (`fmod(angle, TAU)`), not a
reconstructed 256-step angle. Every accepted packet overwrites the stored
strength; there is no first-packet latch.

`integrate_movement` follows original `integrateMovement`: positions advance by
`drag * velocity + dt * acceleration` where `drag = 124.99999999999989 *
(1 - 0.992 ** dt)`, acceleration contributes to displacement only, and velocity
is damped by `0.992 ** dt` (zeroed below `2.22e-16`). Player and mob positions
are clamped to the arena minus their collision radius, and the clamped axis
velocity is zeroed. `integrate_positions` remains as a linear helper for tests
and non-player kinematic paths.

## Health recovery

Players recover health once per tick, before contact resolution:

```
health = min(max_health, health + max_health * dt / 240000)
```

At the shipped 50 ms tick and 100 maximum health this is exactly `1/48`
(0.0208333) per tick, matching the observed post-damage series
`50.0000, 50.0208, 50.0417, ...`. Mobs do not use this recovery. The amount is
capped at maximum health and skipped for dead players.
# R04 reward and level-health evidence

Original func215 applies compact-world reward multiplier3, adds score and XP,
caps level at99, and calls145 for **every** gained level. The domain helper
`award_player_experience` follows this ordering for combat rewards. Original145
computes the base maximum as f32(f32(clamp(f32((level-1)×f64(1/44)),0,1)×50)+100)
and rescales health with an f32 multiplication followed by f32 division at each
level. Collapsing several gained levels into one ratio loses observable bits.
Level2 maximum is101.13636016845703; maximum reaches150 at level45.

`engine/tests/oracle/progression-math-evidence.mjs` invokes unmodified original
funcs215/145 and confirms cumulative reward3/6/16/116, levels1/2/4/11 and the
proportional health sequence. The strict150-tick attack replay now passes,
including the prior6000ms max-health divergence. This implements the level
contribution only: original145 also has equipped-petal health bonuses and
other modifiers, and the non-Basic discard path still adds profile XP directly.
Those paths are not claimed equivalent by the combat reward test.
