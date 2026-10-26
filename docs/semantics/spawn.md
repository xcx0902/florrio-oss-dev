# Spawn selection

Status: catalog grouping, weighted choice, position trials, collision retries,
population targets, the recovered family initializers, the per-species RNG draw
budget and the Ant Hole/Centipede child links are reconstructed. Exact
per-species animation and the byte-level `call(144)` scratch layout remain open.

## Inputs

- 20 spawn rules from `schema/catalogs/spawn-rules.json`.
- Each rule has a binary32 weight, one or more region ids (0..7) and an entity
  type id.
- Server RNG state at `8573024` (original). `sp_server_init` starts from the
  post-constructor state `285456437`, consumes two draws through original `102`
  (the 32-bit init value) and then fills the bands; the population ends at
  `787621659`. The engine mirrors this: `World::random()` starts at
  `285456437`, `WorkerApi::init(true)` consumes the two init draws, then
  `populate_world` runs. A native `populate_world` probe seeded directly with
  `2065629805` (the state after those two draws) reproduces the original
  species sequence and the final `787621659`.

## Band construction

For each rule, append `{weight, entityTypeId}` to every region in `regionIds`.
Entries stay in catalog order. The band total is accumulated in binary32:

```
total = f32(total + weight)
```

The original table is at `8548144 + band * 16`: total at `+0`, count at `+4`,
descriptor pointer at `+12`. Descriptors are 16 bytes, weight at `+0`, species
at `+13`.

Probed totals and counts:

| Band | Total (f32) | Entries |
| ---: | ---: | ---: |
| 0 | 0.7942009568214417 | 8 |
| 1 | 0.8192009329795837 | 9 |
| 2 | 0.7390009760856628 | 9 |
| 3 | 0.8190009593963623 | 12 |
| 4 | 0.48900100588798523 | 10 |
| 5 | 0.4140009880065918 | 9 |
| 6 | 0.5140010118484497 | 10 |
| 7 | 0.4140009880065918 | 9 |

Band 0 order: `1, 2, 4, 5, 6, 7, 15, 19`.

## Weighted choice

Original function `113`:

```
choice = serverRng.next()                  // Park-Miller variant, multiplier 48271
fraction = f32(f32(choice - 1) * 2^-31)
remaining = f32(band.total * fraction)
for entry in band.entries:
    if remaining < entry.weight: return entry
    remaining = f32(remaining - entry.weight)
return none
```

`ServerRng` uses the original quotient/correction form:

```
quotient   = state / 44488
product    = (state + quotient * -44488) * 48271
correction = quotient * 3399
state      = (product < correction ? 2147483647 : 0) + product - correction
```

All arithmetic is uint32 wrapping. The sequence from seed `1` starts
`48271, 182605794, 1291394886, 1914720637`.

## Per-species RNG draw budget

The original consumes RNG while constructing each default entity:

1. one draw per catalog component (`componentDrawCount` in
   `schema/catalogs/entities.json`) before the species initializer;
2. the initializer's own draws (for example the queen's extra draws, the
   centipede's segment chain and the ant hole's baby-ant loop);
3. `configureBehavior` (original `114`): one orientation draw, one
   `uniform_int(0, 1)` draw stored at `AI+48`, and a second orientation draw
   when the species settings byte at `+4` is clear (hornet and square).

`consume_component_draws` and `configure_behavior_draws` implement steps 1 and
3. Runtime probes of all 22 default species match the original per-type draw
counts exactly (for example type 11 = 57, type 15 = 82, type 16 = 8, type 17 =
62, type 18 = 6). `schema/catalogs/entities.json` records the counts and the
probe evidence; variants 16/18 are runtime copies of 15/17 and do not re-run the
parent initializer.

## Position trial

Original `113` uses two RNG draws per trial without an intermediate state store:

```
first  = successor(state)
second = successor(first)
state  = second
fx     = f32(f32(first - 1) * 2^-31)
fy     = f32(f32(second - 1) * 2^-31)

x = f32(50000 * f32(f32(lower + f32(f32(upper - lower) * fx)) + -0.5))
y = f32(4000  * f32(fy + -0.5))
```

