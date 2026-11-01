#include "florr/server/runtime.hpp"
#include <boost/version.hpp>
#include <boost/system/error_code.hpp>
#include <boost/asio/io_context.hpp>
#include <boost/beast/core/flat_buffer.hpp>
#include <memory>

static_assert(BOOST_VERSION == 108600, "Use the M00 locked Boost headers");
namespace florr::server {
SmokeResult run_smoke(const Options& options) {
  // Heap allocation avoids putting the 16,384-slot pool on the host stack.
  auto world = std::make_unique<engine::World>();
  engine::initialize_world(*world, options.world);
  for (std::uint32_t tick = 0; tick < options.smoke_ticks; ++tick)
    engine::advance_world(*world);
  return {world->tick(), world->time_ms(), world->entities().active_count(),
      options.world.game_seed, world->random().state(), world->rng_draws(),
      world->rng().state(), world->death_shuffle_random().state()};
}
} // namespace florr::server
