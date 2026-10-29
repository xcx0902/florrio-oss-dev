# Spawn selection

Status: catalog grouping, weighted choice, position trials, collision retries,
population targets, family initializers, the per-species RNG draw budget and the
Ant Hole/Centipede child links are implemented. Exact per-species animation and
the spawn scratch layout remain open.

## Inputs

- 20 spawn rules from `schema/catalogs/spawn-rules.json`.
- Each rule has a binary32 weight, one or more region ids (0..7) and an entity
  type id.
- Server RNG. `sp_server_init` starts from `285456437`, consumes two init draws
  and then fills the bands; the population ends at `787621659`.
  `World::random()` starts at `285456437`; `WorkerApi::init(true)` consumes the
  two init draws, then `populate_world` runs. A native `populate_world` fixture
  seeded with `2065629805` (the state after those two draws) pins the species
  sequence and the final `787621659`.

## Band construction

For each rule, append `{weight, entityTypeId}` to every region in `regionIds`.
Entries stay in catalog order. The band total is accumulated in binary32:

```
total = f32(total + weight)
```

The per-band totals and counts:

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

Weighted choice:

```
choice = serverRng.next()                  // Park-Miller variant, multiplier 48271
fraction = f32(f32(choice - 1) * 2^-31)
remaining = f32(band.total * fraction)
for entry in band.entries:
    if remaining < entry.weight: return entry
    remaining = f32(remaining - entry.weight)
return none
```

`ServerRng` uses the Park-Miller quotient/correction form:

```
quotient   = state / 44488
product    = (state + quotient * -44488) * 48271
correction = quotient * 3399
state      = (product < correction ? 2147483647 : 0) + product - correction
```

All arithmetic is uint32 wrapping. The sequence from seed `1` starts
`48271, 182605794, 1291394886, 1914720637`.

## Per-species RNG draw budget

Entity construction consumes RNG in this order:

1. one draw per catalog component (`componentDrawCount` in
   `schema/catalogs/entities.json`) before the species initializer;
2. the initializer's own draws (for example the queen's extra draws, the
   centipede's segment chain and the ant hole's baby-ant loop);
3. behavior configuration: one orientation draw, one `uniform_int(0, 1)`
   draw, and a second orientation draw when the species settings byte is clear
   (hornet and square).

`consume_component_draws` and `configure_behavior_draws` implement steps 1 and
3. Native fixtures pin the per-type draw counts (for example type 11 = 57,
type 15 = 82, type 16 = 8, type 17 = 62, type 18 = 6).
`schema/catalogs/entities.json` records the counts; variants 16/18 are runtime
copies of 15/17 and do not re-run the parent initializer.

## Position trial

A position trial uses two RNG draws without an intermediate state store:

```
first  = successor(state)
second = successor(first)
state  = second
fx     = f32(f32(first - 1) * 2^-31)
fy     = f32(f32(second - 1) * 2^-31)

x = f32(50000 * f32(f32(lower + f32(f32(upper - lower) * fx)) + -0.5))
y = f32(4000  * f32(fy + -0.5))
```

Band bounds (binary32):

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
height.

`SpawnTable::sample_position` implements one trial. For seed `787621659`,
band 0 returns `(-24180.6171875, 652.9090576171875)` and advances the state to
`1424269740`. Tests also cover bands 3 and 7.

`SpawnTable::find_clear_position` implements the up-to-100-trial loop. It takes
an `occupied(position)` predicate backed by `SpatialQuery`; the trial is
accepted on the first false result. The query rectangle is 1200 x 1200 around
the candidate (`half_extent = 600`), which is the default of
`SpatialQuery::occupied`. Tests reject two trials and verify the third
position and RNG state, and reject all trials with `max_trials=2`.

`SpawnTable::spawn_from_band` chooses a species (`nextRandom`), samples/rejects
positions, then calls a factory to construct the entity. Tests verify the
selected type, the factory's accepted position and the fully consumed RNG
state.

## Tests

`test_spawn_table` in `engine/tests/unit/test_main.cpp` compares all 8
totals/counts, band-0 order, the RNG sequence, selections for seeds `1`,
`2147483646` and `787621659`, and three position trials.

## Entity spawn defaults

The 19 catalog species' radius, contact damage and entity flags live in
`engine/include/engine/catalog/entity_spawn_defaults.hpp`.

