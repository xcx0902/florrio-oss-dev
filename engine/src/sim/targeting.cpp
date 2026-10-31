#include "engine/model/entity_relations.hpp"
#include "engine/sim/ai.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/species_attacks.hpp"
#include "engine/sim/spatial.hpp"
#include <algorithm>
#include <cmath>
#include <vector>

#include "ai_internal.hpp"
namespace engine {
using namespace ai_detail;


bool same_controlling_root(const World& world, EntityHandle first, EntityHandle second) {
  const EntityHandle a = controlling_root(world, first);
  const EntityHandle b = controlling_root(world, second);
  const Entity* root_a = world.entities().get(a);
  const Entity* root_b = world.entities().get(b);
  if (root_a == nullptr || root_b == nullptr) return false;
  if (a == b) return true;
  // The domain has no manager entity. Uncontrolled mob roots all represent
  // that one original controller; pets instead end at their owning player.
  return root_a->kind == EntityKind::kMob && root_b->kind == EntityKind::kMob;
}

bool target_eligible(const World& world, const Entity& seeker, const Entity& target) {
  if (target.health.value <= 0.0F) return false;
  if (!is_actor(target)) return false;
  const bool has_owner = seeker.owner != std::numeric_limits<std::uint32_t>::max();
  const f32 arena_scale = has_owner ? f32(-0.5F)
                                    : f32(seeker.ai.territory.value - 0.5F);
  const f32 arena_threshold = world.width() * arena_scale;
  if (target.position.x.value < arena_threshold.value) return false;
  const f32 range = seeker.ai.radius * seeker.ai.range_multiplier;
  if (distance_squared(seeker.position, target.position).value > range.value * range.value)
    return false;
  if (has_owner) {
    const Entity* owner = world.entities().get(EntityHandle{seeker.owner});
    if (owner != nullptr) {
      const f32 leash = seeker.ai.leash;
      if (distance_squared(owner->position, target.position).value > leash.value * leash.value)
        return false;
    }
  }
  return !same_controlling_root(world, seeker.handle, target.handle);
}

std::size_t alert_nearby(World& world, EntityHandle attacker, f32 radius) {
  const Entity* source = world.entities().get(attacker);
  if (source == nullptr) return 0;
  std::size_t changed = 0;
  const f32 radius_squared = radius * radius;
  // Original 196 walks the quadtree with the recovered 0,2,1,3 quadrant order.
  SpatialQuery query = SpatialQuery::from_world(world);
  std::vector<EntityHandle> candidates;
  query.query_circle(source->position, radius, candidates);
  for (const EntityHandle handle : candidates) {
    Entity* entity = world.entities().get(handle);
    if (entity == nullptr || !entity->active || entity->kind != EntityKind::kMob) continue;
    if (!entity->ai.enabled || !entity->ai.can_alert) continue;
    if (entity->ai.target.valid()) continue;
    if (distance_squared(entity->position, source->position).value > radius_squared.value)
      continue;
    if (!target_eligible(world, *entity, *source)) continue;
    entity->ai.target = attacker;
    entity->ai.returning = false;
    ++changed;
  }
  return changed;
}

EntityHandle find_target(const World& world, EntityHandle seeker_handle) {
  const SpatialQuery query = SpatialQuery::from_world(world);
  return find_target(world, query, seeker_handle);
}

EntityHandle find_target(const World& world, const SpatialQuery& query,
                         EntityHandle seeker_handle) {
  const Entity* seeker = world.entities().get(seeker_handle);
  if (seeker == nullptr || !seeker->ai.enabled) return EntityHandle{};
  const f32 search_radius = seeker->ai.radius;
  const f32 radius = search_radius;
  // Aabb is min/max (not origin+size): the query square is centre +/- radius.
  const Aabb area{seeker->position.x - search_radius, seeker->position.y - search_radius,
                  seeker->position.x + search_radius, seeker->position.y + search_radius};
  std::vector<EntityHandle> candidates;
  query.query_box(area, candidates);
  EntityHandle best{};
  double best_distance = 0.0;
  bool best_is_player = false;
  bool best_is_aggressive = false;
  for (const EntityHandle handle : candidates) {
    const Entity* entity = world.entities().get(handle);
    if (entity == nullptr || !entity->active || entity->handle == seeker_handle) continue;
    if (!is_actor(*entity)) continue;
    // Original 197 tests entity+224, not the ordinary +236 owner handle.
    // An Egg pet has +224 == 0 and remains an eligible actor.
    const double distance = distance_squared_d(seeker->position, entity->position);
    if (distance >= static_cast<double>(radius.value) * static_cast<double>(radius.value)) continue;
    const bool candidate_is_player = entity->kind == EntityKind::kPlayer;
    const bool candidate_is_aggressive = entity->kind == EntityKind::kMob && entity->ai.aggressive;
    if (best.valid()) {
      bool prefer = false;
      if (best_is_player && !candidate_is_player) continue;
      if (!best_is_player && candidate_is_player) prefer = true;
      else if (candidate_is_aggressive != best_is_aggressive) prefer = candidate_is_aggressive;
      if (!prefer && !(distance < best_distance)) continue;
    }
    if (!target_eligible(world, *seeker, *entity)) continue;
    best = entity->handle;
    best_distance = distance;
    best_is_player = candidate_is_player;
    best_is_aggressive = candidate_is_aggressive;
  }
  return best;
}

EntityHandle find_pickup_recipient(const World& world, EntityHandle source_handle) {
  const Entity* source = world.entities().get(source_handle);
  if (source == nullptr) return EntityHandle{};
  const Entity* player = world.entities().get(world.player());
  if (player == nullptr || player->health.value <= 0.0F) return EntityHandle{};
  const std::uint8_t capacity = world.profile().inventory_size();
  bool open = false;
  for (std::uint8_t slot = 0; slot < capacity; ++slot)
    if (world.loadout().slots()[slot].count == 0) { open = true; break; }
  if (!open) return EntityHandle{};
  // Original198 uses cached world coordinates and squared distance in f64.
  if (distance_squared_d(source->position, player->position) >= 4900.0) return EntityHandle{};
  return player->handle;
}


}
