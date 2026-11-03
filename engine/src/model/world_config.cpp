#include "engine/model/world_config.hpp"
#include "engine/core/fixed_step.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/tick.hpp"

namespace engine {
void initialize_world(World& world, const WorldConfig& config) {
  world.initialize(config.handle_seed);
  world.random().seed(config.game_seed);
  world.seed_death_shuffle(config.death_shuffle_seed);
  world.set_auto_populate(config.populate);
  if (config.populate) {
    (void)world.random().next();
    (void)world.random().next();
    (void)populate_world(world, SpawnTable::from_catalog());
  }
}
void advance_world(World& world) {
  if (!world.initialized()) {
    return;
  }
  tick(world, static_cast<double>(kTickMilliseconds));
  for (int index = 0; index < 6; ++index) {
    (void)world.random().next();
  }
}
}  // namespace engine
