#pragma once
#include "engine/model/entity.hpp"

namespace engine {
class PlayerState;
class World;

/** Replace an Egg slot's handle with its friendly hatchling. Called by the
 * orbit callback, after the strict creation-time hatch delay. */
bool hatch_equipped_egg(World& world, EntityHandle egg, catalog::SpeciesId hatchling_type);

/** Equipped-slot sweep: a pet's death releases its Egg slot and starts recharge
 * in that sweep, while a living pet continues to occupy it. */
void refresh_egg_pet_slots(World& world, PlayerState& state);
}  // namespace engine
