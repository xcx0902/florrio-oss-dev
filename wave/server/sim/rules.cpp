#include "sim/rules.hpp"
#include "catalog/catalog.hpp"
#include "scenario_defaults.hpp"

#include <numbers>
#include <stdexcept>

namespace wave::sim {

Tick Timing::ticks_ceil(Microseconds time) const {
  if (step.count() <= 0 || time.count() < 0) {
    throw std::invalid_argument("invalid Wave timing");
  }
  return time.count() / step.count() + (time.count() % step.count() != 0);
}

Rules::Rules() : Rules(catalog::dated()) {}

Rules::Rules(const catalog::Catalog& definitions) : catalog(definitions) {}

Rules scenario_rules(Biome biome) {
  Rules rules;
  detail::load_scenario_defaults(rules);
  rules.biome = biome;
  rules.progressive_waves = true;
  rules.residual = ResidualPolicy::keep;
  // Local display calibration: 5 W1 units projects to a 25-unit flower body.
  rules.player = {.radius = 5,
                  .health = 100,
                  .speed_per_second = catalog::mob_movement_player_speed_per_second,
                  .contact_damage = 2};
  rules.contact_knockback_speed = 24;
  using enum Mob;
  std::array<std::vector<Mob>, 3> unlocks;
  switch (biome) {
    case Biome::garden:
      rules.late_mobs = {ant_hole, queen_ant};
      rules.dangerous_mobs = {spider, hornet};
      break;
    case Biome::desert:
      unlocks = {{{cactus, sandstorm, desert_centipede}, {beetle}, {scorpion, shiny_ladybug}}};
      rules.late_mobs = {fire_ant_burrow, fire_ant};
      rules.dangerous_mobs = {sandstorm, beetle, scorpion};
      rules.special_groups = {{beetle}, {desert_centipede}, {sandstorm}, {scorpion}};
      break;
    case Biome::ocean:
      unlocks = {{{bubble, shell, sponge}, {crab}, {starfish, jellyfish}}};
      rules.late_mobs = {leech};
      rules.dangerous_mobs = {starfish, crab, jellyfish};
      rules.special_groups = {{bubble}, {crab},          {jellyfish}, {leech},
                              {shell},  {shell, sponge}, {starfish}};
      break;
  }
  if (biome != Biome::garden) {
    std::vector<Mob> eligible;
    for (std::size_t i = 0; i < unlocks.size(); ++i) {
      eligible.insert(eligible.end(), unlocks[i].begin(), unlocks[i].end());
      rules.waves[i].eligible = eligible;
    }
  }
  for (const int radius : {95, 135, 175}) {
    for (int i = 0; i < 32; ++i) {
      const double angle = (i + radius / 100.0) * 2 * std::numbers::pi / 32;
      rules.spawn_points.emplace_back(radius * std::cos(angle), radius * std::sin(angle));
    }
  }
  return rules;
}

WaveRules wave_rules_at(const Rules& rules, std::size_t index) {
  if (index < rules.waves.size()) {
    return rules.waves[index];
  }
  const auto offset = index - rules.waves.size();
  const auto last = rules.waves.back().number;
  if (!rules.progressive_waves || last >= max_wave_number || offset >= max_wave_number - last) {
    throw std::out_of_range("Wave index outside the scenario");
  }
  const auto number = last + static_cast<std::uint32_t>(offset) + 1;
  auto eligible = rules.waves.back().eligible;
  eligible.insert(eligible.end(), rules.late_mobs.begin(), rules.late_mobs.end());
  const auto ticks = [&](unsigned seconds) {
    return rules.timing.ticks_ceil(std::chrono::seconds(seconds));
  };
  const auto budget = 10 + std::min(26u, number / 2);
  return {number,
          std::move(eligible),
          wave_rarity(number, 0),
          budget,
          {{0, budget / 6},
           {ticks(6), budget / 4},
           {ticks(13), budget / 4},
           {ticks(21), budget - budget / 6 - 2 * (budget / 4)}},
          ticks(30 + std::min(45u, number))};
}

Rarity wave_rarity(std::uint32_t number, double roll) {
  struct Band {
    std::uint32_t last_wave;
    std::array<unsigned, 6> weights;
  };
  // Percent chances from Common to Mythic. Only new spawns use these weights.
  static constexpr Band bands[]{
      {6, {75, 25, 0, 0, 0, 0}},    {14, {0, 65, 35, 0, 0, 0}},
      {22, {0, 25, 65, 10, 0, 0}},  {30, {0, 10, 25, 55, 10, 0}},
      {40, {0, 0, 15, 45, 30, 10}}, {UINT32_MAX, {0, 0, 0, 30, 50, 20}},
  };
  const auto& weights = std::ranges::lower_bound(bands, number, {}, &Band::last_wave)->weights;
  unsigned cumulative = 0;
  Rarity selected = Rarity::common;
  for (unsigned tier = 0; tier < weights.size(); ++tier) {
    if (weights[tier]) {
      selected = static_cast<Rarity>(tier);
      cumulative += weights[tier];
      if (roll < cumulative / 100.) {
        return selected;
      }
    }
  }
  return selected;
}

Rules pvp_rules() {
  auto rules = scenario_rules(Biome::garden);
  rules.mode = Mode::pvp;
  rules.version = std::string(detail::w5_rules_version) + "+pvp";
  rules.progressive_waves = false;
  rules.special_chance = 0;
  rules.lifecycle.respawn_next_wave = false;
  rules.lifecycle.end_on_team_wipe = false;
  rules.lifecycle.end_on_last_disconnect = false;
  rules.pause_when_all_inside = false;
  return rules;
}

std::array<std::uint8_t, 3> scene_background(Mode mode, Biome biome, std::optional<Mob> interior) {
  const auto index = interior == Mob::ant_hole          ? 4u
                     : interior == Mob::fire_ant_burrow ? 5u
                     : mode == Mode::pvp                ? 3u
                                                        : static_cast<unsigned>(biome);
  return detail::w5_background_colors.at(index);
}

unsigned pvp_minimum_level() {
  return detail::w5_pvp_minimum_level;
}

double pvp_arena_radius(std::size_t players) {
  // Only the population dependency is historical; this curve is a dated remake setting.
  return detail::w5_pvp_base_radius +
         detail::w5_pvp_radius_per_sqrt_player * std::sqrt(double(players > 0 ? players - 1 : 0));
}

std::optional<Rarity> pvp_basic_rarity(std::uint64_t score) {
  // Old Wiki gives approximate U/R/E bounds; the L bound is a remake setting.
  if (score >= detail::w5_pvp_basic_thresholds[3]) {
    return Rarity::legendary;
  }
  if (score >= detail::w5_pvp_basic_thresholds[2]) {
    return Rarity::epic;
  }
  if (score >= detail::w5_pvp_basic_thresholds[1]) {
    return Rarity::rare;
  }
  if (score >= detail::w5_pvp_basic_thresholds[0]) {
    return Rarity::unusual;
  }
  return std::nullopt;
}

}  // namespace wave::sim
