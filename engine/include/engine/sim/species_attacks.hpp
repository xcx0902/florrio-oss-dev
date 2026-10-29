#pragma once
#include "engine/model/world.hpp"

namespace engine {

/** Original AI+144 indirect attack callbacks. Only callback 74 (Hornet) is
 * dispatched today; unknown callback ids are recorded and ignored rather than
 * guessed. */
enum class AttackCallback : std::uint32_t {
  kNone = 0,
  kHornetStinger = 74,
};

/** Hornet stinger callback. The stinger launches along the body facing:
 * position - 20 * direction, initial velocity 1.4 * direction, persistent
 * acceleration 0.6 * direction, and firing-body recoil -0.4 * direction. The
 * body has radius 11, health/maxHealth 10 and contact damage 10. Its 2000 ms
 * health timer kills it; the zero-health corpse is removed after another
 * 1000 ms. See docs/semantics/ai.md.
 */
[[nodiscard]] EntityHandle spawn_hornet_stinger(World& world, EntityHandle hornet,
                                               EntityHandle target);

/** Dispatch one original callback id for an entity whose cooldown reached zero.
 * Returns true when a callback was executed. */
bool dispatch_attack_callback(World& world, EntityHandle attacker);

/** Number of callback dispatches since the last reset (diagnostics/tests). */
namespace species_debug {
extern std::uint32_t stinger_spawns;
extern std::uint32_t unknown_callbacks;
} // namespace species_debug

} // namespace engine
