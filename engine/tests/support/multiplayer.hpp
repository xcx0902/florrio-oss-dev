#pragma once
#include "engine/model/world_config.hpp"
#include "engine/sim/player_commands.hpp"
#include "engine/sim/petals.hpp"
#include <memory>

namespace engine::test {
inline std::unique_ptr<World> make_world(std::uint32_t seed = 285456437U) {
  auto world = std::make_unique<World>();
  initialize_world(*world, WorldConfig{.game_seed = seed});
  return world;
}
inline PlayerId join_player(World& world, std::string name, Vec2 position,
                            PlayerProfile profile = make_default_profile()) {
  const auto id = register_player(world, name);
  auto* player = world.players().get(id);
  if (player == nullptr) {
    return {};
  }
  if (!spawn_player(world, *player, name, position, {}).valid()) {
    return {};
  }
  player->profile() = profile;
  player->loadout().restore_from_profile(profile);
  (void)spawn_loadout_petals(world, *player);
  return id;
}
inline bool apply_player_input(World& world, PlayerId id, std::uint32_t buttons, f32 angle,
                               f32 strength) {
  const auto* player = world.players().get(id);
  return player != nullptr &&
         engine::apply_player_input(world, id, player->life_epoch, buttons, angle, strength);
}
inline void advance_ticks(World& world, unsigned count) {
  for (unsigned index = 0; index < count; ++index) {
    advance_world(world);
  }
}
}  // namespace engine::test
