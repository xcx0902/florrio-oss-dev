#include "engine/sim/progression.hpp"
#include <array>
#include <cmath>

namespace engine {

namespace {

constexpr double kGrowth = 1.06;

} // namespace

double growth_factor(std::int32_t exponent) {
  double result = (exponent & 1) == 1 ? kGrowth : 1.0;
  if (static_cast<std::uint32_t>(exponent + 1) >= 3U) {
    std::int32_t remaining = exponent;
    double power = kGrowth;
    for (;;) {
      power *= power;
      if ((((remaining / 2) | 0) & 1) == 1) result *= power;
      remaining = (remaining / 2) | 0;
      if (static_cast<std::uint32_t>(remaining + 1) <= 2U) break;
    }
  }
  return exponent < 0 ? 1.0 / result : result;
}

f32 experience_threshold(std::uint8_t level) {
  const double scaled = growth_factor(static_cast<std::int32_t>(level) - 1)
    * static_cast<double>(level);
  return f32::from_double(std::floor(scaled) + 3.0);
}

f32 rarity_experience(std::uint32_t rarity_index) {
  static constexpr std::array<float, 6> kExperience{{2.0F, 10.0F, 50.0F, 200.0F, 1000.0F, 2500.0F}};
  return rarity_index < kExperience.size() ? f32(kExperience[rarity_index]) : f32(0.0F);
}

} // namespace engine
