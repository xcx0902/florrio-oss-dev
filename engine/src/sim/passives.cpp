#include "engine/sim/passives.hpp"
#include "engine/model/world.hpp"
#include <algorithm>

namespace engine {
namespace {
std::uint8_t active_slots(std::uint8_t level) {
  return level < 15U ? 5U : level < 30U ? 6U : level < 45U ? 7U : 8U;
}
std::uint32_t count_ready(const PlayerState& state, std::uint16_t type, std::uint8_t level) {
  if (state.zone_petals_disabled()) return 0U;
  std::uint32_t count = 0U;
  const auto& slots = state.loadout().slots();
  for (std::uint8_t slot = 0U; slot < active_slots(level); ++slot)
    if (slots[slot].type_id == type && !state.loadout().pending(slot, 0U)) ++count;
  return count;
}
} // namespace

f32 equipped_max_health_bonus(const PlayerState& state, std::uint8_t level) {
  // 33 has three petals but contributes 40 once per slot, rather than once
  // per surviving entity. The pending byte, not the petal's health, is tested.
  return f32(static_cast<float>(20U * count_ready(state, 13U, level)
    + 40U * count_ready(state, 33U, level) + 20U * count_ready(state, 21U, level)));
}

double equipped_leaf_healing(const PlayerState& state, double milliseconds) {
  return milliseconds * static_cast<double>(count_ready(state, 32U, state.profile().level())) * 0.001;
}
} // namespace engine
