#include "engine/sim/movement.hpp"
#include "engine/sim/bounds.hpp"
#include <cmath>

namespace engine {

namespace {

constexpr double kTau = 6.283185307179586476925286766559;
// Original integrateMovement ships 124.99999999999989, not 125.
constexpr double kDragScale = 124.99999999999989;

double wrap_angle(double value) {
  double wrapped = std::fmod(value, kTau);
  if (wrapped < -3.141592653589793) wrapped += kTau;
  if (wrapped > 3.141592653589793) wrapped -= kTau;
  return wrapped;
}

} // namespace

void integrate_positions(World& world, double seconds) {
  for (auto& entity : world.entities().entities()) {
    if (!entity.active) continue;
    entity.set_position_x(f32::from_double(static_cast<double>(entity.position.x.value)
                                         + entity.velocity.x * seconds));
    entity.set_position_y(f32::from_double(static_cast<double>(entity.position.y.value)
                                         + entity.velocity.y * seconds));
  }
}

void integrate_movement(World& world, double delta_milliseconds) {
  if (!(delta_milliseconds > 0.0)) return;
  const double damping = std::pow(0.992, delta_milliseconds);
  const double drag = kDragScale - damping * kDragScale;
  for (auto& entity : world.entities().entities()) {
    if (!entity.active) continue;
    // Original 654 integrates local angle first (transform +8 / +72).
    const f32 angular_step = f32::from_double(delta_milliseconds * 0.001
                                              * static_cast<double>(entity.angular_velocity.value));
    if (std::fabs(static_cast<double>(angular_step.value)) >= 1.1920928955078125e-07) {
      entity.angle = f32::from_double(wrap_angle(static_cast<double>(entity.angle.value)
                                                 + static_cast<double>(angular_step.value)));
    }
    const double vx = entity.velocity.x;
    const double vy = entity.velocity.y;
    // Acceleration is the original +56/+64 additive impulse: it enters the
    // displacement once, unscaled by the drag factor, and is NOT added to
    // velocity. Original 654 writes:
    //   position += drag * velocity + dt * acceleration
    //   velocity  = damping * velocity
    // Slow effects act where a behavior produces velocity (player controls
    // and AI), never inside integrateMovement.
    const double ax = entity.acceleration.x;
    const double ay = entity.acceleration.y;
    // Original 654 evaluates (drag * velocity + dt * acceleration) first and
    // adds the local position last; the grouping is observable at f32 ULP
    // level for positions in the tens of thousands.
    const double x = (drag * vx + delta_milliseconds * ax)
                   + static_cast<double>(entity.position.x.value);
    const double y = (drag * vy + delta_milliseconds * ay)
                   + static_cast<double>(entity.position.y.value);
    entity.set_position_x(f32::from_double(x));
    entity.set_position_y(f32::from_double(y));
    double next_vx = damping * vx;
    double next_vy = damping * vy;
    if (entity.kind == EntityKind::kPlayer || entity.kind == EntityKind::kMob) {
      const double half_width = static_cast<double>(world.width().value) * 0.5;
      const double half_height = static_cast<double>(world.height().value) * 0.5;
      const double radius = static_cast<double>(entity.collision_radius.value);
      const double limit_x = half_width - radius;
      const double limit_y = half_height - radius;
      if (entity.position.x.value > limit_x) { entity.set_position_x(f32::from_double(limit_x)); next_vx = 0.0; }
      if (entity.position.x.value < -limit_x) { entity.set_position_x(f32::from_double(-limit_x)); next_vx = 0.0; }
      if (entity.position.y.value > limit_y) { entity.set_position_y(f32::from_double(limit_y)); next_vy = 0.0; }
      if (entity.position.y.value < -limit_y) { entity.set_position_y(f32::from_double(-limit_y)); next_vy = 0.0; }
    }
    if (std::fabs(next_vx) < 2.220446049250313e-16) next_vx = 0.0;
    if (std::fabs(next_vy) < 2.220446049250313e-16) next_vy = 0.0;
    entity.velocity.x = next_vx;
    entity.velocity.y = next_vy;
    // Original 167 caches a union including attached children; any transform
    // change invalidates the entity and its owner chain.
    invalidate_bounds(world, entity.handle);
  }
}


namespace {

double linked_angle(double dy, double dx) {
  return wrap_angle(std::atan2(dy, dx));
}

void constrain_entity(World& world, EntityHandle handle) {
  Entity* entity = world.entities().get(handle);
  if (entity == nullptr || !entity->active) return;
  // Original 401 skips only when the dedicated +56 parent link is live. The
  // shipped centipede/ant-hole records leave +56 at zero (the owner at +236 is
  // a different field), so no domain skip is needed here.
  const EntityHandle predecessor = entity->ai.predecessor;
  if (predecessor.valid()) {
    Entity* parent = world.entities().get(predecessor);
    if (parent != nullptr) {
      // Original 401: f32(f32(own radius + 0.0001) + predecessor radius). The
      // intermediate f32 rounding is observable in the clamped position.
      const f32 own_plus = f32(entity->collision_radius.value + 0.0001F);
      const f32 link_radius = f32(own_plus.value + parent->collision_radius.value);
      const double distance = static_cast<double>(link_radius.value);
      double dx = static_cast<double>(parent->position.x.value)
                - static_cast<double>(entity->position.x.value);
      double dy = static_cast<double>(parent->position.y.value)
                - static_cast<double>(entity->position.y.value);
      // Original 401 first writes the facing angle from the unclamped vector.
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
  for (const EntityHandle child : children) constrain_entity(world, child);
}

} // namespace

void constrain_linked_entities(World& world) {
  // Only chain roots are entry points: a segment with a live predecessor is
  // reached recursively from its head. Ant Hole children have no predecessor
  // link and are not affected by original 401.
  std::vector<EntityHandle> roots;
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active) continue;
    if (entity.children.empty()) continue;
    if (entity.ai.predecessor.valid()) continue;
    if (entity.type_id != 15U && entity.type_id != 16U && entity.type_id != 17U
        && entity.type_id != 18U) continue;
    roots.push_back(entity.handle);
  }
  for (const EntityHandle root : roots) constrain_entity(world, root);
}

std::uint32_t debug_linked_roots(const World& world) {
  std::uint32_t count = 0;
  for (const auto& entity : world.entities().entities())
    if (entity.active && !entity.children.empty() && !entity.ai.predecessor.valid()
        && (entity.type_id == 15U || entity.type_id == 16U || entity.type_id == 17U
            || entity.type_id == 18U)) ++count;
  return count;
}

std::uint32_t debug_linked_segments(const World& world) {
  std::uint32_t count = 0;
  for (const auto& entity : world.entities().entities())
    if (entity.active && entity.ai.predecessor.valid()) ++count;
  return count;
}

} // namespace engine
