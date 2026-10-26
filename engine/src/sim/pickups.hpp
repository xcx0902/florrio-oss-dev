#pragma once
#include "engine/model/world.hpp"
#include <cstddef>

namespace engine {
// Original advanceTimedEntitiesAndAi, before population, AI and movement.
std::size_t advance_pickups(World& world, double delta_milliseconds);
}
