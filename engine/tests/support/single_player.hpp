#pragma once
#include "engine/sim/player_commands.hpp"
#include <cstdlib>

namespace engine::test {
/** Explicit single-player fixture adapter only; production World has no local
 * player selection. WorkerApi registers its own offline ID at init. */
inline constexpr PlayerId kSinglePlayerId{1};
inline PlayerState& player(World& world) {
  if (auto* state = world.players().get(kSinglePlayerId)) {
    return *state;
  }
  const auto id = register_player(world, {});
  if (id != kSinglePlayerId) {
    std::abort();
  }
  return *world.players().get(id);
}
inline const PlayerState& player(const World& world) {
  const auto* state = world.players().get(kSinglePlayerId);
  if (state == nullptr) {
    std::abort();
  }
  return *state;
}
inline bool input(World& world, std::uint32_t buttons, f32 angle, f32 strength) {
  auto& state = player(world);
  return world.apply_input(state.id(), state.life_epoch, buttons, angle, strength,
                           kOfflineInputTtl);
}
}  // namespace engine::test
