#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** One fixed simulation tick. Delta is in milliseconds and is clamped by the
 * caller's FixedStepClock. The domain passes (spawn, movement, collision,
 * petals, damage, effects) will be split into engine/src/sim/. */
void tick(World& world, double delta_milliseconds);

} // namespace engine
