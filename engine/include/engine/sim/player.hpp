#pragma once
#include "engine/core/f32.hpp"
#include "engine/model/player_profile.hpp"
#include "engine/model/world.hpp"
#include <array>
#include <cstdint>
#include <string>
#include <string_view>

namespace engine {

/** Explicit player construction parameters. Defaults are the values written by
 * the original spawn path: collision radius 25 (physics +8), maximum health 100
 * (health +12), contact damage 25 (physics +44, bits 0x41c80000). `movement_speed` is retained
 * for the interim linear movement path used by native tests. */
struct PlayerConfig {
  f32 radius = f32(25.0F);
  f32 health = f32(100.0F);
  f32 max_health = f32(100.0F);
  f32 movement_speed = f32(0.0F);
  f32 contact_damage = f32(25.0F);
};

/** Spawn a kPlayer entity and remember it as the world's player. */
[[nodiscard]] EntityHandle spawn_player(World& world, std::string_view name,
                                        Vec2 position, const PlayerConfig& config);

/** Original spawn path defaults: choose a level band position from the world
 * width/height, equip five Basic petals (or the rare starter), and restore a
 * prior level/inventory when supplied. */
[[nodiscard]] EntityHandle spawn_player_default(World& world, std::string_view name,
                                                PlayerProfile profile = {},
                                                bool allow_rare_starter = true);

/** Build the initial profile: level 1 and five Basic petals. The original
 * 0.00005 rare-starter roll is performed by spawn_player_default. */
[[nodiscard]] PlayerProfile make_default_profile();

/** Original applyPlayerControls movement impulse: once per tick, the stored
 * pointer direction/strength adds a velocity impulse of dt * 2.5 * 0.001,
 * scaled by strength * 0.005 only while strength < 200. */
void apply_player_controls(World& world, double delta_milliseconds);

/** Original per-tick player health recovery: maxHealth * dt / 240000, capped at
 * maximum health. Observed as +1/48 per 50 ms tick at 100 maximum health. */
void regenerate_players(World& world, double delta_milliseconds);

/** Original 145 level contribution to maximum health (binary32 steps). */
[[nodiscard]] f32 player_level_max_health(std::uint8_t level);
/** Original 215 reward: score/experience, level cap 99, and original 145's
 * proportional health rescale after every level gained. */
void award_player_experience(World& world, f32 amount);

} // namespace engine
