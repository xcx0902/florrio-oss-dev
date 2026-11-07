#pragma once
#include "engine/catalog/ids.hpp"
#include "engine/core/f32.hpp"
#include <cstdint>

namespace engine {

/** 1.06 raised to an integer exponent by repeated squaring. Progression only
 * passes non-negative exponents; the loop counts them down as an unsigned
 * value. */
[[nodiscard]] double growth_factor(std::int32_t exponent);

/** Experience required to advance from `level` to `level + 1`:
 * floor(1.06 ** (level - 1) * level) + 3, rounded to binary32. */
[[nodiscard]] f32 experience_threshold(std::uint8_t level);

/** Experience awarded by a petal of the given rarity index, read from the
 * generated catalog table. */
[[nodiscard]] f32 rarity_experience(catalog::Rarity rarity);

}  // namespace engine
