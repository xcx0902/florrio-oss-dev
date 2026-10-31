#include "engine/core/perf.hpp"
#include "engine/sim/combat.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/collision_filter.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/quadtree.hpp"
#include "engine/sim/progression.hpp"
#include "engine/sim/player.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace engine {
namespace {
f32 level_damage_scale(const World& world, EntityHandle first, EntityHandle second) {
  const Entity* a = world.entities().get(first);
  const Entity* b = world.entities().get(second);
  if (a == nullptr || b == nullptr) return f32(1.0F);
  if (a->kind != EntityKind::kPlayer || b->kind != EntityKind::kPlayer) return f32(1.0F);
  const std::uint8_t first_level = world.profile().level();
  const std::uint8_t second_level = world.profile().level();
  const std::uint8_t highest = first_level > second_level ? first_level : second_level;
  const double value = static_cast<double>(static_cast<int>(highest) - 5) * 0.2;
  return f32::from_double(std::min(1.0, std::max(0.0, value)));
}
}
namespace {
void collect_contact_bodies(World& world) {
  auto& bodies = world.collision().bodies;
  bodies.clear();
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (auto& entity : slots) { PERF_ADD(visits, 1);
      if (!entity.active || entity.health.value <= 0.0F || entity.kind == EntityKind::kDrop || entity.collision_radius.value <= 0.0F) continue;
      bodies.push_back({entity.handle,&entity});
    }
  });
}
}
void update_contact_tree(World& world) {
  collect_contact_bodies(world);
  auto& context = world.collision();
  const auto& bodies = context.bodies;
  context.prepared = true;
  auto box = [](const Entity& entity) {
    const float radius = entity.collision_radius.value;
    return Aabb{f32(entity.position.x.value - radius),
                f32(entity.position.y.value - radius),
                f32(entity.position.x.value + radius),
                f32(entity.position.y.value + radius)};
  };
  auto& present = context.present;
  for (auto slot : context.touched) present[slot] = false;
  context.touched.clear();
  for (const auto& body : bodies) {
    const auto slot = body.handle.index();
    present[slot] = true; context.touched.push_back(slot);
  }
  QuadTree& tree = world.collision().tree;
  const bool rebuild = world.collision().tick == std::numeric_limits<std::uint64_t>::max() || world.tick() != world.collision().tick + 1U;
  if (rebuild) {
    tree.clear();
    for (const auto& body : bodies) {
      const Entity* entity = body.entity;
      const std::uint32_t slot = entity->handle.index();
      if (slot < kEntitySlotCount) tree.insert(slot, box(*entity));
    }
  } else {
    tree.remove_missing(present);
    for (const auto& body : bodies) {
      const Entity* entity = body.entity;
      const std::uint32_t slot = entity->handle.index();
      if (slot < kEntitySlotCount) tree.update(slot, box(*entity));
    }
  }
  tree.compact();
  world.collision().tick = world.tick();
  world.note_quadtree_update();
}

