#pragma once
#include "engine/sim/player.hpp"

namespace engine {
inline constexpr std::uint64_t kSpawnCooldownTicks = 50;
/** Offline compatibility explicitly opts into a persistent input lease. */

[[nodiscard]] PlayerId register_player(World& world, std::string name);
[[nodiscard]] bool can_spawn_player(const World& world, const PlayerState& player);
[[nodiscard]] EntityHandle spawn_registered_player(World& world, PlayerId id,
    LifeEpoch life, std::string_view name, bool allow_rare_starter = true);
[[nodiscard]] bool apply_player_input(World& world, PlayerId id, LifeEpoch life,
    std::uint32_t buttons, f32 angle, f32 strength,
    std::uint64_t ttl_ticks = kInputTtlTicks);
[[nodiscard]] bool discard_player_slot(World& world, PlayerId id, LifeEpoch life,
    std::uint8_t slot, std::uint16_t expected_type);
[[nodiscard]] bool swap_player_slots(World& world, PlayerId id, LifeEpoch life,
    std::uint8_t first, std::uint16_t first_type, std::uint8_t second,
    std::uint16_t second_type);
[[nodiscard]] bool leave_player(World& world, PlayerId id);
/** Tick-boundary input expiry/lifecycle gates, before any player phase. */
void prepare_players(World& world);
void apply_all_player_controls(World& world, double delta_milliseconds);
} // namespace engine