Band bounds (binary32, original `6984 + (band-1)*4` and `7012 + (band-1)*4`):

| Band | Lower | Upper |
| ---: | ---: | ---: |
| 0 | 0 | 0.15 |
| 1 | 0.15 | 0.3 |
| 2 | 0.3 | 0.45 |
| 3 | 0.45 | 0.6 |
| 4 | 0.6 | 0.75 |
| 5 | 0.75 | 0.9 |
| 6 | 0.9 | 0.95 |
| 7 | 0.95 | 1.0 |

Band 0 is the special outside case: lower 0, upper 0.15. World width/height
default to `50000`/`4000`; the sampler uses the current `World` dimensions.

Bands are **vertical x strips spanning the full arena height**: the band
bounds above select `x`, while `y` uses the unclamped `fy` over the whole
height. This was confirmed by the original `6984`/`7012` table probe; an earlier
domain version incorrectly restricted `y` to the same fraction and is now
fixed.

`SpawnTable::sample_position` implements one trial. For seed `787621659`,
band 0 returns `(-24180.6171875, 652.9090576171875)` and advances the state to
`1424269740`. Tests also cover bands 3 and 7.

`SpawnTable::find_clear_position` implements the original up-to-100-trial loop.
It takes an `occupied(position)` predicate (the `SpatialQuery` port of function
161); the trial is accepted on the first false result. The original query
rectangle is 1200 x 1200 around the candidate (`half_extent = 600`), which is
the default of `SpatialQuery::occupied`. Tests reject two trials and verify the
third position and RNG state, and reject all trials with `max_trials=2`.

`SpawnTable::spawn_from_band` composes the original order: choose a species
(`nextRandom`), sample/reject positions, then call a factory to construct the
entity. Tests verify the selected type, the factory's accepted position and the
fully consumed RNG state.

## Evidence

- `source/game/server/components.mjs` `spawnPopulationBand` (original 113).
- `schema/catalogs/spawn-rules.json` and `schema/generated/layout-probe.json`.
- Probe of original `8548144` after `sp_server_init` (band totals/counts/order).
- Engine tests: `test_spawn_table` in
  `engine/tests/unit/test_main.cpp` compares all 8 totals/counts, band-0 order,
  RNG sequence, selections for seeds `1`, `2147483646`, `787621659`, and three
  position trials.

## Entity spawn defaults

`tools/probe-entity-defaults.mjs` calls original function `144` for the 19
catalog species and records the resulting radius, contact damage and entity
flags. The generated table lives in
`engine/include/engine/catalog/entity_spawn_defaults.hpp`.

- Cactus: randomized radius 40..60, health `radius * 0.7`, contact `30`,
  flags `(0,96,75)`.
- Ladybug: radius `30`, health `25`, contact `10`, flags `(2,112,75)`.
- Bee: radius `25`, health `15`, contact `50`, flags `(2,96,91)`.
- Spider: radius `25`, health `20`, contact `25`, flags `(10,96,75)`.
- Rock/Boulder/Cactus are marked `dynamicRadius` and rejected by
  `spawn_entity_from_defaults`; use `configure_rock` / `spawn_rock` when the
  caller owns the RNG state.

`configure_rock` implements original 417's single draw:

```
random = nextRandom()
radius = f32(f32((massive ? 40 : 20) / 2^31 * f32((random - 1) >>> 0))
             + (massive ? 60 : 20))
health = f32((massive ? 2 : 1) * radius * 0.4)
```

With RNG state `1677421613`, the next draw is `2095254635`, radius
`39.513580322265625`, health `15.805432319641113`; this matches a direct
function-144 Rock probe. `spawn_rock` writes contact `10`, flags `(75,96)` and
component flag `4`. `spawn_rock_function144` performs the three pre-configure draws followed by
`configure_rock`; `spawn_from_band_function144` routes type 1/2 through it,
type 3 through `spawn_cactus_function144`, and other species through the
catalog defaults. With the recorded seed
`787621659`, band 0 selects Rock, accepts the first position trial and ends at
RNG state `2095254635` with radius `39.513580322265625`, matching the original
spawn probe. The generic `spawn_from_band` still leaves the factory choice to
the caller.