std::size_t resolve_contacts(World& world) {
  auto& context = world.collision();
  if (context.tick != world.tick()) update_contact_tree(world);
  else if (!context.prepared) collect_contact_bodies(world);
  context.prepared = false;
  const auto& bodies = context.bodies;
  std::size_t contacts = 0;
  // The original broad phase is a loose quadtree: a body descends into a
  // child only when its AABB is fully contained by that child, otherwise it
  // stays at the parent. The tree is traversed in node order, so a body's own
  // cell is visited before its siblings. This is the candidate order used by
  // the product contact strategy 6.
  auto body_box = [](const Entity& entity) {
    const float radius = entity.collision_radius.value;
    return Aabb{f32(entity.position.x.value - radius),
                f32(entity.position.y.value - radius),
                f32(entity.position.x.value + radius),
                f32(entity.position.y.value + radius)};
  };
  if (world.collision().tick != world.tick())
    update_contact_tree(world);
  QuadTree& tree = world.collision().tree;

  auto& body_by_slot = context.body_by_slot;
  if (++context.stamp == 0) { context.stamps.fill(0); context.stamp = 1; }
  for (std::size_t index = 0; index < bodies.size(); ++index) {
    const std::uint32_t slot = bodies[index].handle.index();
    if (slot >= kEntitySlotCount) continue;
    body_by_slot[slot] = static_cast<int>(index);
    context.stamps[slot] = context.stamp;
  }
  auto& candidates = context.candidates;
  auto& pool = context.candidate_pool; pool.clear();
  auto& offsets = context.offsets; offsets.clear(); offsets.push_back(0);
  for (std::size_t first = 0; first < bodies.size(); ++first) {
    tree.query(body_box(*bodies[first].entity), candidates);

    for (const std::size_t candidate : candidates) {
      if (candidate >= kEntitySlotCount) continue;
      if (context.stamps[candidate] != context.stamp) continue;
      const int mapped = body_by_slot[candidate];
      if (mapped >= 0 && static_cast<std::size_t>(mapped) != first)
        pool.push_back(static_cast<std::size_t>(mapped));
    }
    offsets.push_back(pool.size());
  }

  for (std::size_t first = 0; first < bodies.size(); ++first) {
    // The original outer body loop checks health immediately before querying;
    // the body may have died after the initial broadphase snapshot.
    if (!bodies[first].entity->active || bodies[first].entity->health.value <= 0.0F) continue;
    for (std::size_t cursor = offsets[first]; cursor < offsets[first + 1]; ++cursor) {
      const std::size_t second = pool[cursor];
      if (second <= first) continue;
      Entity& a = *bodies[first].entity;
      Entity& b = *bodies[second].entity;
      if (!a.active || !b.active || b.health.value <= 0.0F) continue;
      if (a.kind == EntityKind::kPetal && b.kind == EntityKind::kPetal) continue;
      if (a.kind == EntityKind::kDrop || b.kind == EntityKind::kDrop) continue;
      if (a.kind != EntityKind::kPlayer && a.kind != EntityKind::kMob && a.kind != EntityKind::kPetal && a.kind != EntityKind::kProjectile) continue;
      if (b.kind != EntityKind::kPlayer && b.kind != EntityKind::kMob && b.kind != EntityKind::kPetal && b.kind != EntityKind::kProjectile) continue;
      const bool a_owned = a.owner != std::numeric_limits<std::uint32_t>::max();
      const bool b_owned = b.owner != std::numeric_limits<std::uint32_t>::max();
      if (a_owned && b_owned && a.owner == b.owner) continue;
      if (a.kind == EntityKind::kPlayer && b_owned && EntityHandle{b.owner} == a.handle) continue;
      if (b.kind == EntityKind::kPlayer && a_owned && EntityHandle{a.owner} == b.handle) continue;
      // Original 390 skips the whole pair when either physics record has the
      // +50 one-shot marker.
      if (a.physics_flag50 || b.physics_flag50) continue;
      if (!layers_collide(a, b)) continue;
      const double dx = static_cast<double>(b.position.x.value) - static_cast<double>(a.position.x.value);
      const double dy = static_cast<double>(b.position.y.value) - static_cast<double>(a.position.y.value);
      const double reach = static_cast<double>(a.collision_radius.value)
        + static_cast<double>(b.collision_radius.value);
      const double distance_squared = dx * dx + dy * dy;
      // Original 162 admits a pair with binary32 subtraction, products and
      // sum. The response (390) then uses binary64. A binary64 admission test
      // resolves extra near-tangent chain contacts and accumulates drift.
      const f32 admission_x = b.position.x - a.position.x;
      const f32 admission_y = b.position.y - a.position.y;
      const f32 admission_reach = a.collision_radius + b.collision_radius;
      if ((admission_x * admission_x + admission_y * admission_y).value
          >= (admission_reach * admission_reach).value) continue;
      const double distance = std::sqrt(distance_squared);
      double normal_x = 1.0;
      double normal_y = 0.0;
      if (distance >= 2.220446049250313e-16) {
        normal_x = dx / distance;
        normal_y = dy / distance;
      }
      const double overlap = distance_squared < reach * reach ? reach - distance : 0.0;
      // Original 162/390 response. 162 snapshots velocity + acceleration for
      // both bodies, then calls 390 twice with the pair swapped:
      //   call(p1, p2):  dot = (v1 + a1 - v2 - a2) . (p1 - p2)
      //     mass path (both physics +48 set):
      //       v1 += (p1 - p2) * (-2 * dot * eff2) / (|d|^2 * (eff1 + eff2))
      //       no position change; 162 then splits the overlap by mass.
      //     otherwise:
      //       v1 += (p1 - p2) * (-2 * dot / |d|^2)
      //       p1 is pushed fully out of p2 along the world-space normal.
      // Because both calls reuse the pre-call velocity snapshot, the pair is
      // one equal-and-opposite impulse with per-body mass weights.
      // A body whose physics +48 byte is clear (Rock, Boulder, Cactus, Ant
      // Hole) never receives contact response: the call with that body as p1
      // returns before touching velocity or position.
      const bool mass_path = a.physics_flag48 && b.physics_flag48;
      const double effective_a = static_cast<double>(a.collision_radius.value)
        * static_cast<double>(a.collision_radius.value) * static_cast<double>(a.mass.value);
      const double effective_b = static_cast<double>(b.collision_radius.value)
        * static_cast<double>(b.collision_radius.value) * static_cast<double>(b.mass.value);
      const double effective_total = effective_a + effective_b;
      const double weight_a = effective_total > 0.0 ? effective_b / effective_total : 0.5;
      const double weight_b = effective_total > 0.0 ? effective_a / effective_total : 0.5;
      const double relative_x = (a.velocity.x + a.acceleration.x)
                              - (b.velocity.x + b.acceleration.x);
      const double relative_y = (a.velocity.y + a.acceleration.y)
                              - (b.velocity.y + b.acceleration.y);
      // Preserve 390's dot/mass/division grouping before multiplying the
      // unnormalised separation. Normalising first changes the low f64 bits.
      const double dot = relative_x * -dx + relative_y * -dy;
      const double response_a = distance_squared > 0.0
        ? (mass_path ? dot * effective_b * -2.0 / (distance_squared * effective_total)
                     : dot * -2.0 / distance_squared) : 0.0;
      const double response_b = distance_squared > 0.0
        ? (mass_path ? dot * effective_a * -2.0 / (distance_squared * effective_total)
                     : dot * -2.0 / distance_squared) : 0.0;
      if (a.physics_flag48) {
        a.velocity.x = a.velocity.x + -dx * response_a;
        a.velocity.y = a.velocity.y + -dy * response_a;
        if (!mass_path && overlap > 0.0) {
          a.set_position_x(f32::from_double(static_cast<double>(a.position.x.value)
                                          - normal_x * overlap));
          a.set_position_y(f32::from_double(static_cast<double>(a.position.y.value)
                                          - normal_y * overlap));
        }
      }
      if (b.physics_flag48) {
        b.velocity.x = b.velocity.x + dx * response_b;
        b.velocity.y = b.velocity.y + dy * response_b;
        if (!mass_path) {
          // The swapped second call resolves the residual overlap left by the
          // first full push.
          const double residual_dx = static_cast<double>(b.position.x.value)
                                   - static_cast<double>(a.position.x.value);
          const double residual_dy = static_cast<double>(b.position.y.value)
                                   - static_cast<double>(a.position.y.value);
          const double residual_squared = residual_dx * residual_dx + residual_dy * residual_dy;
          if (residual_squared > 0.0 && residual_squared < reach * reach) {
            const double residual_distance = std::sqrt(residual_squared);
            const double residual_overlap = reach - residual_distance;
            b.set_position_x(f32::from_double(static_cast<double>(b.position.x.value)
                                            + residual_dx / residual_distance * residual_overlap));
            b.set_position_y(f32::from_double(static_cast<double>(b.position.y.value)
                                            + residual_dy / residual_distance * residual_overlap));
          }
        }
      }
      // Original 390 tail: a body carrying world flag 32 (the player) receives
      // a fixed 0.2 normal impulse along (self - other). The vector is the
      // pre-correction separation captured at entry, so it is evaluated from
      // dx/dy/distance rather than the already-pushed positions.
      if (distance > 0.0) {
        if ((a.world_flags & 32U) != 0U) {
          a.velocity.x += -dx * 0.2 / distance;
          a.velocity.y += -dy * 0.2 / distance;
        }
        if ((b.world_flags & 32U) != 0U) {
          b.velocity.x += dx * 0.2 / distance;
          b.velocity.y += dy * 0.2 / distance;
        }
      }

      const f32 scale = level_damage_scale(world, a.handle, b.handle);
      // Original 162 passes controlling-root equality to 390; its damage
      // tail has no attack-button, movement or AI-aggression gate. Production
      // move tick305 proves an idle Basic petal and worker Ant kill each other.
      // Ordinary mobs share the world's manager root, so their contacts remain
      // non-damaging even when the bodies have different immediate owners.
      const bool suppress_damage = same_controlling_root(world, a.handle, b.handle);
      const f32 damage_to_a = suppress_damage ? f32(0.0F) : b.contact_damage * scale;
      const f32 damage_to_b = suppress_damage ? f32(0.0F) : a.contact_damage * scale;
      const EntityHandle a_handle = a.handle;
      const EntityHandle b_handle = b.handle;
      const EntityHandle a_owner = a_owned ? EntityHandle{a.owner} : EntityHandle{};
      const EntityHandle b_owner = b_owned ? EntityHandle{b.owner} : EntityHandle{};
      if (!suppress_damage && a.kind == EntityKind::kPetal) on_petal_hit(world, a_handle, b_handle, a_owner);
      if (!suppress_damage && b.kind == EntityKind::kPetal) on_petal_hit(world, b_handle, a_handle, b_owner);
      if (damage_to_a.value > 0.0F) (void)damage_entity(world, a_handle, damage_to_a, b_handle);
      if (damage_to_b.value > 0.0F) (void)damage_entity(world, b_handle, damage_to_b, a_handle);
      if (a.kind == EntityKind::kPetal) on_petal_incoming_hit(world, a_handle, b_handle);
      if (b.kind == EntityKind::kPetal) on_petal_incoming_hit(world, b_handle, a_handle);
      if (mass_path && overlap > 0.0) {
        // Original 390 applies damage/death (including spawning loot) before
        // returning to 162 for this split. A newly created drop must retain
        // the dying body's pre-separation position, not its final corpse pose.
        a.set_position_x(f32::from_double(static_cast<double>(a.position.x.value)
                                        - normal_x * overlap * weight_a));
        a.set_position_y(f32::from_double(static_cast<double>(a.position.y.value)
                                        - normal_y * overlap * weight_a));
        b.set_position_x(f32::from_double(static_cast<double>(b.position.x.value)
                                        + normal_x * overlap * weight_b));
        b.set_position_y(f32::from_double(static_cast<double>(b.position.y.value)
                                        + normal_y * overlap * weight_b));
      }
      ++contacts;
      PERF_ADD(contacts, 1);
      // The contact query returns 1 when its querying body dies,
      // aborting the remaining node/child traversal after this complete pair.
      if (a.health.value <= 0.0F) break;
    }
  }
  return contacts;
}

}
