#pragma once
#include "engine/model/entity.hpp"

namespace engine {
class World;

/** Original 693/719: replace an Egg slot's handle with its friendly hatchling.
 * Called by the orbit callback, after the strict creation-time hatch delay. */
bool hatch_equipped_egg(World& world, EntityHandle egg, std::uint16_t hatchling_type);

/** Original equipped-slot sweep: a pet's death releases its Egg slot and
 * starts recharge in that sweep, while a living pet continues to occupy it. */
void refresh_egg_pet_slots(World& world);
} // namespace engine
