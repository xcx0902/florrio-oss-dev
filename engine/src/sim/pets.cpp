#include "engine/sim/pets.hpp"
#include "engine/model/catalog.hpp"
#include "engine/model/world.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/spawn.hpp"
#include <algorithm>

namespace engine {

bool hatch_equipped_egg(World& world, EntityHandle egg_handle, std::uint16_t hatchling_type) {
  const Entity* egg = world.entities().get(egg_handle);
  if (egg == nullptr || egg->kind != EntityKind::kPetal || egg->health.value <= 0.0F
      || (egg->type_id != 22U && egg->type_id != 23U)) return false;
  const Vec2 position = egg->position;
  const EntityHandle owner = egg->owner == kInvalidEntity ? EntityHandle{} : EntityHandle{egg->owner};
  const std::uint8_t slot = egg->loadout_slot, instance = egg->loadout_instance;
  const EntityHandle pet_handle = spawn_entity_from_defaults(world, EntityKind::kMob,
                                                              hatchling_type, position);
  Entity* pet = world.entities().get(pet_handle);
  if (pet == nullptr) return false;
  pet->owner = owner.valid() ? owner.raw : kInvalidEntity;
  pet->ai.owner = owner;
  pet->ai.home = position;
  pet->ai.radius = f32(1000.0F);
  pet->ai.guard_radius = f32(300.0F);
  pet->ai.leash = f32(1000.0F);
  // The species' original aggression/chase/idle profile remains in force.
  // 693/719 disable the population-band record (+204), not the AI (+104).
  pet->spawn_band = 0xFFU;
  attach_child(world, owner, pet_handle);
  auto& loadout = world.loadout();
  if (slot < 8U && instance < PlayerLoadout::kInstances
      && loadout.handle(slot, instance) == egg_handle) {
    loadout.set_handle(slot, instance, pet_handle);
    loadout.slots()[slot].instances[instance] = pet_handle;
    loadout.set_pending(slot, instance, false);
    loadout.set_pending_timer(slot, instance, 0U);
    loadout.slots()[slot].recharge_remaining_ms = 0.0;
  }
  // The Egg's health is consumed after transferring its intrusive slot handle;
  // on_petal_destroyed must not clear that replacement or start its recharge.
  auto& states = world.petals();
  states.erase(std::remove_if(states.begin(), states.end(), [egg_handle](const auto& state) {
    return state.handle == egg_handle;
  }), states.end());
  (void)damage_entity(world, egg_handle, egg->health, EntityHandle{});
  assign_petal_orbit_indices(world);
  return true;
}

void refresh_egg_pet_slots(World& world) {
  auto& loadout = world.loadout();
  auto& slots = loadout.slots();
  for (std::uint8_t slot = 0U; slot < 8U; ++slot) {
    if (slots[slot].type_id != 22U && slots[slot].type_id != 23U) continue;
    const EntityHandle handle = loadout.handle(slot, 0U);
    const Entity* pet = world.entities().get(handle);
    if (!handle.valid() || (pet != nullptr && pet->health.value > 0.0F)) continue;
    // Only a hatchling occupies a slot without a petal orbit component.
    if (pet != nullptr && pet->kind != EntityKind::kMob) continue;
    loadout.clear_handle(slot, 0U);
    slots[slot].instances[0] = EntityHandle{};
    if (const auto* definition = Catalog::instance().petal_combat(slots[slot].type_id))
      slots[slot].recharge_remaining_ms = definition->rechargeMilliseconds;
  }
}
} // namespace engine
