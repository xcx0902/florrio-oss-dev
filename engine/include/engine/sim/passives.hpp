#pragma once
#include "engine/core/f32.hpp"
#include <cstdint>

namespace engine {
class PlayerState;
class World;

/** Max-health bonus: +20 per ready Cactus Rare/Epic slot and +40 per ready Cactus
 * Legendary slot, counted once per active slot while instance zero is ready, and
 * zero while the zone restriction blocks petals. */
[[nodiscard]] f32 equipped_max_health_bonus(const PlayerState& state, std::uint8_t level);

/** Leaf healing: one health per second for each ready active Leaf slot, added as
 * `milliseconds * count * 0.001` in f64. */
[[nodiscard]] double equipped_leaf_healing(const PlayerState& state, double milliseconds);
}  // namespace engine
