#pragma once
#include "engine/model/attack_behavior.hpp"
#include "engine/model/world.hpp"

namespace engine {

/** Hornet stinger attack. The stinger launches along the body facing:
 * position - 20 * direction, initial velocity 1.4 * direction, persistent
 * acceleration 0.6 * direction, and firing-body recoil -0.4 * direction. The
 * body has radius 11, health/maxHealth 10 and contact damage 10. Its 2000 ms
 * health timer kills it; the zero-health corpse is removed after another
 * 1000 ms. See docs/semantics/ai.md.
 */
[[nodiscard]] EntityHandle spawn_hornet_stinger(World& world, EntityHandle hornet,
                                                EntityHandle target);

/** Execute the attacker's current attack behavior when its cooldown reached
 * zero. Returns true when an attack was executed. */
bool dispatch_attack(World& world, EntityHandle attacker);

/** Number of stinger attacks since the last reset (diagnostics/tests). */
namespace species_debug {
extern std::uint32_t stinger_spawns;
}  // namespace species_debug

}  // namespace engine
