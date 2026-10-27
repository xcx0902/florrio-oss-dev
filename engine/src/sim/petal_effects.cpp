#include "engine/sim/petal_effects.hpp"
#include "engine/catalog/petal_combat.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/combat.hpp"
#include <limits>
#include "engine/sim/petals.hpp"
#include "engine/sim/projectile_math.hpp"
#include "engine/sim/spawn.hpp"
#include <cmath>
#include <vector>

namespace engine {

namespace {

constexpr double kTau = 6.283185307179586476925286766559;

struct PetalEffectSpec {
  EffectType type;
  double duration_ms;
  bool incoming;
};

// Recovered collision callbacks:
//   8  IrisR1 slot4        poison 20000/3
//   12 PeasR3 slot4        poison 8000/9
//   20 DandelionR2 slot4   healing suppression 10000
//   21 CactusR3 slot4      poison 666.6667; slot5 incoming poison 4444.4444
//   31 HoneyR2 slot4       slow 4000
//   34 PeasR4 slot4        poison 16000/9
//   29/30 WebR2/R4 slot6   ground area with permanent 0.25 speed multiplier
constexpr bool effect_for_type(std::uint16_t type, PetalEffectSpec& spec) {
  switch (type) {
    case 8: spec = {EffectType::kPoison, 20000.0 / 3.0, false}; return true;
    case 12: spec = {EffectType::kPoison, 8000.0 / 9.0, false}; return true;
    case 20: spec = {EffectType::kHealBlock, 10000.0, false}; return true;
    case 21: spec = {EffectType::kPoison, 20000.0 / 3.0, false}; return true;
    case 31: spec = {EffectType::kSlow, 4000.0, false}; return true;
    case 34: spec = {EffectType::kPoison, 16000.0 / 9.0, false}; return true;
    default: return false;
  }
}

f32 poison_intensity(std::uint16_t type) {
  const auto* combat = Catalog::instance().petal_combat(type);
  if (combat == nullptr || !(combat->damage > 0.0F)) return f32(1.0F);
  return f32(combat->damage);
}

void split_peas(World& world, EntityHandle petal_handle, EntityHandle owner) {
  Entity* petal = world.entities().get(petal_handle);
  if (petal == nullptr) return;
  const std::uint16_t type = petal->type_id;
  const Vec2 position = petal->position;
  const auto* combat = Catalog::instance().petal_combat(type);
  if (combat == nullptr) return;
  // Original 676/681/431: every child starts on the parent, receives its petal
  // component, and is then displaced around a random-phase cross at sqrt(72).
  // The radial launch is a separate callback one millisecond later.
  std::vector<EntityHandle> children;
  children.reserve(4);
  for (std::uint32_t index = 0; index < 4U; ++index) {
    const EntityHandle child = spawn_entity(world, EntityKind::kPetal, type, position,
                                            f32(combat->drawRadius));
    if (!child.valid()) break;
    Entity* entity = world.entities().get(child);
    entity->collision_radius = f32(combat->collisionRadius);
    entity->contact_damage = f32(combat->damage);
    entity->health = f32(5.0F);
    entity->max_health = f32(5.0F);
    entity->owner = owner.valid() ? owner.raw : std::numeric_limits<std::uint32_t>::max();
    entity->lifetime_remaining_ms = 1000.0;
    entity->petal_launched = true;
    entity->petal_render_flags = type == 34U ? 3U : type == 12U ? 1U : 0U;
    children.push_back(child);
  }
  if (!children.empty()) {
    // f32(f32((next - 1) >>> 0) * f32(2*pi / 2^31)) from original 217.
    const f32 draw = f32(static_cast<float>(world.random().next() - 1U));
    const f32 phase = f32(draw.value * f32(kTau / 2147483648.0).value);
    const double step = kTau / static_cast<double>(children.size());
    const f32 spawn_radius = f32(std::sqrt(72.0));
    f32 angle = phase;
    for (const EntityHandle handle : children) {
      angle = f32(step + static_cast<double>(angle.value));
      Entity* child = world.entities().get(handle);
      if (child == nullptr) continue;
      const f32 offset_x = f32(projectile_math::peas_cos(angle.value) * spawn_radius.value);
      const f32 offset_y = f32(projectile_math::peas_sin(angle.value) * spawn_radius.value);
      child->set_position_x(f32(offset_x.value + position.x.value));
      child->set_position_y(f32(offset_y.value + position.y.value));
      child->bounds_dirty = true;
    }
    world.schedule_deferred_launch(world.time_ms() + 1.0, phase, std::move(children));
  }
  // Equipped Peas own a slot/handle; temporary split children do not.
  (void)on_petal_destroyed(world, petal_handle);
  (void)world.destroy(petal_handle);
}

void spawn_web_tag(World& world, EntityHandle petal_handle, Vec2 position) {
  const Entity* petal = world.entities().get(petal_handle);
  if (petal == nullptr) return;
  const EntityHandle owner = petal->owner == std::numeric_limits<std::uint32_t>::max()
    ? EntityHandle{} : EntityHandle{petal->owner};
  const EntityHandle tag = spawn_entity(world, EntityKind::kProjectile, petal->type_id,
                                        position, f32(50.0F));
  if (!tag.valid()) return;
  Entity* entity = world.entities().get(tag);
  if (entity == nullptr) return;
  entity->owner = owner.valid() ? owner.raw : std::numeric_limits<std::uint32_t>::max();
  entity->collision_radius = f32(50.0F);
  entity->health = f32(5.0F);
  entity->max_health = f32(5.0F);
  entity->physics_flag50 = true;
  entity->has_score_component = true;
  entity->score_epoch = static_cast<std::uint32_t>(world.tick() + 1U);
  entity->score_value = f32(0.0F);
  entity->has_tag_component = true;
  entity->entity_flags = static_cast<std::uint8_t>(entity->entity_flags | 8U);
  entity->has_effect_area = true;
  entity->world_flags = static_cast<std::uint8_t>(entity->world_flags | 128U);
  entity->packet_epoch_a = static_cast<std::uint32_t>(world.tick() + 1U);
  entity->packet_epoch_b = entity->packet_epoch_a;
  entity->lifetime_remaining_ms = 12000.0;
  // spawnWeb installs the shared slow payload through original 271 with a
  // 50-unit area; the domain keeps the same ownership and radius.
  (void)add_area_effect(world, tag, f32(50.0F), EffectType::kSlow, f32(0.25F),
                        std::numeric_limits<double>::infinity(), tag);
}

} // namespace

bool update_projectile_petal_orbit(World& world, PetalOrbitState& state,
                                    std::uint8_t buttons) {
  const auto type = state.type_id;
  const bool peas = type == 11U || type == 12U || type == 34U;
  const bool aimed = type == 10U || type == 20U;
  const bool web = type == 29U || type == 30U;
  const bool pollen = type == 19U;
  if (!peas && !aimed && !web && !pollen) return false;
  state.orbit_radius = !pollen && (buttons & 2U) != 0U ? f32(40.0F) : f32(65.0F);
  Entity* petal = world.entities().get(state.handle);
  Entity* owner = petal != nullptr ? world.entities().get(EntityHandle{petal->owner}) : nullptr;
  if (petal == nullptr || owner == nullptr || petal->health.value <= 0.0F) return false;
  const double dx = static_cast<double>(petal->position.x.value) - owner->position.x.value;
  const double dy = static_cast<double>(petal->position.y.value) - owner->position.y.value;
  if (aimed) {
    // Original 671/689 rounds atan2 before the transform's remainder setter.
    petal->angle = f32(std::fmod(static_cast<double>(f32(std::atan2(dy, dx)).value), kTau));
    petal->bounds_dirty = true;
  }
  if (state.behavior_state != 0U || (buttons & (pollen ? 3U : 1U)) == 0U
      || !(world.time_ms() - state.behavior_started_at_ms > 500.0)) return false;
  state.behavior_state = 1U;
  const EntityHandle handle = state.handle;
  if (peas) {
    split_peas(world, handle, EntityHandle{petal->owner});
    return true;
  }
  const double length = std::sqrt(dx * dx + dy * dy);
  double ux = 1.0, uy = 0.0;
  if (!(length < 2.220446049250313e-16)) { ux = dx / length; uy = dy / length; }
  if (pollen) {
    const double direction = (buttons & 1U) != 0U ? 1.0 : -1.0;
    petal->velocity.x += direction * (length < 2.220446049250313e-16 ? 0.5 : dx * 0.5 / length);
    petal->velocity.y += direction * (length < 2.220446049250313e-16 ? 0.0 : dy * 0.5 / length);
    const f32 draw = f32(static_cast<float>(world.random().next() - 1U));
    petal->lifetime_remaining_ms = f32(f32(draw.value * f32(1000.0 / 2147483648.0).value).value
                                       + 4500.0F).value;
  } else {
    const bool round = web || type == 20U;
    if (round) { ux = f32(ux).value; uy = f32(uy).value; }
    const double speed = web ? 2.2 : 1.4;
    petal->velocity.x += round ? static_cast<double>(f32(ux * speed).value) : ux * speed;
    petal->velocity.y += round ? static_cast<double>(f32(uy * speed).value) : uy * speed;
    if (aimed) {
      petal->acceleration.x += round ? static_cast<double>(f32(ux * 0.6).value) : ux * 0.6;
      petal->acceleration.y += round ? static_cast<double>(f32(uy * 0.6).value) : uy * 0.6;
    }
    petal->lifetime_remaining_ms = web ? 650.0 : 1500.0;
  }
  petal->petal_launched = true;
  // Original detach clears the handle but leaves elapsed recharge at zero;
  // updateEquippedPetals advances it from the following tick.
  (void)on_petal_destroyed(world, handle);
  return true;
}

void on_petal_death(World& world, EntityHandle handle) {
  Entity* petal = world.entities().get(handle);
  if (petal == nullptr || !petal->petal_launched
      || (petal->type_id != 29U && petal->type_id != 30U)) return;
  petal->petal_launched = false;
  spawn_web_tag(world, handle, petal->position);
}

bool consume_peas_attack(World& world, EntityHandle petal_handle, EntityHandle owner) {
  Entity* petal = world.entities().get(petal_handle);
  if (petal == nullptr) return false;
  if (petal->type_id != 11U && petal->type_id != 12U && petal->type_id != 34U) return false;
  split_peas(world, petal_handle, owner);
  return true;
}

void on_petal_hit(World& world, EntityHandle petal_handle, EntityHandle target_handle,
                  EntityHandle attacker) {
  Entity* petal = world.entities().get(petal_handle);
  Entity* target = world.entities().get(target_handle);
  if (petal == nullptr || target == nullptr) return;
  if (petal->behavior_cooldown_ms > 0.0) return;
  if (target->health.value <= 0.0F) return;
  const std::uint16_t type = petal->type_id;
  PetalEffectSpec spec{};
  if (effect_for_type(type, spec)) {
    const f32 intensity = spec.type == EffectType::kPoison ? poison_intensity(type)
      : spec.type == EffectType::kSlow ? f32(0.5F) : f32(1.0F);
    (void)apply_effect(world, target_handle, spec.type, intensity, spec.duration_ms, attacker);
    petal->behavior_cooldown_ms = 500.0;
  }

}

void on_petal_incoming_hit(World& world, EntityHandle petal_handle, EntityHandle attacker) {
  Entity* petal = world.entities().get(petal_handle);
  if (petal == nullptr || petal->type_id != 21U) return;
  if (!attacker.valid() || attacker == EntityHandle{petal->owner}) return;
  (void)apply_effect(world, attacker, EffectType::kPoison, f32(10.0F), 4444.444444444444,
                     EntityHandle{petal->owner});
}

void update_petal_behaviors(World& world, double delta_milliseconds) {
  if (!(delta_milliseconds > 0.0)) return;
  auto& entities = world.entities().entities();
  for (auto& entity : entities) {
    if (!entity.active || entity.kind != EntityKind::kPetal) continue;
    if (entity.behavior_cooldown_ms > 0.0) {
      entity.behavior_cooldown_ms -= delta_milliseconds;
      if (entity.behavior_cooldown_ms < 0.0) entity.behavior_cooldown_ms = 0.0;
    }
    if (entity.health.value <= 0.0F) continue;
    if (entity.lifetime_remaining_ms > 0.0) {
      entity.lifetime_remaining_ms = f32(entity.lifetime_remaining_ms - delta_milliseconds).value;
      if (entity.lifetime_remaining_ms <= 0.0) {
        entity.lifetime_remaining_ms = 0.0;
        (void)damage_entity(world, entity.handle, entity.health, EntityHandle{});
        continue;
      }
    }
  }
}

} // namespace engine
