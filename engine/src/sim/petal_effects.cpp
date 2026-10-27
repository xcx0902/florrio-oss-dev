#include "engine/sim/petal_effects.hpp"
#include "engine/catalog/petal_combat.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/petals.hpp"
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
//   29/30 WebR2/R4 slot6   slow payload (50 -> 0.5 multiplier here)
constexpr bool effect_for_type(std::uint16_t type, PetalEffectSpec& spec) {
  switch (type) {
    case 8: spec = {EffectType::kPoison, 20000.0 / 3.0, false}; return true;
    case 12: spec = {EffectType::kPoison, 8000.0 / 9.0, false}; return true;
    case 20: spec = {EffectType::kHealBlock, 10000.0, false}; return true;
    case 21: spec = {EffectType::kPoison, 20000.0 / 3.0, false}; return true;
    case 29: spec = {EffectType::kSlow, 4000.0, false}; return true;
    case 30: spec = {EffectType::kSlow, 4000.0, false}; return true;
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
    entity->behavior_cooldown_ms = 250.0;
    children.push_back(child);
  }
  if (!children.empty()) {
    // f32(f32((next - 1) >>> 0) * f32(2*pi / 2^31)) from original 217.
    const f32 draw = f32(static_cast<float>(world.random().next() - 1U));
    const f32 phase = f32(draw.value * f32(kTau / 2147483648.0).value);
    const f32 step = f32(kTau / static_cast<double>(children.size()));
    const f32 spawn_radius = f32(std::sqrt(72.0));
    f32 angle = phase;
    for (const EntityHandle handle : children) {
      angle = f32(step.value + angle.value);
      Entity* child = world.entities().get(handle);
      if (child == nullptr) continue;
      const f32 offset_x = f32(std::cos(static_cast<double>(angle.value)) * spawn_radius.value);
      const f32 offset_y = f32(std::sin(static_cast<double>(angle.value)) * spawn_radius.value);
      child->set_position_x(f32(offset_x.value + position.x.value));
      child->set_position_y(f32(offset_y.value + position.y.value));
      child->bounds_dirty = true;
    }
    world.schedule_deferred_launch(world.time_ms() + 1.0, phase, std::move(children));
  }
  // Equipped Peas own a slot/handle; temporary split children do not.
  (void)detach_petal_from_slot(world, petal_handle);
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
  entity->lifetime_remaining_ms = 4000.0;
  // spawnWeb installs the shared slow payload through original 271 with a
  // 50-unit area; the domain keeps the same ownership and radius.
  (void)add_area_effect(world, tag, f32(50.0F), EffectType::kSlow, f32(0.5F), 4000.0, tag);
}

void hatch_egg(World& world, EntityHandle petal_handle, std::uint16_t hatchling_type) {
  Entity* petal = world.entities().get(petal_handle);
  if (petal == nullptr) return;
  const Vec2 position = petal->position;
  const EntityHandle hatchling = spawn_entity_from_defaults(world, EntityKind::kMob,
                                                           hatchling_type, position);
  if (hatchling.valid()) {
    if (Entity* entity = world.entities().get(hatchling)) {
      entity->owner = petal->owner;
      entity->ai.owner = petal->owner == std::numeric_limits<std::uint32_t>::max()
        ? EntityHandle{} : EntityHandle{petal->owner};
      entity->ai.home = position;
    }
  }
  // The egg is consumed by its one-shot hatch callback. Clearing the equipped
  // handle here is what starts the slot recharge; without it the loadout sees
  // a dead instance and immediately respawns another egg every tick.
  (void)on_petal_destroyed(world, petal_handle);
  (void)world.destroy(petal_handle);
}

} // namespace

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
  if ((type == 11U || type == 12U || type == 34U) && petal->lifetime_remaining_ms <= 0.0) {
    // Temporary split children are projectiles; only the parent splits.
    split_peas(world, petal_handle, attacker);
    return;
  }
  if (type == 29U || type == 30U) {
    // Web applies its slow payload and creates the short-lived tag entity that
    // the original spawnWeb path leaves at the hit position.
    (void)apply_effect(world, target_handle, EffectType::kSlow, f32(0.5F), 4000.0, attacker);
    spawn_web_tag(world, petal_handle, target->position);
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
    if (entity.lifetime_remaining_ms > 0.0) {
      entity.lifetime_remaining_ms -= delta_milliseconds;
      if (entity.lifetime_remaining_ms <= 0.0) {
        (void)world.destroy(entity.handle);
        continue;
      }
    }
    if ((entity.type_id == 22U || entity.type_id == 23U) && entity.behavior_cooldown_ms <= 0.0) {
      const std::uint16_t hatchling = entity.type_id == 22U ? 9U : 12U;
      hatch_egg(world, entity.handle, hatchling);
    }
  }
}

} // namespace engine
