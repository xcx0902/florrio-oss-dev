#pragma once
#include "engine/core/f32.hpp"
#include <cstdint>

namespace engine {

/** Original function 262: 1.06 raised to an integer exponent by repeated
 * squaring. The loop termination test is unsigned in the shipped body; this
 * version follows the recovered JS body exactly for the non-negative range
 * used by progression. */
[[nodiscard]] double growth_factor(std::int32_t exponent);

/** Experience required to advance from `level` to `level + 1`:
 * floor(1.06 ** (level - 1) * level) + 3, rounded to binary32. */
[[nodiscard]] f32 experience_threshold(std::uint8_t level);

/** Experience awarded by a petal of the given rarity index. Values are read
 * from the original server data table at 6960. */
[[nodiscard]] f32 rarity_experience(std::uint32_t rarity_index);

} // namespace engine
