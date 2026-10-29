# Player

## Defaults

A default spawn writes these values before the avatar is published:

| Field | Value |
| --- | ---: |
| Collision radius | 25 |
| Maximum health | 100 |
| Current health | 100 (or the prior ratio) |
| Contact damage | 25 |
| Spawn clearance radius | 100 (compact) / 800 |
| Inner spawn radius | 50 (compact) / 100 |

`PlayerConfig` carries these as defaults. `spawn_player` accepts explicit values
for native tests.

## Spawn position

The level selects a horizontal band; the vertical position is uniform:

- level <= 12: `[-half, -half + 0.3 * width]`
- level <= 27: `[-half + 0.3 * width, -half + 0.6 * width]`
- level <= 42: `[-half + 0.6 * width, -half + 0.9 * width]`
- otherwise: `[-half + 0.9 * width, half]`

The horizontal sample is biased by `min(uniform² * 0.8, 1)`. Up to 1000 trials
retry when the spatial query reports the position occupied. `World` defaults to
50000 × 4000; `set_dimensions` overrides it.

## Profile and equipment

`PlayerProfile` stores level, experience, a 16-slot inventory and the ten lost
items reported on death.

- Level thresholds: `floor(1.06 ** (level - 1) * level) + 3`, rounded to f32.
- Inventory size: 13 / 14 / 15 / 16 at levels 0 / 15 / 30 / 45.
- A 16-entry backpack FIFO holds discarded petals; the oldest entry is dropped
  when a seventeenth is pushed.
- Active slots: 5 / 6 / 7 / 8 at the same thresholds.
- New players receive five Basic petals (type 1).
- A rare starter roll of `0.00005` replaces slot 0 with type 35 when the new
  profile has no other rare starter. The scan is limited to the new profile;
  other avatars and loose rare petals are not included.
- A prior profile's level and first active inventory entries are restored by
  `spawn_player_default` through `PlayerLoadout::restore_from_profile`; slots
  beyond the level's active count stay empty while the backpack remains in the
  profile.

## Loadout and petals

`PlayerLoadout` owns 16 `PetalSlot`s, an 8×3 intrusive handle array, 8×3
pending bytes and 8×3 timers.

- `change_slot_type` clears the three equipped handles by damaging them, sets
  pending bytes and zero timers, installs the new slot type and bumps the
  replication/slot epochs.
- `create_equipped_petal` spawns at radius 65, attaches the petal as a player
  child, stores the handle and clears pending.
- `spawn_loadout_petals` creates one entity per configured instance (up to
  three) at evenly spaced orbit angles only after the slot recharge is ready.
- Discard validates the slot against level capacity, awards rarity XP for
  non-Basic petals, appends the petal to the 16-entry backpack FIFO and removes
  its spawned instances.
- Swap validates both slots and moves the handle/pending/timer arrays and epoch.
- `refresh_loadout_petals` advances each slot's recharge timer and respawns a
  missing instance when the timer expires.
- `on_petal_destroyed` clears the slot handle and starts the catalog recharge.

## Movement

`World::apply_input` only stores the latest buttons, wrapped angle and
non-negative strength; it does not move the player. `apply_player_controls`
(called from `tick`) reads those fields once per tick and applies one impulse:

```
modifier = slow_multiplier(player)
impulse  = f32(dt * f32(modifier * 2.5) * 0.001)
if strength < 200: impulse = f32(impulse * f32(strength * 0.005))
vx += f32(cos(direction) * impulse)
vy += f32(sin(direction) * impulse)
```

`modifier` starts at 1.0 and is multiplied by every active slow effect's
intensity. `PlayerConfig.movement_speed` is kept in the player record but is not
read by `apply_player_controls`. The direction is the wrapped input angle
(`fmod(angle, TAU)`), not a quantized angle. Every accepted packet overwrites
the stored strength; there is no first-packet latch.

`integrate_movement` advances positions by `drag * velocity + dt * acceleration`
where `drag = 124.99999999999989 * (1 - 0.992 ** dt)`. Acceleration contributes
to displacement only; velocity is damped by `0.992 ** dt` and zeroed below
`2.22e-16`. Player and mob positions are clamped to the arena minus their
collision radius, and the clamped axis velocity is zeroed. `integrate_positions`
is a linear helper for tests and non-player kinematic paths.

## Health recovery

Players recover health once per tick, before contact resolution:

```
health = min(max_health, health + max_health * dt / 240000)
```

At the 50 ms tick and 100 maximum health this is exactly `1/48` (0.0208333) per
tick. Mobs do not use this recovery. Recovery is capped at maximum health and
skipped for dead players.

## Experience and level health

`award_player_experience` adds score and XP, caps level at 99, and applies the
level-health update for **every** gained level. Collapsing several levels into
one ratio loses observable f32 bits.

Base maximum health at a level:

```
ratio   = clamp(f32((level - 1) × f64(1/44)), 0, 1)
maximum = f32(f32(ratio × 50) + 100)
```

Health is rescaled with an f32 multiplication followed by an f32 division at
each level. Level 2 maximum is `101.13636016845703`; level 45 reaches 150. The
combat reward path covers level contribution only; equipped-petal health
bonuses and other modifiers are separate, and the non-Basic discard path adds
profile XP directly.
