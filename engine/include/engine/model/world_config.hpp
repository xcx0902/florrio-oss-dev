#pragma once
#include "engine/model/world.hpp"
#include <cstdint>

namespace engine {
struct WorldConfig {
  bool populate = false;
  std::uint64_t handle_seed = 0;
  std::uint32_t game_seed = 285456437U;
  std::uint32_t death_shuffle_seed = 1U;
};

/** Shared initialization, including the two pre-population compatibility draws. */
void initialize_world(World& world, const WorldConfig& config = {});
/** One fixed 50ms simulation step and six legacy snapshot-seed draws.
 * Call once per world tick, independently of connection/publication count. */
void advance_world(World& world);
}  // namespace engine
