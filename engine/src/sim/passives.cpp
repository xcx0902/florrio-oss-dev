#include "engine/sim/passives.hpp"
#include "engine/model/world.hpp"
#include <algorithm>

namespace engine {
namespace {
std::uint8_t active_slots(std::uint8_t level) {
  return level < 15U ? 5U : level < 30U ? 6U : level < 45U ? 7U : 8U;
}
std::uint32_t count_ready(const World& world, std::uint16_t type, std::uint8_t level) {
  if (world.zone_petals_disabled()) return 0U;
  std::uint32_t count = 0U;
  const auto& slots = world.loadout().slots();
  for (std::uint8_t slot = 0U; slot < active_slots(level); ++slot)
    if (slots[slot].type_id == type && !world.loadout().pending(slot, 0U)) ++count;
  return count;
}
} // namespace

f32 equipped_max_health_bonus(const World& world, std::uint8_t level) {
  // 33 has three petals but contributes 40 once per slot, rather than once
  // per surviving entity. The pending byte, not the petal's health, is tested.
  return f32(static_cast<float>(20U * count_ready(world, 13U, level)
    + 40U * count_ready(world, 33U, level) + 20U * count_ready(world, 21U, level)));
}

double equipped_leaf_healing(const World& world, double milliseconds) {
  return milliseconds * static_cast<double>(count_ready(world, 32U, world.profile().level())) * 0.001;
}
} // namespace engine