- Cactus: randomized radius 40..60, health `radius * 0.7`, contact `30`,
  flags `(0,96,75)`.
- Ladybug: radius `30`, health `25`, contact `10`, flags `(2,112,75)`.
- Bee: radius `25`, health `15`, contact `50`, flags `(2,96,91)`.
- Spider: radius `25`, health `20`, contact `25`, flags `(10,96,75)`.
- Rock/Boulder/Cactus are marked `dynamicRadius` and rejected by
  `spawn_entity_from_defaults`; use `configure_rock` / `spawn_rock` when the
  caller owns the RNG state.

`configure_rock` uses one draw:

```
random = nextRandom()
radius = f32(f32((massive ? 40 : 20) / 2^31 * f32((random - 1) >>> 0))
             + (massive ? 60 : 20))
health = f32((massive ? 2 : 1) * radius * 0.4)
```

With RNG state `1677421613`, the next draw is `2095254635`, radius
`39.513580322265625`, health `15.805432319641113`. `spawn_rock` writes contact
`10`, flags `(75,96)` and component flag `4`. `spawn_rock_with_component_draws` performs
the three pre-configure draws followed by `configure_rock`;
`spawn_from_band_with_component_draws` routes type 1/2 through it, type 3 through
`spawn_cactus_with_component_draws`, and other species through the catalog defaults.
With seed `787621659`, band 0 selects Rock, accepts the first position trial and
ends at RNG state `2095254635` with radius `39.513580322265625`. The generic
`spawn_from_band` leaves the factory choice to the caller.

`configure_cactus` uses one draw:

```
random = nextRandom()
radius = f32(f32(f32((random - 1) >>> 0) * (20 / 2^31)) + 40)
health = f32(radius * 0.7)
```

`spawn_cactus` writes contact `30`, flags `(75,96)` and component flag `0`;
`spawn_cactus_with_component_draws` consumes the same three pre-draws. The factory
rejects Cactus because its radius is dynamic.

`spawn_entity_from_defaults` creates the entity with the catalog radius/flags
and sets `contact_damage`, `health`/`max_health` and `component_flags92`. It
then dispatches the family initializers:

- Ladybug 4/5/20/21 → `configure_ladybug` (normal/massive/dark/shiny);
- Ant 7/8/9/10 → `configure_ant` (baby/worker/soldier/queen, random turn
  scale, soldier range 300/400);
- Beetle 12/13 → `configure_beetle` (normal/massive);
- Centipede 15/16/17/18 → `configure_centipede` (normal/evil, head/segment,
  1% rare);
- Spider 22 → `configure_spider` (aggressive, chase, territory 0.45);
- Bee 6 / Hornet 14 / Square 19 → their family constructors;
- Ant Hole 11 → six children in the 7,7,7,8,8,9 caste order. Each child is
  spawned at the hole position, then one RNG draw adds a 0.25-unit velocity
  scatter `(cos, sin)(f32((random-1)*2π/2^31)) * 0.25`.
  The child is linked to the hole with `owner` + `attach_child`; its
  `spawn_band` is 255 so it never counts as an ordinary population parent.

Queen Ant (10) and segment records 16/18 are not in the 19-row defaults table;
explicit fallbacks supply radius 40/35 and then run the same family
initializer. A normal/evil Centipede head consumes one rare roll
and then one initial-angle draw
`f32(f32((random-1)>>>0) * f32(2π/2^31))`; it spawns a 9-segment chain (49 when
rare) at 70-unit spacing with `angle += f32(2π/20)` (`f32(2π/100)` rare). Each
segment is owned by the previous one, records `ai.predecessor`, and carries
`spawn_band = 255`. Bounds and `spawnAreaBlocked` are checked before every
segment; the first rejection stops the chain.

## Ant Hole release table

`initializeAntHoleEntity11` creates an `AntHoleRelease` record in
`World::ant_hole_releases()`. Its `release_index` starts at zero. The six
children spawned by the initializer are **not** table entries; they are created
before the first tick observes the hole.

Every tick, after movement integration and before contact damage, the server
walks the release records in creation order. For each hole with
`release_index <= 32` it computes `health / max_health` as binary32 and loops:

```
if (ratio > threshold[release_index]) stop;
type = 7 + speciesOffset[release_index];
spawnEntity(holeWorld + 1936, type, hole.x, hole.y, -1);
draw one RNG value; add 0.25*(cos,sin)(angle) to the child's velocity;
link the child to the hole; ++release_index;
```

