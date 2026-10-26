#include "engine/sim/bounds.hpp"
#include <algorithm>

namespace engine {

void attach_child(World& world, EntityHandle parent, EntityHandle child) {
  Entity* parent_entity = world.entities().get(parent);
  if (parent_entity == nullptr || !child.valid() || parent == child) return;
  if (std::find(parent_entity->children.begin(), parent_entity->children.end(), child)
      != parent_entity->children.end()) return;
  parent_entity->children.push_back(child);
  invalidate_bounds(world, parent);
}

void detach_child(World& world, EntityHandle parent, EntityHandle child) {
  Entity* parent_entity = world.entities().get(parent);
  if (parent_entity == nullptr) return;
  parent_entity->children.erase(
    std::remove(parent_entity->children.begin(), parent_entity->children.end(), child),
    parent_entity->children.end());
  invalidate_bounds(world, parent);
}

void invalidate_bounds(World& world, EntityHandle handle) {
  for (std::uint32_t guard = 0; guard < 32U; ++guard) {
    Entity* entity = world.entities().get(handle);
    if (entity == nullptr) return;
    entity->bounds_dirty = true;
    if (entity->owner == std::numeric_limits<std::uint32_t>::max()) return;
    handle = EntityHandle{entity->owner};
  }
}

EntityBounds collision_bounds(World& world, EntityHandle handle) {
  Entity* entity = world.entities().get(handle);
  if (entity == nullptr) return {};
  if (entity->bounds_cache.valid && !entity->bounds_dirty
      && entity->bounds_cache.epoch == world.tick()) {
    return entity->bounds_cache;
  }
  const f32 radius = entity->collision_radius.value > 0.0F
    ? entity->collision_radius : entity->radius;
  EntityBounds bounds;
  bounds.min_x = f32::from_double(static_cast<double>(entity->position.x.value)
                                  - static_cast<double>(radius.value));
  bounds.min_y = f32::from_double(static_cast<double>(entity->position.y.value)
                                  - static_cast<double>(radius.value));
  bounds.max_x = f32::from_double(static_cast<double>(entity->position.x.value)
                                  + static_cast<double>(radius.value));
  bounds.max_y = f32::from_double(static_cast<double>(entity->position.y.value)
                                  + static_cast<double>(radius.value));
  bounds.valid = true;
  bounds.epoch = world.tick();
  // The original follows entity+84; our domain list may contain stale handles
  // after a child is removed, so ignore missing entries.
  for (const EntityHandle child : entity->children) {
    const EntityBounds child_bounds = collision_bounds(world, child);
    if (!child_bounds.valid) continue;
    bounds.min_x = child_bounds.min_x.value < bounds.min_x.value ? child_bounds.min_x : bounds.min_x;
    bounds.min_y = child_bounds.min_y.value < bounds.min_y.value ? child_bounds.min_y : bounds.min_y;
    bounds.max_x = child_bounds.max_x.value > bounds.max_x.value ? child_bounds.max_x : bounds.max_x;
    bounds.max_y = child_bounds.max_y.value > bounds.max_y.value ? child_bounds.max_y : bounds.max_y;
  }
  world.note_bounds_rebuild();
  entity->bounds_cache = bounds;
  entity->bounds_dirty = false;
  return bounds;
}

} // namespace engine
