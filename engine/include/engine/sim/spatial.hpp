#pragma once
#include "engine/core/vec2.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/quadtree.hpp"
#include <cstdint>
#include <unordered_map>
#include <vector>

namespace engine {

/** Leaf geometry checked by original function 161. The original walks a
 * quadtree; a linear scan over the same bodies returns the same occupied
 * predicate, which is all the spawn retry loop needs. */
struct CollisionBody {
  Vec2 position;      // transform center (f32 demoted from the original f64)
  f32 radius;         // physics +8
  std::uint8_t world_flags = 0;  // entity +95
  std::uint8_t entity_flags = 0; // entity +93
  EntityHandle handle{};
};

class SpatialQuery {
 public:
  /** Default index bounds cover the default 50000x4000 arena. */
  SpatialQuery();
  explicit SpatialQuery(const Aabb& bounds);

  /** Collect active entities. Entity flags are copied verbatim. The index is
   * sized to the current world so far-away spawn/AI/area queries are not
   * clipped by a fixed origin-centred box. */
  [[nodiscard]] static SpatialQuery from_world(const World& world);

  void add(const CollisionBody& body);
  void clear();
  /** Rebuild the broad-phase index after mutating bodies directly. */
  void rebuild();
  [[nodiscard]] std::size_t size() const { return bodies_.size(); }

  /** The original 600x600 half-extent spawn query. */
  [[nodiscard]] bool occupied(const SpawnPosition& candidate, f32 half_extent = f32(600.0F)) const;

  /** Quadtree rectangle query in the recovered 0,2,1,3 traversal order. */
  void query_box(const Aabb& area, std::vector<EntityHandle>& out) const;
  /** Circle query: AABB candidates followed by the exact radius predicate. */
  void query_circle(Vec2 center, f32 radius, std::vector<EntityHandle>& out) const;

 private:
  std::vector<CollisionBody> bodies_;
  std::unordered_map<std::uint32_t, std::size_t> handle_index_;
  QuadTree index_;
  f32 max_radius_;
  mutable std::vector<std::size_t> candidates_;
};

/** Spawn a band with component-drop defaults: Rock/Boulder use the dynamic
 * pre-draw path, other species use the catalog defaults. */
template <typename Occupied>
[[nodiscard]] EntityHandle spawn_from_band_with_component_draws(World& world, const SpawnTable& table,
                                                       std::uint8_t band, Occupied&& occupied) {
  return table.spawn_from_band(world, band, std::forward<Occupied>(occupied),
    [&world](const SpawnBandEntry& entry, const SpawnPosition& position) {
      if (entry.entity_type == 1 || entry.entity_type == 2) {
        return spawn_rock_with_component_draws(world, Vec2(position.x, position.y), entry.entity_type == 2, world.random());
      }
      if (entry.entity_type == 3) {
        return spawn_cactus_with_component_draws(world, Vec2(position.x, position.y), world.random());
      }
      return spawn_entity_from_defaults(world, EntityKind::kMob, entry.entity_type,
        Vec2(position.x, position.y));
    });
}

/** Spawn using the live SpatialQuery as the occupied predicate. */
template <typename Factory>
[[nodiscard]] EntityHandle spawn_from_band(World& world, const SpawnTable& table, std::uint8_t band,
                                           const SpatialQuery& query, Factory&& factory) {
  return table.spawn_from_band(world, band,
    [&query](const SpawnPosition& position) { return query.occupied(position); },
    std::forward<Factory>(factory));
}

} // namespace engine
