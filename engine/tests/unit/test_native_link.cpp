#include "engine/net/catalog_id.hpp"
#include "../support/single_player.hpp"
// This executable links only engine_core; no WorkerApi or C ABI initialization.
#include "engine/model/world_config.hpp"
#include "engine/diagnostics/entities.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/petals.hpp"
#include "engine/net/snapshot_publisher.hpp"
#include "../support/test_support.hpp"
#include <bit>
#include <memory>
#include <vector>

namespace {
struct State {
  std::vector<std::uint64_t> domain;
  std::vector<std::uint8_t> snapshot;
  bool operator==(const State&) const = default;
};
State observe(engine::World& world, engine::SnapshotPublisher& publisher) {
  State state;
  auto& out = state.domain;
  out = {world.tick(),
         std::bit_cast<std::uint64_t>(world.time_ms()),
         world.random().state(),
         world.rng_draws(),
         world.rng().state(),
         world.death_shuffle_random().state(),
         world.bounds_rebuilds(),
         world.quadtree_updates(),
         world.collision().tick,
         world.collision().bodies.size(),
         world.collision().candidate_pool.size()};
  for (auto value : world.phase_draws()) {
    out.push_back(value);
  }
  for (const auto& hit : world.hit_events()) {
    out.insert(out.end(),
               {hit.target.raw, hit.attacker.raw, std::bit_cast<std::uint32_t>(hit.amount.value),
                std::bit_cast<std::uint32_t>(hit.health_after.value), hit.tick, hit.count});
  }
  for (auto handle : world.destroyed()) {
    out.push_back(handle.raw);
  }
  for (const auto& entity : world.entities().active_entities()) {
    out.insert(out.end(), {entity.handle.raw, engine::net::catalog_type_id(entity),
                           std::bit_cast<std::uint32_t>(entity.position.x.value),
                           std::bit_cast<std::uint32_t>(entity.position.y.value),
                           std::bit_cast<std::uint64_t>(entity.velocity.x),
                           std::bit_cast<std::uint64_t>(entity.velocity.y),
                           std::bit_cast<std::uint32_t>(entity.health.value), entity.owner,
                           entity.ai.target.raw, entity.death_processed,
                           std::bit_cast<std::uint64_t>(entity.death_time_ms)});
  }
  state.snapshot = publisher.publish(world, engine::test::player(world).id(),
                                     static_cast<std::uint32_t>(world.tick() + 1U));
  return state;
}
void setup(engine::World& world, const engine::WorldConfig& config) {
  engine::initialize_world(world, config);
  CHECK(engine::spawn_player_default(world, engine::test::player(world), "native",
                                     engine::make_default_profile())
            .valid());
  (void)engine::spawn_loadout_petals(world, engine::test::player(world));
  const auto mob = engine::diagnostics::spawn_mob(world, engine::catalog::SpeciesId::kLadybug, {});
  CHECK(mob.valid());
  CHECK(engine::diagnostics::set_entity_field(world, mob, 0U, -5000.0));
  CHECK(!engine::diagnostics::set_entity_field(world, mob, 99U, 0.0));
  engine::test::input(world, 1U, engine::f32(0.5F), engine::f32(10.0F));
}
State step(engine::World& world, engine::SnapshotPublisher& publisher, unsigned index) {
  if (index == 2U) {
    world.record_hit(engine::test::player(world).player(), {}, engine::f32(1.0F),
                     engine::f32(99.0F));
    (void)world.death_shuffle_random().next();
  }
  if (index == 3U) {
    const auto victim =
        engine::diagnostics::spawn_mob(world, engine::catalog::SpeciesId::kLadybug, {});
    CHECK(world.destroy(victim));
  }
  engine::advance_world(world);
  return observe(world, publisher);
}
std::vector<State> isolated(const engine::WorldConfig& config) {
  auto world = std::make_unique<engine::World>();
  engine::SnapshotPublisher publisher;
  publisher.reset(true);
  setup(*world, config);
  std::vector<State> result{observe(*world, publisher)};
  for (unsigned index = 0; index < 20U; ++index) {
    result.push_back(step(*world, publisher, index));
  }
  return result;
}
}
int main() {
  const engine::WorldConfig a{.populate = true};
  const engine::WorldConfig b{
      .populate = true, .handle_seed = 17, .game_seed = 1234567U, .death_shuffle_seed = 37U};
  const auto expected_a = isolated(a), expected_b = isolated(b);
  CHECK(expected_a.front() != expected_b.front());
  auto first = std::make_unique<engine::World>(), second = std::make_unique<engine::World>();
  engine::SnapshotPublisher publisher_a, publisher_b;
  publisher_a.reset(true);
  publisher_b.reset(true);
  setup(*first, a);
  setup(*second, b);
  CHECK(observe(*first, publisher_a) == expected_a[0]);
  CHECK(observe(*second, publisher_b) == expected_b[0]);
  for (unsigned index = 0; index < 20U; ++index) {
    // Alternate which world goes first as well as alternating world steps.
    if (index % 2U == 0U) {
      CHECK(step(*first, publisher_a, index) == expected_a[index + 1]);
      CHECK(step(*second, publisher_b, index) == expected_b[index + 1]);
    } else {
      CHECK(step(*second, publisher_b, index) == expected_b[index + 1]);
      CHECK(step(*first, publisher_a, index) == expected_a[index + 1]);
    }
  }
  CHECK(first->tick() == 20U && first->time_ms() == 1000.0);
  CHECK(&first->collision().tree != &second->collision().tree);
  const auto untouched = observe(*second, publisher_b);
  engine::initialize_world(*first, a);
  CHECK(first->tick() == 0 && first->destroyed().empty() && first->hit_events().empty());
  CHECK(!first->collision().prepared && first->quadtree_updates() == 0);
  // Resetting one world cannot clear the other's events, cache, clock or RNG.
  const auto after = observe(*second, publisher_b);
  CHECK(untouched.domain == after.domain);
  auto empty = std::make_unique<engine::World>();
  engine::advance_world(*empty);
  CHECK(empty->tick() == 0 && empty->rng_draws() == 0);
  engine::initialize_world(*empty);
  engine::advance_world(*empty);
  CHECK(empty->tick() == 1 && empty->rng_draws() == 6);
  std::printf("core-only two-world initialization/RNG/events/collision/snapshot: %s\n",
              engine::test::failures ? "FAIL" : "PASS");
  return engine::test::failures ? 1 : 0;
}
