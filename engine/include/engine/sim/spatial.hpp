#pragma once
#include "engine/core/vec2.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/quadtree.hpp"
#include <cstdint>
#include <unordered_map>
#include <vector>

namespace engine {

/** Broad-phase body geometry. The occupied predicate walks these bodies; a
 * linear scan and a quadtree rectangle query answer the same question, and the
 * spawn retry loop only needs the predicate. */
struct CollisionBody {
  Vec2 position;                  // transform centre
  f32 radius;                     // collision radius
  std::uint8_t world_flags = 0;   // world-level flags
  std::uint8_t entity_flags = 0;  // entity-level flags
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

  /** Spawn rejection: true when an existing body is inside the 600x600
   * half-extent of the candidate position. */
  [[nodiscard]] bool occupied(const SpawnPosition& candidate, f32 half_extent = f32(600.0F)) const;

  /** Quadtree rectangle query in the children order 0, 2, 1, 3. */
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

/** Spawn one band entry with the shared population factory (see
 * `spawn_band_entity`). */
template <typename Occupied>
[[nodiscard]] EntityHandle spawn_from_band(World& world, const SpawnTable& table, std::uint8_t band,
                                           Occupied&& occupied) {
  return table.spawn_from_band(
      world, band, std::forward<Occupied>(occupied),
      [&world](const SpawnBandEntry& entry, const SpawnPosition& position) {
        return spawn_band_entity(world, entry, position);
      });
}

/** Spawn using the live SpatialQuery as the occupied predicate and a caller
 * supplied factory. */
template <typename Factory>
[[nodiscard]] EntityHandle spawn_from_band(World& world, const SpawnTable& table, std::uint8_t band,
                                           const SpatialQuery& query, Factory&& factory) {
  return table.spawn_from_band(
      world, band, [&query](const SpawnPosition& position) { return query.occupied(position); },
      std::forward<Factory>(factory));
}

}  // namespace engine
