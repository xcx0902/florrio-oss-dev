#pragma once

#include "catalog/catalog.hpp"

namespace wave::fixtures {

// Synthetic S/S+3/S+10 schedule for native fixtures and the W2 host.
inline sim::Rules short_match_rules(const catalog::Catalog& definitions = catalog::dated()) {
  using namespace sim;
  Rules rules(definitions);
  rules.version = "w1-fixture.1";
  rules.arena_radius = 100;
  rules.player = {.radius = 2, .health = 20, .speed_per_second = 100};
  rules.orbit_radius = 4;
  rules.orbit_rad_per_second = 0;
  for (std::uint32_t number = 1; number <= 3; ++number) {
    rules.waves.push_back(
        {number, {Mob::bee, Mob::ladybug}, Rarity::common, 6, {{0, 2}, {3, 4}}, 10});
  }
  rules.spawn_points = {{40, 0},  {-40, 0},  {0, 40},   {0, -40},
                        {40, 40}, {40, -40}, {-40, 40}, {-40, -40}};
  return rules;
}

}  // namespace wave::fixtures
