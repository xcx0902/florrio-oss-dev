#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** Integrate active entity positions by velocity for `seconds` (linear helper
 * retained for tests and explicit kinematic paths). */
void integrate_positions(World& world, double seconds);

/** Original movement integration: displacement is
 * `125 * (1 - 0.992^dt) * velocity + dt * acceleration`, then velocity is
 * damped by `0.992^dt`. `delta_milliseconds` is the simulation step. */
void integrate_movement(World& world, double delta_milliseconds);

/** Original 401 `constrainLinkedEntity`: keep every segment within
 * `parentRadius + bodyRadius + 0.0001` of its predecessor and recurse through
 * the attached-child list. Runs before AI steering so the chain uses the
 * previous tick's positions, matching the original 654 call site. */
void constrain_linked_entities(World& world);
std::uint32_t debug_linked_roots(const World& world);
std::uint32_t debug_linked_segments(const World& world);

} // namespace engine
