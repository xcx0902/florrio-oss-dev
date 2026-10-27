#pragma once
#include "engine/core/f32.hpp"
#include <cstdint>

namespace engine {
class World;

/** Original 145 counts Cactus per active slot while instance zero is ready. */
[[nodiscard]] f32 equipped_max_health_bonus(const World& world, std::uint8_t level);

/** Original 654 adds one health/second for each ready active Leaf slot. */
[[nodiscard]] double equipped_leaf_healing(const World& world, double milliseconds);
} // namespace engine
