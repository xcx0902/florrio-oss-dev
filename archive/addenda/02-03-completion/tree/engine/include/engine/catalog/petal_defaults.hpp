#pragma once
#include <array>
#include <cstdint>

namespace engine {

struct PetalDefault {
  std::uint16_t type_id;
  float radius;
  std::uint32_t recharge_milliseconds;
  std::uint8_t instances_per_slot;
  std::array<std::uint8_t, 3> flags;
};

inline const std::array<PetalDefault, 39>& petal_defaults() {
  static const std::array<PetalDefault, 39> table{{
  { 0U, 14.0F, 0U, 1U, {0U, 0U, 0U} },
  { 1U, 14.0F, 2500U, 1U, {0U, 0U, 0U} },
  { 2U, 14.0F, 500U, 1U, {0U, 0U, 0U} },
  { 3U, 14.0F, 5500U, 1U, {0U, 0U, 0U} },
  { 4U, 14.0F, 10000U, 1U, {0U, 0U, 0U} },
  { 5U, 14.0F, 2500U, 1U, {0U, 0U, 0U} },
  { 6U, 14.0F, 3500U, 1U, {0U, 0U, 0U} },
  { 7U, 14.0F, 4000U, 1U, {0U, 0U, 0U} },
  { 8U, 14.0F, 6000U, 1U, {0U, 0U, 0U} },
  { 9U, 14.0F, 1250U, 1U, {0U, 0U, 0U} },
  { 10U, 14.0F, 3000U, 1U, {0U, 0U, 0U} },
  { 11U, 14.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 12U, 14.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 13U, 14.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 14U, 14.0F, 500U, 1U, {0U, 0U, 0U} },
  { 15U, 14.0F, 3500U, 1U, {0U, 0U, 0U} },
  { 16U, 14.0F, 1000U, 2U, {0U, 0U, 0U} },
  { 17U, 14.0F, 1000U, 3U, {0U, 0U, 0U} },
  { 18U, 14.0F, 3500U, 1U, {0U, 0U, 0U} },
  { 19U, 14.0F, 1000U, 3U, {0U, 0U, 0U} },
  { 20U, 11.0F, 2000U, 1U, {0U, 0U, 0U} },
  { 21U, 14.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 22U, 14.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 23U, 14.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 24U, 14.0F, 3500U, 3U, {0U, 1U, 11U} },
  { 25U, 12.0F, 0U, 1U, {1U, 0U, 0U} },
  { 26U, 12.0F, 20000U, 1U, {0U, 0U, 0U} },
  { 27U, 14.0F, 4000U, 3U, {0U, 1U, 11U} },
  { 28U, 12.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 29U, 14.0F, 3000U, 1U, {0U, 0U, 0U} },
  { 30U, 14.0F, 3000U, 3U, {0U, 1U, 13U} },
  { 31U, 14.0F, 1700U, 1U, {0U, 0U, 0U} },
  { 32U, 14.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 33U, 14.0F, 1000U, 3U, {0U, 1U, 15U} },
  { 34U, 14.0F, 1000U, 1U, {0U, 0U, 0U} },
  { 35U, 14.0F, 2500U, 1U, {0U, 0U, 0U} },
  { 36U, 14.0F, 2500U, 1U, {0U, 0U, 0U} },
  { 37U, 14.0F, 0U, 1U, {0U, 0U, 0U} },
  { 38U, 14.0F, 45000U, 1U, {0U, 0U, 0U} },
  }};
  return table;
}

} // namespace engine
