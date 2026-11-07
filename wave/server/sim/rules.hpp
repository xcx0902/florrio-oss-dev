#pragma once

#include "sim/model.hpp"

#include <array>

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
  double contact_heal = 0;
  double poison_per_tick = 0;
  Tick poison_ticks = 0;
  Tick contact_cooldown = 1;
};

struct MobRules {
  Mob kind;
  BodyRules body;
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
enum class Evidence {
  reconstruction
};

struct Rules {
  std::string version;
  Timing timing;
  double arena_radius = 200;
  BodyRules player;
  std::array<BodyRules, 2> petals;
  Tick petal_reload = 1;
  double orbit_radius = 14;
  double orbit_rad_per_second = 4;
  double knockback_retention = 0.75;
  double contact_knockback_speed = 0;
  std::vector<MobRules> mobs;
  std::vector<WaveRules> waves;
  std::vector<Vec2> spawn_points;
  std::uint32_t spawn_attempts = 4;
  std::uint32_t remaining_threshold = 4;
  double special_chance = 0;
  bool special_on_opening_wave = false;
  std::vector<std::vector<Mob>> special_groups;
  bool advance_on_deadline = true;
  LifecycleRules lifecycle;
  ResidualPolicy residual = ResidualPolicy::discard;
  Evidence residual_evidence = Evidence::reconstruction;
};

[[nodiscard]] Rules garden_rules();

}  // namespace wave::sim
