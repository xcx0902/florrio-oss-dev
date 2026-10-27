#pragma once
#include "engine/model/player_profile.hpp"
#include "engine/model/world.hpp"
#include "engine/sim/player_loadout.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace engine {

/** Historical names: `retained` is ground loot (at most three), while `lost`
 * is the controller's respawn survivors (at most ten). Neither list replaces
 * the corpse's carried inventory. */
struct LootResult {
  std::array<std::uint16_t, 3> retained{};
  std::uint8_t retained_count = 0;
  std::array<std::uint16_t, PlayerProfile::kMaxLost> lost{};
  std::uint8_t lost_count = 0;
};

/** Original entity drop roll: for each finalized drop entry draw one server
 * RNG fraction and compare it with base * chance. `base` is 1 in the compact
 * world and 3 otherwise (the initializer writes 1.0 / 3.0). */
[[nodiscard]] std::vector<std::uint16_t> roll_entity_loot(ServerRng& rng, std::uint16_t type_id,
                                                          bool compact);

/** Original player death retention pass: group equipped/inventory petals by
 * rarity, shuffle each group, skip Basic and a 10% roll, drop the first three,
 * save the next ten for respawn, and convert 1% of ground rarity>=2 petals to
 * Pollen (19). The profile argument is scratch storage; pass a copy at death. */
[[nodiscard]] LootResult retain_player_loot(PlayerProfile& profile, ServerRng& rng,
                                           ServerRng& shuffle_rng);

/** Spawn one pickup entity for a petal type with the original pickup radius
 * (35), lifetime (32s, or 42/52/62/62s by rarity 2..5) and radial impulse.
 * `base_velocity` is the dead entity's velocity + acceleration (original
 * transform +40/+48 plus +56/+64); the drop inherits it additively. */
[[nodiscard]] EntityHandle spawn_loot_drop(World& world, std::uint16_t petal_type, Vec2 position,
                                           Vec2 impulse = Vec2{},
                                           Vec2d base_velocity = Vec2d{});

/** Convenience: spawn every petal in a loot list at `position`, spreading
 * multi-drop impulses over the circle. Tier-5 (legendary) petals are skipped
 * when another active loadout or pickup already holds the same type. `dead`
 * identifies the dying owner so its own loadout is not treated as a duplicate. */
std::vector<EntityHandle> spawn_loot_drops(World& world, const std::vector<std::uint16_t>& petals,
                                           Vec2 position, EntityHandle dead = EntityHandle{});

/** True when a legendary petal type already exists in another active loadout or
 * as an active pickup. */
[[nodiscard]] bool legendary_exists(const World& world, EntityHandle dead,
                                    std::uint16_t petal_type);

/** Lifetime in milliseconds for a pickup of the given petal type. */
[[nodiscard]] double loot_lifetime_ms(std::uint16_t petal_type);

} // namespace engine