The comparison is exactly `ratio > threshold`: equality releases. The table has
33 entries. The species sequence is

```
7,8,7,8,8,8,9,9,9,9,8,9,9,9,9,8,9,9,10,9,9,9,9,9,9,9,9,9,9,9,9,9,9
```

and thresholds `0.97, 0.95, 0.93, 0.90, 0.87, 0.83, 0.80, 0.77, 0.73, 0.67,
0.63, 0.60, 0.57, 0.53, 0.47, 0.44, 0.41, 0.38, 0.36, 0.32, 0.30, 0.27, 0.24,
0.20, 0.26, 0.16, 0.10, 0.07, 0.04, 0.02, 0, 0, 0` (binary32 values; the
0.26/0.20 pair is intentionally out of order and is preserved). Entry 18 is the
Queen Ant (type 10). At zero health all 33 entries
release: 2 baby, 6 worker, 24 soldier and 1 queen, in addition to the six
starting children.

The engine attaches each released child to the hole with `set_owner`, so the
child carries entity flag 64, `owner`/`ai.owner`, and is in `hole.children`; it
keeps `spawn_band = 255`, so it never counts as a population parent. `World::destroy(hole)` removes the companion record, and a
reused slot cannot release from the old state.

## Rare rows and the fixed seed

The three rare species are present in the catalogue and in these bands:

| species | bands | weight | expected initial count at 797 parents |
| --- | --- | ---: | ---: |
| Massive Ladybug (5) | 0, 1 | 0.000199999995 | 0.0595 |
| Ant Hole (11) | 3, 4, 5, 6, 7 | 0.00200000009 | 1.70 |
| Evil Centipede (17) | 3, 4, 5, 6, 7 | 0.00100000005 | 0.85 |

`SpawnTable::from_catalog` keeps these weights. The deterministic seed
`285456437` produces an initial world with zero of all three. That is a valid
outcome: the probability of all three being absent from one 797-parent world is
about 7%. Because the product uses a fixed seed for deterministic replay, every
new session repeats that outcome. Do not raise these weights or drop the rows
to make the fixture more interesting. Any entropy mode must be explicit and
must not change the deterministic fixture.

Population is **deficit-only**, so waiting does not create new parents: a rare
row can only be selected when a parent in its band dies and the population
targets refill that slot. Killing a child (Ant Hole ant, Centipede segment, band 255)
never creates a parent deficit. Averaged over random parent kills, the chance
per replacement is `1/13391` for Massive Ladybug, `1/468` for Ant Hole and
`1/936` for Evil Centipede. At one parent kill per second those are about 3.7
hours, 7.8 minutes and 15.6 minutes on average; the 50% points are 9,282, 324
and 648 kills. Farming only bands 3-7 raises Ant Hole/Evil Centipede to about
`1/257` and `1/514` per kill, while Massive Ladybug is only in bands 0-1
(`1/4033` conditional). A fixed seed additionally fixes the order of these
draws, so a long gap is possible even when the long-run rate is correct.


## Open

- Exact per-species `configure_*` RNG draw counts. Rock/Boulder/Cactus,
  Ladybug, Ant, Centipede, Beetle, Bee, Hornet and Spider are pinned; a species
  that consumes a different number of draws changes the downstream population.
- Spawn scratch/behavior components beyond the family fields.
- Rock/Boulder/Cactus dynamic radius is implemented; the remaining gap is the
  exact three pre-draw order for every band factory path.

## Population targets

`population_targets(width, height)` computes area-scaled targets. At the default
50000 x 4000 arena the eight targets are
`120, 120, 119, 120, 119, 119, 40, 40` (797 mobs).

`populate_world(world, table)` is the initial fill: for each band it spawns
exactly `targets[band]` parents, counting successful parent spawns only. It is
what `WorkerApi::init(true)` / `sp_server_init` call. `replenish_population`
counts active **parents** by `Entity::spawn_band` and fills only the deficit;
children carry `spawn_band = 255` so they never inflate the counter. The tick
calls `replenish_population` when `World::auto_populate()` is set. Native tests
keep auto-population off by default.

At the default arena the parent target is 797. Ant Hole and Centipede children
are additional entities; the shipped world has 870 active records (797 parents
+ 73 children).
