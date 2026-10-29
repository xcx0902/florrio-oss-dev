# Collision and spatial queries

Status: leaf geometry, the occupied predicate, quadtree traversal order, box and
circle queries, cached bounds, contact resolution and the 30-layer filter are
implemented. Node capacity and split shape remain domain choices.

## Body model

`CollisionBody` carries:

- `position` and `radius` (f32);
- world flags and entity flags;
- an entity handle.

Bodies come from every active entity through
`SpatialQuery::from_world`. The quadtree is only a broad phase; the leaf test is
the same for box and circle queries.

## Spawn query

`SpawnTable::find_clear_position` tests a 1200×1200 rectangle centred on the
candidate (`half_extent = 600`) and retries up to 100 times. A candidate is
occupied when a body overlaps the rectangle and passes the threshold rule:

1. If the body has world flag 32, threshold = 600.
2. Otherwise, if it has entity flag 32, threshold = 100.
3. Otherwise the body is ignored.
4. The body is occupied when squared distance from the query centre is less
   than `(threshold + radius)²`.

## Cached bounds

Each entity caches the union of its body circle and all attached children
(`Entity::children`). `attach_child`, `detach_child` and movement/radius changes
invalidate the entity and its owner chain. `collision_bounds` rebuilds at most
once per tick and returns a binary32 min/max rectangle.

## Contact pass

The pair pass is not distance sorted. Candidates are collected in quadtree
order and each unordered pair is processed once with the lower slot index first.
Gates:

1. skip a pair when either body is a drop;
2. skip when either health is zero or below;
3. apply the binary32 distance test `distance < radiusA + radiusB`;
4. resolve a velocity impulse and optional contact damage.

Both bodies receive an equal-and-opposite impulse along the pair normal:
`v += p * dot * -2 / r`, where `p = posA - posB`, `r = |p|²` and
`dot = (vA + aA - vB - aB) · p`. Bodies marked static (no mass participation)
return before changing velocity or position.

When both bodies have a mass, the split is weighted by `radius² * mass`. The
exact mass split is still open; the default path and the static-body gate are
covered by native tests.

Contact damage is applied only when the aggressor is aggressive (or the crush
path applies). Passive overlaps separate without damage. The diagnostics
`sp_server_debug_contact_*` expose processed pairs, overlap and before/after
positions.

## Quadtree

`engine/include/engine/sim/quadtree.hpp` is a deterministic fixed-box quadtree.
`SpatialQuery` maintains it in `add`/`clear` and uses it for `occupied`,
`query_box` and `query_circle`. Children are visited in NW, SW, NE, SE order.
The native test compares a 100-body query with a linear scan, checks an outside
query is empty, removes a body and updates a body with remove + insert.

## Collision-layer filter

`engine/src/sim/collision_filter.cpp` implements the 30-layer filter:

- four flag bytes (`layer_flags[0..3]`) enable one layer per bit;
- each layer has a threshold; a layer matches when `threshold > probe`;
- 19 layers also have two side thresholds; the side selector's bit 6 chooses
  `layer_sides` or `layer_sides_alt`, and the side matches when
  `sideThreshold <= probe`;
- `ignore_ranges` counts every set layer flag without threshold tests.

`count_matching_layers` returns the number of matches, not a boolean.
`layers_collide` is the contact-pass integration: two bodies collide when either
has no layer flags or at least one layer matches the other body's
`layer_probe`. Tests cover threshold equality, side selection, ignore-ranges and
both directions of the pair predicate.

## Open

- Quadtree node capacity and split shape.
- Exact mass split for two dynamic bodies.
- Exact cache epoch layout (the domain uses a dirty flag and tick epoch).
