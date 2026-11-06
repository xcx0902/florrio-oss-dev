#pragma once
#include "engine/core/f32.hpp"
#include "engine/model/player_profile.hpp"
#include "engine/model/world.hpp"
#include <array>
#include <cstdint>
#include <string>
#include <string_view>

namespace engine {
class PlayerState;

/** Explicit player construction parameters. Defaults: collision radius 25,
 * maximum health 100, contact damage 25. `movement_speed` is retained for the
 * interim linear movement path used by native tests. */
struct PlayerConfig {
  f32 radius = f32(25.0F);
  f32 health = f32(100.0F);
  f32 max_health = f32(100.0F);
  f32 movement_speed = f32(0.0F);
  f32 contact_damage = f32(25.0F);
};

/** Create one body for the explicit registered player, starting a new life. */
[[nodiscard]] EntityHandle spawn_player(World& world, PlayerState& state, std::string_view name,
                                        Vec2 position, const PlayerConfig& config);

/** Spawn defaults: choose a level band position from the world width/height,
 * equip five Basic petals (or the rare starter), and restore a prior
 * level/inventory when supplied. */
[[nodiscard]] EntityHandle spawn_player_default(World& world, PlayerState& state,
                                                std::string_view name, PlayerProfile profile = {},
                                                bool allow_rare_starter = true);

/** Build the initial profile: level 1 and five Basic petals. The 0.00005
 * rare-starter roll is performed by spawn_player_default. */
[[nodiscard]] PlayerProfile make_default_profile();

/** Post-death spawn profile: floor(3*level/4), minimum level 1, no partial
 * XP, the player's surviving items followed by Basic fillers. */
[[nodiscard]] PlayerProfile make_respawn_profile(const PlayerState& state);

/** Player movement impulse: once per tick, the stored pointer direction and
 * strength add a velocity impulse of dt * 2.5 * 0.001, scaled by
 * strength * 0.005 only while strength < 200. */
void apply_player_controls(World& world, PlayerState& state, double delta_milliseconds);

/** Per-tick player health recovery: maxHealth * dt / 240000, capped at maximum
 * health (1/48 per 50 ms tick at 100 maximum health). */
void regenerate_players(World& world, double delta_milliseconds);

/** Level contribution to maximum health, computed in binary32 steps. */
[[nodiscard]] f32 player_level_max_health(std::uint8_t level);
/** Experience reward: score and experience, level cap 99, and the
 * proportional health rescale after every level gained. */
void award_player_experience(World& world, PlayerId player, f32 amount);

}  // namespace engine
