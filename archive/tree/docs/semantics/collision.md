# Spawn collision query

Status: leaf geometry, occupied predicate, quadtree traversal order, rectangle
and circle queries, cached collision bounds and the 30-layer filter are
reconstructed. Node capacity/split shape is still a domain choice.

## Original function 161

Inputs:

- `node` — quadtree node: count at `+24`, body-pointer array at `+32`,
  four children at `+36/+40/+76/+120`.
- `query` — rect: x at `+0`, y at `+4`, width at `+8`, height at `+12`.
- `params` — two pointers: query center x at `+0`, center y at `+4`.

For each body pointer in the node:

1. Read physics component (body):
   - `+0` entity pointer,
   - `+8` radius (f32),
   - `+20` min x, `+24` min y, `+28` width, `+32` height.
2. Skip if the query rect does not overlap `[min, min+size]`.
3. Flag rule:
   - entity `+95 & 32` set → threshold `600`;
   - else threshold `100`, and require entity `+93 & 32`; otherwise skip.
4. Read transform component pointer at entity `+168`; if byte `+80` is zero,
   call `function_17` first.
5. Compare squared distance between transform f64 `+88/+96` (demoted to f32)
   and the query center:
   - collision if `distance² < (threshold + radius)²`.
6. Recurse into children whose bounds intersect the query.

The spawn path at `source/game/server/components.mjs` uses a 1200×1200 rect
centered on the candidate (`half_extent = 600`).

## Engine model

`engine::SpatialQuery` stores `CollisionBody { position, radius, world_flags,
entity_flags, handle }` and implements the same leaf AABB/flag/distance test.
Candidates come from the quadtree; the exact test is unchanged.
`SpatialQuery::from_world` collects every active `Entity` using the
`world_flags`/`entity_flags` fields. `query_box` and `query_circle` expose the
same index to AI target selection and area-effect target maintenance.
`QuadTree::query_at` visits children in the recovered `0,2,1,3` (NW, SW, NE, SE)
order.

`SpawnTable::find_clear_position` takes this predicate and performs the original
up-to-100 retries. `WorkerApi::occupied` exposes `SpatialQuery::from_world` for
the live server path.

## Evidence

- WAT `source/wasm/sp_server.wat` function 161.
- `source/game/server/components.mjs` `spawnPopulationBand`.
- `source/game/server/entities.mjs` physics layout:
  `ensurePhysics` at entity `+188`, radius at `+8`, AABB at `+20/+24/+28/+32`.
- Probe of a spawned Rock: radius `39.51`, AABB min `(-20065.3, 536.79)`,
  transform center `(-20025.8, 576.3)`.

## Tests

`test_spatial_query` covers:

- body in range at `(0,0)`, `(500,0)` and out of range at `(700,0)`;
- world flag 32 → 600 threshold;
- no flags → skipped;
- entity flag 32 with world flag clear → 100 threshold;
- `from_world` collects an active entity spawned with flags `(32,32)` and
  produces the same in/out-of-range results.

## Cached collision bounds (original 167)

`engine/src/sim/bounds.cpp` memoizes the union of an entity's body circle and
all attached children. `attach_child`/`detach_child` maintain
`Entity::children`; `invalidate_bounds` marks the entity and owner chain dirty
after movement/radius changes. `collision_bounds` rebuilds once per tick and
returns a binary32 min/max rectangle. This is the domain form of the original
memoized `physics +16` flag and union rectangle.

## Contact resolution (originals 162 and 390)

The archived pair pass is **not** distance sorted. `function_162` receives one
body and walks the collideable records whose body AABB (`+20/+24` size at
`+28/+32`) overlaps the query rectangle (`sp_server.wat` 154448-154550:
`-2*body2 > x`, `-2*body3 > y`, `body2+body4 >= x+w/2`, `body3+body5 < y+h/2`).
The candidate sequence is the broad-phase storage order (quadtree traversal),
not a distance sort.

Differential check: `--contact-order 7` (plain ascending entity slot) moves the
first boot-menu difference to tick 1 at 2.26 units, while the quadtree order
used by default reproduces the original to 1 f32 ULP at tick 1. Slot order is
therefore not the archived candidate order.

`function_162` gates, in order:

