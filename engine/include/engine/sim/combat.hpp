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
                           EntityHandle attacker = EntityHandle{},
                           std::uint16_t options = 0U);

/** Contact pass: overlapping non-allied bodies push apart and exchange their
 * physics +44 contact damage. The original collision resolver applies damage
 * for both orderings of a pair; this pass does the same in one step. */
void update_contact_tree(World& world);
std::size_t resolve_contacts(World& world);

/** Run the death domain without applying damage (for direct tests). */
void kill_entity(World& world, EntityHandle target, EntityHandle attacker = EntityHandle{});

/** Original healing clamp: dead entities are not healed, live health is
 * clamped to [0, maximum]. Returns the new health. */
f32 heal_entity(Entity& entity, f32 amount);

/** Healing through the world also honors healing-suppression effects (the
 * recovered Dandelion family). */
f32 heal_entity(World& world, EntityHandle target, f32 amount);

/** Original attacker propagation: nearby untargeted AI acquire the attacker. */
std::size_t alert_to_attacker(World& world, EntityHandle target, EntityHandle attacker);

} // namespace engine
