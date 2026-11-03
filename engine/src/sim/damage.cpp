#include "engine/sim/damage.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/effects.hpp"
#include "engine/model/entity_relations.hpp"

namespace engine {

f32 apply_damage(Entity& entity, f32 amount) {
  if (amount.value < 0.0F) {
    return entity.health;
  }
  entity.health = entity.health - amount;
  if (entity.health.value < 0.0F) {
    entity.health = f32(0.0F);
  }
  return entity.health;
}

f32 heal_entity(Entity& entity, f32 amount) {
  if (entity.health.value <= 0.0F) {
    return entity.health;
  }
  entity.health += amount;
  if (entity.health.value > entity.max_health.value) {
    entity.health = entity.max_health;
  }
  if (entity.health.value < 0.0F) {
    entity.health = f32(0.0F);
  }
  return entity.health;
}

f32 heal_entity(World& world, EntityHandle target, f32 amount) {
  Entity* entity = world.entities().get(target);
  if (entity == nullptr) {
    return f32(0.0F);
  }
  if (entity->health.value <= 0.0F) {
    return entity->health;
  }
  if (blocks_healing(*entity)) {
    return entity->health;
  }
  return heal_entity(*entity, amount);
}

DamageResult damage_entity(World& world, EntityHandle target, f32 amount, EntityHandle attacker,
                           std::uint16_t options) {
  return damage_entity_from_source(world, target, amount, damage_source(world, attacker), options);
}

DamageResult damage_entity_from_source(World& world, EntityHandle target, f32 amount,
                                       const DamageSource& source, std::uint16_t options) {
  Entity* entity = world.entities().get(target);
  if (entity == nullptr) {
    return {f32(0.0F), false};
  }
  if (entity->health.value <= 0.0F) {
    return {entity->health, false};
  }
  if (amount.value < 0.0F) {
    return {entity->health, false};
  }
  const EntityHandle attacker = source.entity;
  if (attacker.valid()) {
    entity->last_attacker = attacker;
    entity->last_damage_source = source;
  }
  entity->health -= amount;
  if (entity->health.value < 0.0F) {
    entity->health = f32(0.0F);
  }
  const bool died = entity->health.value <= 0.0F;
  (void)alert_to_attacker(world, target, attacker);
  // Original43's low option byte suppresses notification only. Health,
  // attacker propagation and death still run; the high byte is independent.
  if (amount.value > 0.0F && (options & 0xFFU) == 0U) {
    entity->hit_epoch = static_cast<std::uint32_t>(world.tick() + 1U);
    world.record_hit(target, attacker, amount, entity->health, &source);
  }
  if (died) {
    kill_entity_from_source(world, target, source);
  }
  return {entity->health, died};
}

}  // namespace engine
