#pragma once

#include "sim/model.hpp"

namespace wave::catalog {
struct Catalog;
}

namespace wave::sim {

struct Timing {
  Microseconds step{25000};
  Microseconds broadcast_interval{100000};
  [[nodiscard]] Tick ticks_ceil(Microseconds time) const;
};

struct BodyRules {
  double radius = 1;
  double health = 1;
  double speed_per_second = 0;
  double contact_damage = 0;
  double poison_per_tick = 0;
  Tick poison_ticks = 0;
};

struct Batch {
  Tick offset;
  std::uint32_t count;
};

struct WaveRules {
  std::uint32_t number;
  std::vector<Mob> eligible;
  Rarity rarity;
  std::uint32_t budget;
  std::vector<Batch> batches;
  Tick deadline;
};

struct LifecycleRules {
  bool respawn_next_wave = true;
  bool respawn_after_deadline = true;
  bool end_on_team_wipe = true;
  bool end_on_last_disconnect = true;
};

enum class ResidualPolicy {
  discard,
  keep
};

struct Rules {
  Rules();
  explicit Rules(const catalog::Catalog& catalog);
  Rules(const catalog::Catalog&&) = delete;

  // The immutable catalog and its entries must outlive the match.
  const catalog::Catalog& catalog;
  std::string version;
  Timing timing;
  Biome biome = Biome::garden;
  double arena_radius = 300;
  BodyRules player;
  double orbit_radius = 14;
  double orbit_rad_per_second = 4;
  double knockback_retention = 0.75;
  double contact_knockback_speed = 0;
  std::vector<WaveRules> waves;
  bool progressive_waves = false;
  std::vector<Mob> late_mobs;
  std::vector<Mob> dangerous_mobs;
  std::vector<Vec2> spawn_points;
  std::uint32_t spawn_attempts = 4;
  std::uint32_t remaining_threshold = 4;
  double special_chance = 0;
  bool special_on_opening_wave = false;
  std::vector<std::vector<Mob>> special_groups;
  bool advance_on_deadline = true;
  LifecycleRules lifecycle;
  ResidualPolicy residual = ResidualPolicy::discard;
};

[[nodiscard]] Rules scenario_rules(Biome biome);
// The October HUD treats the wave index as a signed integer.
inline constexpr std::uint32_t max_wave_number = INT32_MAX;
[[nodiscard]] WaveRules wave_rules_at(const Rules& rules, std::size_t index);
[[nodiscard]] Rarity wave_rarity(std::uint32_t number, double roll);

}  // namespace wave::sim
