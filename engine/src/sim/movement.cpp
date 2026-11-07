#include "engine/core/perf.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/player_motion.hpp"
#include "engine/sim/bounds.hpp"
#include <cmath>

namespace engine {

namespace {

constexpr double kTau = 6.283185307179586476925286766559;

double wrap_angle(double value) {
  double wrapped = std::fmod(value, kTau);
  if (wrapped < -3.141592653589793) {
    wrapped += kTau;
  }
  if (wrapped > 3.141592653589793) {
    wrapped -= kTau;
  }
  return wrapped;
}

}  // namespace

void integrate_positions(World& world, double seconds) {
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (auto& entity : slots) {
      PERF_ADD(visits, 1);
      if (!entity.active) {
        continue;
      }
      entity.set_position_x(f32::from_double(static_cast<double>(entity.position.x.value) +
                                             entity.velocity.x * seconds));
      entity.set_position_y(f32::from_double(static_cast<double>(entity.position.y.value) +
                                             entity.velocity.y * seconds));
    }
  });
}

void integrate_movement(World& world, double delta_milliseconds) {
  if (!(delta_milliseconds > 0.0)) {
    return;
  }
  const auto rates = motion_integration(delta_milliseconds);
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (auto& entity : slots) {
      PERF_ADD(visits, 1);
      if (!entity.active) {
        continue;
      }
      // The local angle integrates first, before linear motion.
      const f32 angular_step = f32::from_double(delta_milliseconds * 0.001 *
                                                static_cast<double>(entity.angular_velocity.value));
      if (std::fabs(static_cast<double>(angular_step.value)) >= 1.1920928955078125e-07) {
        entity.angle = f32::from_double(wrap_angle(static_cast<double>(entity.angle.value) +
                                                   static_cast<double>(angular_step.value)));
      }
      MotionState motion{entity.position.x.value, entity.position.y.value, entity.velocity.x,
                         entity.velocity.y};
      MotionState unbounded;
      integrate_linear_motion(motion, entity.acceleration.x, entity.acceleration.y,
                              delta_milliseconds,
                              entity.kind == EntityKind::kPlayer || entity.kind == EntityKind::kMob,
                              static_cast<double>(world.width().value) * 0.5,
                              static_cast<double>(world.height().value) * 0.5,
                              entity.collision_radius.value, rates, &unbounded);
      // Retain intermediate writes: a clamped axis can be dirty even when its
      // final position equals the previous snapshot target.
      entity.set_position_x(f32(unbounded.x));
      entity.set_position_y(f32(unbounded.y));
      entity.set_position_x(f32(motion.x));
      entity.set_position_y(f32(motion.y));
      entity.velocity.x = motion.vx;
      entity.velocity.y = motion.vy;
      // The bounds cache includes attached children; any transform change
      // invalidates the entity and its owner chain.
      invalidate_bounds(world, entity.handle);
    }
  });
}

namespace {

double linked_angle(double dy, double dx) {
  return wrap_angle(std::atan2(dy, dx));
}

void constrain_entity(World& world, EntityHandle handle) {
  Entity* entity = world.entities().get(handle);
  if (entity == nullptr || !entity->active) {
    return;
  }
  // The constraint follows the AI predecessor link, not ordinary ownership.
  // Chain segments carry a live predecessor; Ant Hole children carry none, so
  // they are left unconstrained.
  const EntityHandle predecessor = entity->ai.predecessor;
  if (predecessor.valid()) {
    Entity* parent = world.entities().get(predecessor);
    if (parent != nullptr) {
      // Link distance: f32(f32(own radius + 0.0001) + predecessor radius). The
      // intermediate f32 rounding is observable in the clamped position.
      const f32 own_plus = f32(entity->collision_radius.value + 0.0001F);
      const f32 link_radius = f32(own_plus.value + parent->collision_radius.value);
      const double distance = static_cast<double>(link_radius.value);
      double dx = static_cast<double>(parent->position.x.value) -
                  static_cast<double>(entity->position.x.value);
      double dy = static_cast<double>(parent->position.y.value) -
                  static_cast<double>(entity->position.y.value);
      // The facing angle is written first from the unclamped vector.
      entity->angle = f32::from_double(linked_angle(dy, dx));
      const double length_squared = dx * dx + dy * dy;
      if (length_squared > distance * distance) {
        const double length = std::sqrt(length_squared);
        const double nx = length > 0.0 ? dx / length : 0.0;
        const double ny = length > 0.0 ? dy / length : 1.0;
        const double x = static_cast<double>(parent->position.x.value) - nx * distance;
        const double y = static_cast<double>(parent->position.y.value) - ny * distance;
        if (std::isfinite(x) && std::isfinite(y)) {
          entity->set_position_x(f32::from_double(x));
          entity->set_position_y(f32::from_double(y));
        }
      }
    }
  }
  const std::vector<EntityHandle> children = entity->children;
  for (const EntityHandle child : children) {
    const Entity* segment = world.entities().get(child);
    if (segment != nullptr && segment->ai.predecessor == handle) {
      constrain_entity(world, child);
    }
  }
}

}  // namespace

void constrain_linked_entities(World& world) {
  // Only chain roots are entry points: a segment with a live predecessor is
  // reached recursively from its head. Ant Hole children have no predecessor
  // link and are not constrained.
  std::vector<EntityHandle> roots;
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (const auto& entity : slots) {
      PERF_ADD(visits, 1);
      if (!entity.active) {
        continue;
      }
      if (entity.children.empty()) {
        continue;
      }
      if (entity.ai.predecessor.valid()) {
        continue;
      }
      if (!catalog::is_centipede_species(entity.species_id)) {
        continue;
      }
      roots.push_back(entity.handle);
    }
  });
  for (const EntityHandle root : roots) {
    constrain_entity(world, root);
  }
}

std::uint32_t debug_linked_roots(const World& world) {
  std::uint32_t count = 0;
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (const auto& entity : slots) {
      if (entity.active && !entity.children.empty() && !entity.ai.predecessor.valid() &&
          catalog::is_centipede_species(entity.species_id)) {
        ++count;
      }
    }
  });
  return count;
}

std::uint32_t debug_linked_segments(const World& world) {
  std::uint32_t count = 0;
  world.entities().with_ordered_slots([&](auto&& slots) {
    for (const auto& entity : slots) {
      if (entity.active && entity.ai.predecessor.valid()) {
        ++count;
      }
    }
  });
  return count;
}

}  // namespace engine
