#include "engine/sim/species_attacks.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/model/entity_relations.hpp"
#include <cmath>
#include <limits>

namespace engine {

namespace species_debug {
std::uint32_t stinger_spawns = 0;
}  // namespace species_debug

namespace {

constexpr double kTwoPi = 6.283185307179586476925286766559;
// The launch writes a persistent acceleration, an initial velocity, and an
// opposite recoil on the firing body.
constexpr float kLaunchVelocity = 1.4F;
constexpr float kLaunchAcceleration = 0.6F;
constexpr float kRecoil = -0.4F;
constexpr float kSpawnOffset = 20.0F;
constexpr double kStingerLifetimeMs = 2000.0;
constexpr float kStingerDamage = 10.0F;

}  // namespace

EntityHandle spawn_hornet_stinger(World& world, EntityHandle hornet_handle,
                                  EntityHandle target_handle) {
  Entity* hornet = world.entities().get(hornet_handle);
  Entity* target = world.entities().get(target_handle);
  if (hornet == nullptr || target == nullptr) {
    return EntityHandle{};
  }
  if (hornet->health.value <= 0.0F || target->health.value <= 0.0F) {
    return EntityHandle{};
  }

  // The target only gates the launch. The stinger launches along the body's
  // recorded facing, which AI has already updated this tick.
  const double angle = static_cast<double>(hornet->angle.value);
  const f32 direction_x = f32::from_double(std::cos(angle));
  const f32 direction_y = f32::from_double(std::sin(angle));
  const f32 spawn_x =
      f32::from_double(static_cast<double>(hornet->position.x.value) -
                       static_cast<double>(f32(direction_x.value * kSpawnOffset).value));
  const f32 spawn_y =
      f32::from_double(static_cast<double>(hornet->position.y.value) -
                       static_cast<double>(f32(direction_y.value * kSpawnOffset).value));
  hornet->velocity.x += static_cast<double>(f32(direction_x.value * kRecoil).value);
  hornet->velocity.y += static_cast<double>(f32(direction_y.value * kRecoil).value);

  const EntityHandle stinger = spawn_entity(world, EntityKind::kProjectile, hornet->type_id,
                                            Vec2{spawn_x, spawn_y}, f32(11.0F));
  if (!stinger.valid()) {
    return EntityHandle{};
  }
  Entity* entity = world.entities().get(stinger);
  if (entity == nullptr) {
    return EntityHandle{};
  }
  entity->angle = f32::from_double(std::fmod(angle, kTwoPi));
  entity->collision_radius = f32(11.0F);
  entity->health = f32(10.0F);
  entity->max_health = f32(10.0F);
  entity->contact_damage = f32(kStingerDamage);
  inherit_entity_owner(world, stinger, hornet_handle);
  entity->lifetime_remaining_ms = kStingerLifetimeMs;
  entity->velocity = Vec2d{static_cast<double>(f32(direction_x.value * kLaunchVelocity).value),
                           static_cast<double>(f32(direction_y.value * kLaunchVelocity).value)};
  entity->acceleration =
      Vec2d{static_cast<double>(f32(direction_x.value * kLaunchAcceleration).value),
            static_cast<double>(f32(direction_y.value * kLaunchAcceleration).value)};
  entity->bounds_dirty = true;
  ++species_debug::stinger_spawns;
  return stinger;
}

bool dispatch_attack(World& world, EntityHandle attacker_handle) {
  Entity* attacker = world.entities().get(attacker_handle);
  if (attacker == nullptr || !attacker->active) {
    return false;
  }
  switch (attacker->ai.attack) {
    case AttackBehavior::kNone:
      return false;
    case AttackBehavior::kHornetStinger:
      if (!attacker->ai.target.valid()) {
        return false;
      }
      return spawn_hornet_stinger(world, attacker_handle, attacker->ai.target).valid();
  }
  return false;
}

}  // namespace engine
