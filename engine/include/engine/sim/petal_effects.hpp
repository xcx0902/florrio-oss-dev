#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** Run the projectile orbit callback. True means it released/removed its orbit
 * record; false leaves the caller to apply the ordinary spring this frame. */
bool update_projectile_petal_orbit(World& world, PetalOrbitState& state,
                                    std::uint8_t buttons);

/** Original virtual slot6: a launched Web creates its ground area on death. */
void on_petal_death(World& world, EntityHandle petal);

/** Apply the recovered petal-on-hit family: Iris/Peas/Cactus poison, Dandelion
 * healing suppression, Honey slow. Peas splitting belongs to the orbit callback and Web to death. The cooldown is
 * the original `behavior+4` gate that prevents one contact from firing every
 * tick. */
void on_petal_hit(World& world, EntityHandle petal, EntityHandle target,
                  EntityHandle attacker);

/** Apply the Cactus incoming-hit poison family (original function 691). */
void on_petal_incoming_hit(World& world, EntityHandle petal, EntityHandle attacker);

/** Advance temporary petals, Peas split cooldowns and Egg hatch timers. */
void update_petal_behaviors(World& world, double delta_milliseconds);

} // namespace engine
