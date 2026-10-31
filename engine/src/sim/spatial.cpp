#include "engine/core/perf.hpp"
#include "engine/sim/spatial.hpp"
#include <algorithm>

namespace engine {

SpatialQuery::SpatialQuery()
    : SpatialQuery(Aabb{f32(-25000.0F), f32(-2000.0F), f32(25000.0F), f32(2000.0F)}) {}

SpatialQuery::SpatialQuery(const Aabb& bounds)
    : index_(bounds, 8, 6), max_radius_(f32(0.0F)) {}

void SpatialQuery::add(const CollisionBody& body) {
  handle_index_[body.handle.raw] = bodies_.size();
  bodies_.push_back(body);
  const std::size_t id = bodies_.size() - 1;
  index_.insert(id, Aabb{body.position.x - body.radius, body.position.y - body.radius,
                         body.position.x + body.radius, body.position.y + body.radius});
  if (body.radius > max_radius_) max_radius_ = body.radius;
}

void SpatialQuery::clear() {
  bodies_.clear();
  handle_index_.clear();
  index_.clear();
  max_radius_ = f32(0.0F);
}

void SpatialQuery::rebuild() {
  index_.clear();
  handle_index_.clear();
  max_radius_ = f32(0.0F);
  for (std::size_t id = 0; id < bodies_.size(); ++id) {
    const auto& body = bodies_[id];
    handle_index_[body.handle.raw] = id;
    index_.insert(id, Aabb{body.position.x - body.radius, body.position.y - body.radius,
                           body.position.x + body.radius, body.position.y + body.radius});
    if (body.radius > max_radius_) max_radius_ = body.radius;
  }
}

SpatialQuery SpatialQuery::from_world(const World& world) {
  const f32 half_width = f32::from_double(static_cast<double>(world.width().value) * 0.5);
  const f32 half_height = f32::from_double(static_cast<double>(world.height().value) * 0.5);
  PERF_ADD(builds, 1);
  SpatialQuery query(Aabb{f32(0.0F) - half_width, f32(0.0F) - half_height, half_width, half_height});
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (const auto& entity : slots) { PERF_ADD(visits, 1);
      if (!entity.active) continue;
      query.add({entity.position, entity.radius, entity.world_flags, entity.entity_flags,
                 entity.handle});
    }
  });
  return query;
}

void SpatialQuery::query_box(const Aabb& area, std::vector<EntityHandle>& out) const {
  out.clear();
  auto& candidates = candidates_;
  index_.query(area, candidates);
  out.reserve(candidates.size());
  for (const std::size_t index : candidates) {
    if (index >= bodies_.size()) continue;
    const CollisionBody& body = bodies_[index];
    const f32 min_x = body.position.x - body.radius;
    const f32 min_y = body.position.y - body.radius;
    const f32 max_x = body.position.x + body.radius;
    const f32 max_y = body.position.y + body.radius;
    if (area.min_x > max_x || area.max_x < min_x) continue;
    if (area.min_y > max_y || area.max_y < min_y) continue;
    out.push_back(body.handle);
  }
}

void SpatialQuery::query_circle(Vec2 center, f32 radius, std::vector<EntityHandle>& out) const {
  const f32 slack = radius + max_radius_;
  query_box(Aabb{center.x - slack, center.y - slack, center.x + slack, center.y + slack}, out);
  const f32 radius_squared = radius * radius;
  out.erase(std::remove_if(out.begin(), out.end(), [&](EntityHandle handle) {
    const auto found = handle_index_.find(handle.raw);
    if (found == handle_index_.end() || found->second >= bodies_.size()) return true;
    const CollisionBody& body = bodies_[found->second];
    const f32 dx = body.position.x - center.x;
    const f32 dy = body.position.y - center.y;
    return (dx * dx + dy * dy).value > radius_squared.value;
  }), out.end());
}

bool SpatialQuery::occupied(const SpawnPosition& candidate, f32 half_extent) const {
  const f32 slack = half_extent + max_radius_;
  const Aabb area{candidate.x - slack, candidate.y - slack,
                  candidate.x + slack, candidate.y + slack};
  auto& candidates = candidates_;
  index_.query(area, candidates);
  for (const std::size_t index : candidates) {
    const auto& body = bodies_[index];
    const f32 min_x = body.position.x - body.radius;
    const f32 min_y = body.position.y - body.radius;
    const f32 width = body.radius + body.radius;
    const f32 max_x = min_x + width;
    const f32 max_y = min_y + width;

    if (area.min_x > max_x) continue;
    if (area.max_x < min_x) continue;
    if (area.min_y > max_y) continue;
    if (area.max_y < min_y) continue;

    f32 threshold(600.0F);
    if ((body.world_flags & 32U) == 0U) {
      threshold = f32(100.0F);
      if ((body.entity_flags & 32U) == 0U) continue;
    }
    const f32 dx = body.position.x - candidate.x;
    const f32 dy = body.position.y - candidate.y;
    const f32 limit = threshold + body.radius;
    if ((dx * dx + dy * dy) < (limit * limit)) return true;
  }
  return false;
}

} // namespace engine