1. skip the pair when `physics +49` (drop marker) is set on either body;
2. skip when either health component `+8 <= 0`;
3. handle ordering: skip when `(a[4] & 16383) >= (b[4] & 16383)` for the
   argument order used by the outer loop, so each pair is resolved once with
   the lower slot index as the first argument;
4. binary32 distance test on the cached world positions: overlap only when
   `distance < radiusA + radiusB`;
5. two `function_390` calls with the same velocity/acceleration snapshots and
   swapped arguments, then optional contact damage via `function_43` with the
   damage scale `s = clamp(((max(levelA, levelB) + level) - 5) * 0.2, 0, 1)`
   (shipped solo games use `s = 1`).

`function_390` computes `p = posA - posB` (f32 promoted to f64), `r = |p|^2`,
`dot = (vA + aA - vB - aB) · p` and then:

- **mass path** (`physics +48` set on both bodies; the world-flag branch
  `a[0][0]` with `+95 & 32` decides which body is treated as the mass anchor):
  `vA += p * dot * (mB) * -2 / r * (mA + mB)` where `mX = radiusX^2 * massX`;
- **default path**: `vA += p * dot * -2 / r`, i.e. an equal-and-opposite
  impulse along the pair normal, independent of distance beyond `1/r`.

A physics record with `+48` clear (Rock, Boulder, Cactus, Ant Hole - the
`physics_flag48 = false` spawns) receives **no velocity and no position
change** from 390: the call with that body as the first argument returns before
either write.

`engine::resolve_contacts` therefore:

- collects candidates in the original quadtree traversal order (no distance
  sort) and processes each unordered pair once with the lower slot first;
- uses the f32 distance test and the `+48`/`+49`/health gates;
- applies the default-path impulse `-2 * dot / r * p` to both bodies;
- gives the lower-slot body the full overlap push and lets the second call
  resolve the residual, which is what the swapped pair does in the original.

The mass path is implemented as a mass-weighted split (`radius^2 * mass`); the
exact 390 mass term above is still being matched and is the remaining R06 gap.
Evidence: `source/wasm/sp_server.wat` 145562-145860 (162) and 154448-154550
(outer loop), `source/decompiled/sp_server/functions-0320-0383.dcmp:4017`
(390), `functions-0128-0191.dcmp:1528` (162), `functions-0000-0063.dcmp`
(44/47/17 property and world-transform helpers).

Contact damage is applied only when the aggressor is aggressive (or the crush
path below); passive mob overlaps separate without damage. The diagnostics
`sp_server_debug_contact_*` expose the processed pairs (target/other, overlap,
before/after positions) for differential debugging.

## Open

- True quadtree node capacity/split parity with the original allocator.
- Populating bodies from the ECS/physics store and exact entity flags.
- Exact original physics `+16` cache epoch/byte layout (domain uses a dirty flag
  and tick epoch).

## Quadtree index

`engine/include/engine/sim/quadtree.hpp` provides a deterministic fixed-box
quadtree used for broad-phase candidate collection. `SpatialQuery` maintains
the index in `add`/`clear` and uses it in `occupied`; the exact original
circle/AABB predicate still decides collision. The native test compares a
100-body query with a linear scan, checks an outside query is empty, and removes
one body from its node, and updates a body with remove + insert.

## Collision-layer filter (original 394)

`engine/src/sim/collision_filter.cpp` ports the recovered 30-layer filter:

- four flag bytes (`layer_flags[0..3]`) enable one layer per bit;
- each layer has a threshold; a layer matches when `threshold > probe`;
- 19 layers also have two side thresholds; the side selector's bit 6 chooses
  `layer_sides` or `layer_sides_alt`, and the side matches when
  `sideThreshold <= probe`;
- `ignore_ranges` counts every set layer flag without threshold tests.

`count_matching_layers` returns the number of matches, not a boolean.
`layers_collide` is the contact-pass integration: two bodies collide when either
has no layer flags or at least one layer matches the other body's
`layer_probe`. The native test covers threshold equality, side selection,
ignore-ranges and both directions of the pair predicate.

Evidence: `source/game/server/collision-filter.mjs`,
`reports/server-collision-filter.md` (682 oracle comparisons in the retained JS
harness; this reconstruction does not run those oracle tests).
