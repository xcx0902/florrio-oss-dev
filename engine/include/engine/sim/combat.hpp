#pragma once
#include "engine/model/world.hpp"

namespace engine {

struct DamageResult {
  f32 remaining;
  bool died;
};

/** Apply damage to one entity. When health reaches zero the entity's death
 * domain runs once: petals start slot recharge, mobs roll loot and award
 * experience to the attacker's owner, and players retain loot. */
DamageResult damage_entity(World& world, EntityHandle target, f32 amount,
                           EntityHandle attacker = EntityHandle{}, std::uint16_t options = 0U);
DamageResult damage_entity_from_source(World&, EntityHandle target, f32 amount, const DamageSource&,
                                       std::uint16_t options = 0U);

/** Contact pass: overlapping non-allied bodies push apart and exchange their
 * contact damage. Both orderings of a pair are resolved in one step. */
void update_contact_tree(World& world);
std::size_t resolve_contacts(World& world);

/** Run the death domain without applying damage (for direct tests). */
void kill_entity(World& world, EntityHandle target, EntityHandle attacker = EntityHandle{});
void kill_entity_from_source(World&, EntityHandle target, const DamageSource&);

/** Healing clamp: dead entities are not healed, live health is clamped to
 * [0, maximum]. Returns the new health. */
f32 heal_entity(Entity& entity, f32 amount);

/** Healing through the world also honors healing-suppression effects. */
f32 heal_entity(World& world, EntityHandle target, f32 amount);

/** Attacker propagation: nearby untargeted AI acquire the attacker. */
std::size_t alert_to_attacker(World& world, EntityHandle target, EntityHandle attacker);

}  // namespace engine
