#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** Run the projectile orbit callback. True means it released/removed its orbit
 * record; false leaves the caller to apply the ordinary spring this frame. */
bool update_projectile_petal_orbit(World& world, PetalOrbitState& state, std::uint8_t buttons);

/** A launched Web creates its ground area when the petal dies. */
void on_petal_death(World& world, EntityHandle petal);

/** Apply the petal-on-hit family: Iris/Peas/Cactus poison, Dandelion
 * healing suppression, Honey slow. Peas splitting belongs to the orbit callback and Web to death.
 * A per-petal cooldown gates the effect so one contact cannot fire every tick.
 */
void on_petal_hit(World& world, EntityHandle petal, EntityHandle target, EntityHandle attacker);

/** Apply the Cactus incoming-hit poison family. */
void on_petal_incoming_hit(World& world, EntityHandle petal, EntityHandle attacker);

/** Advance temporary petals, Peas split cooldowns and Egg hatch timers. */
void update_petal_behaviors(World& world, double delta_milliseconds);

}  // namespace engine
