#include "sim/rules.hpp"
#include "catalog/catalog.hpp"
#include "garden_evidence.hpp"

#include <numbers>
#include <stdexcept>

namespace wave::sim {

Tick Timing::ticks_ceil(Microseconds time) const {
  if (step.count() <= 0 || time.count() < 0) {
    throw std::invalid_argument("invalid Wave timing");
  }
  return time.count() / step.count() + (time.count() % step.count() != 0);
}

Rules scenario_rules(Biome biome) {
  Rules rules;
  detail::load_garden_evidence(rules);
  rules.catalog = &catalog::dated();
  rules.biome = biome;
  rules.progressive_waves = true;
  rules.residual = ResidualPolicy::keep;
  // Local display calibration: 5 W1 units projects to a 25-unit flower body.
  rules.player = {.radius = 5,
                  .health = 100,
                  .speed_per_second = 50,
                  .contact_damage = 2};
  rules.petals = {{{.radius = 3, .health = 12, .contact_damage = 10},
                   {.radius = 4, .health = 12, .contact_heal = 8}}};
  rules.petal_reload = rules.timing.ticks_ceil(std::chrono::milliseconds(2500));
  rules.mobs = {
      {Mob::bee,
       {.radius = 5,
        .health = 16,
        .speed_per_second = 37,
        .contact_damage = 4}},
      {Mob::ladybug,
       {.radius = 7,
        .health = 24,
        .speed_per_second = 26,
        .contact_damage = 5}},
      {Mob::baby_ant,
       {.radius = 4,
        .health = 12,
        .speed_per_second = 34,
        .contact_damage = 3}},
      {Mob::rock, {.radius = 8, .health = 35, .contact_damage = 5}},
      {Mob::centipede,
       {.radius = 7,
        .health = 30,
        .speed_per_second = 30,
        .contact_damage = 6}},
      {Mob::worker_ant,
       {.radius = 5,
        .health = 19,
        .speed_per_second = 36,
        .contact_damage = 4}},
      {Mob::dark_ladybug,
       {.radius = 8,
        .health = 34,
        .speed_per_second = 30,
        .contact_damage = 7}},
      {Mob::evil_centipede,
       {.radius = 8,
        .health = 38,
        .speed_per_second = 32,
        .contact_damage = 7}},
      {Mob::soldier_ant,
       {.radius = 6,
        .health = 28,
        .speed_per_second = 35,
        .contact_damage = 6}},
      {Mob::spider,
       {.radius = 7,
        .health = 32,
        .speed_per_second = 40,
        .contact_damage = 6}},
      {Mob::hornet,
       {.radius = 6,
        .health = 24,
        .speed_per_second = 44,
        .contact_damage = 4,
        .poison_per_tick = 0.5,
        .poison_ticks = 8}},
  };
  rules.contact_knockback_speed = 24;
  // All kinds are available to the scenario schedules.
  for (const auto& mob : catalog::dated().mobs) {
    if (mob.rarity == Rarity::common &&
        std::ranges::find(rules.mobs, mob.kind, &MobRules::kind) == rules.mobs.end()) {
      rules.mobs.push_back({mob.kind, mob.body});
    }
  }
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
      rules.special_groups = {{bubble}, {crab}, {jellyfish}, {leech}, {shell},
                              {shell, sponge}, {starfish}};
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

Rules garden_rules() { return scenario_rules(Biome::garden); }

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
  return {number, std::move(eligible), wave_rarity(number, 0), budget,
          {{0, budget / 6}, {ticks(6), budget / 4}, {ticks(13), budget / 4},
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
      {6, {75, 25, 0, 0, 0, 0}},
      {14, {0, 65, 35, 0, 0, 0}},
      {22, {0, 25, 65, 10, 0, 0}},
      {30, {0, 10, 25, 55, 10, 0}},
      {40, {0, 0, 15, 45, 30, 10}},
      {UINT32_MAX, {0, 0, 0, 30, 50, 20}},
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

}  // namespace wave::sim