`configure_cactus` implements original 716's single draw:

```
random = nextRandom()
radius = f32(f32(f32((random - 1) >>> 0) * (20 / 2^31)) + 40)
health = f32(radius * 0.7)
```

`spawn_cactus` writes contact `30`, flags `(75,96)` and component flag `0`;
`spawn_cactus_function144` consumes the same three pre-draws. The factory
rejects Cactus because its radius is dynamic.

`spawn_entity_from_defaults` creates the entity with the probed radius/flags and
sets `contact_damage`, `health`/`max_health` and `component_flags92`. It then
dispatches the recovered family initializers:

- Ladybug 4/5/20/21 → `configure_ladybug` (normal/massive/dark/shiny);
- Ant 7/8/9/10 → `configure_ant` (baby/worker/soldier/queen, random turn
  scale, soldier range 300/400);
- Beetle 12/13 → `configure_beetle` (normal/massive);
- Centipede 15/16/17/18 → `configure_centipede` (normal/evil, head/segment,
  1% rare);
- Spider 22 → `configure_spider` (aggressive, chase, territory 0.45);
- Bee 6 / Hornet 14 / Square 19 → their recovered constructors;
- Ant Hole 11 → six children in the 7,7,7,8,8,9 caste order. Each child is
  spawned at the hole position, then original 143 draws one RNG value and adds
  a 0.25-unit velocity scatter `(cos, sin)(f32((random-1)*2π/2^31)) * 0.25`.
  The child is linked to the hole with `owner` + `attach_child`; its
  `spawn_band` is 255 so it never counts as an ordinary population parent.

Queen Ant (10) and segment records 16/18 are absent from the 19-row
spawn-default probe; explicit fallbacks supply radius 40/35 and then run the
same family initializer. A normal/evil Centipede head consumes one rare roll
and then one initial-angle draw
`f32(f32((random-1)>>>0) * f32(2π/2^31))`; it spawns a 9-segment chain (49 when
rare) at 70-unit spacing with `angle += f32(2π/20)` (`f32(2π/100)` rare). Each
segment is owned by the previous one, records `ai.predecessor`, and carries
`spawn_band = 255`. Bounds and `spawnAreaBlocked` are checked before every
segment; the first rejection stops the chain (the original returns).

## Open

- Exact per-species `configure_*` RNG draw counts. The domain matches the
  recovered draws for Rock/Boulder/Cactus, Ladybug, Ant, Centipede, Beetle,
  Bee, Hornet and Spider, but the population sequence diverges when a species
  consumes a different number of draws than the original; this is the main
  reason a full initial-world species histogram is not yet byte-identical.
- Spawn call `144` scratch/behavior components beyond the recovered family
  fields.
- Rock/Boulder/Cactus dynamic radius is implemented; the remaining gap is the
  exact three pre-draw order for every band factory path.

## Population targets

`population_targets(width, height)` reproduces original function 400's area
scales. At the default 50000 x 4000 arena the eight targets are
`120, 120, 119, 120, 119, 119, 40, 40` (797 mobs).

`populate_world(world, table)` is the initial fill: for each band it spawns
exactly `targets[band]` parents, counting successful parent spawns only. It is
what `WorkerApi::init(true)` / `sp_server_init` call. `replenish_population`
counts active **parents** by `Entity::spawn_band` and fills only the deficit;
children carry `spawn_band = 255` so they never inflate the counter. The tick
calls `replenish_population` when `World::auto_populate()` is set. Native tests
keep auto-population off by default.

At the default arena the parent target is 797. Ant Hole and Centipede children
are additional entities, matching the original manager-active vector count of
870 (797 parents + 73 children in the shipped run).
