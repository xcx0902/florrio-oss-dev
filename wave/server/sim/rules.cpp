#include "sim/rules.hpp"
#include "garden_evidence.hpp"
#include "catalog/catalog.hpp"

#include <stdexcept>

namespace wave::sim {

Tick Timing::ticks_ceil(Microseconds time) const {
  if (step.count() <= 0 || time.count() < 0) {
    throw std::invalid_argument("invalid Wave timing");
  }
  return time.count() / step.count() + (time.count() % step.count() != 0);
}

Rules garden_rules() {
  Rules rules;
  detail::load_garden_evidence(rules);
  rules.catalog = &catalog::dated();
  // Local display calibration: 5 W1 units projects to a 25-unit flower body.
  rules.player = {.radius = 5,
                  .health = 100,
                  .speed_per_second = 85,
                  .contact_damage = 2,
                  .contact_cooldown = 12};
  rules.petals = {{{.radius = 3, .health = 12, .contact_damage = 10, .contact_cooldown = 8},
                   {.radius = 4, .health = 12, .contact_heal = 8, .contact_cooldown = 24}}};
  rules.petal_reload = rules.timing.ticks_ceil(std::chrono::milliseconds(2500));
  rules.mobs = {
      {Mob::bee,
       {.radius = 5,
        .health = 16,
        .speed_per_second = 37,
        .contact_damage = 4,
        .contact_cooldown = 18}},
      {Mob::ladybug,
       {.radius = 7,
        .health = 24,
        .speed_per_second = 26,
        .contact_damage = 5,
        .contact_cooldown = 20}},
      {Mob::baby_ant,
       {.radius = 4,
        .health = 12,
        .speed_per_second = 34,
        .contact_damage = 3,
        .contact_cooldown = 16}},
      {Mob::rock, {.radius = 8, .health = 35, .contact_damage = 5, .contact_cooldown = 20}},
      {Mob::centipede,
       {.radius = 7,
        .health = 30,
        .speed_per_second = 30,
        .contact_damage = 6,
        .contact_cooldown = 20}},
      {Mob::worker_ant,
       {.radius = 5,
        .health = 19,
        .speed_per_second = 36,
        .contact_damage = 4,
        .contact_cooldown = 16}},
      {Mob::dark_ladybug,
       {.radius = 8,
        .health = 34,
        .speed_per_second = 30,
        .contact_damage = 7,
        .contact_cooldown = 20}},
      {Mob::evil_centipede,
       {.radius = 8,
        .health = 38,
        .speed_per_second = 32,
        .contact_damage = 7,
        .contact_cooldown = 18}},
      {Mob::soldier_ant,
       {.radius = 6,
        .health = 28,
        .speed_per_second = 35,
        .contact_damage = 6,
        .contact_cooldown = 16}},
      {Mob::spider,
       {.radius = 7,
        .health = 32,
        .speed_per_second = 40,
        .contact_damage = 6,
        .contact_cooldown = 16}},
      {Mob::hornet,
       {.radius = 6,
        .health = 24,
        .speed_per_second = 44,
        .contact_damage = 4,
        .poison_per_tick = 0.5,
        .poison_ticks = 8,
        .contact_cooldown = 20}},
  };
  rules.contact_knockback_speed = 24;
  for (int y : {-100, 0, 100}) {
    for (int x : {-100, 0, 100}) {
      if (x != 0 || y != 0) {
        rules.spawn_points.emplace_back(x, y);
      }
    }
  }
  return rules;
}

}  // namespace wave::sim
