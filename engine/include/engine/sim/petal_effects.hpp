#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** Apply the recovered petal-on-hit family: Iris/Peas/Cactus poison, Dandelion
 * healing suppression, Honey/Web slow, Peas split and Web tag. The cooldown is
 * the original `behavior+4` gate that prevents one contact from firing every
 * tick. */
void on_petal_hit(World& world, EntityHandle petal, EntityHandle target,
                  EntityHandle attacker);

/** Apply the Cactus incoming-hit poison family (original function 691). */
void on_petal_incoming_hit(World& world, EntityHandle petal, EntityHandle attacker);

/** Advance temporary petals, Peas split cooldowns and Egg hatch timers. */
void update_petal_behaviors(World& world, double delta_milliseconds);

} // namespace engine
