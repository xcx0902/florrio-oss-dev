#include <iterator>
#include "engine/model/catalog.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/tick.hpp"
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>

namespace {

void require(bool condition, const char* message) {
  if (condition) return;
  std::fprintf(stderr, "Rose regression: %s\n", message);
  std::exit(1);
}

engine::EntityHandle setup(engine::World& world, std::uint16_t type) {
  world.initialize();
  world.set_auto_populate(false);
  const auto owner = engine::spawn_player_default(world, "rose", engine::make_default_profile());
  require(owner.valid(), "player spawns");
  world.profile().set_inventory(0, type);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  require(world.loadout().equip(0, type), "Rose equips");
  require(engine::spawn_loadout_petals(world) > 0U, "Rose instances spawn");
  world.entities().get(owner)->health = engine::f32(50.0F);
  return owner;
}

void recharge_cycles(std::uint16_t type) {
  engine::World world;
  const auto owner = setup(world, type);
  const auto old = world.loadout().slots()[0].instances;
  const auto count = world.loadout().slots()[0].count;
  const auto* combat = engine::Catalog::instance().petal_combat(type);
  require(combat != nullptr, "catalog exists");
  const float heal = type == 6U ? 10.0F : type == 15U ? 22.0F : 3.5F;
  for (int cycle = 0; cycle < 2; ++cycle) {
    const auto handles = world.loadout().slots()[0].instances;
    const double start = world.time_ms();
    world.entities().get(owner)->health = engine::f32(50.0F);
    for (int tick = 1; tick <= 28; ++tick) {
      world.set_time_ms(start + tick * 50.0);
      engine::update_petal_orbits(world, 50.0);
    }
    require(world.entities().get(owner)->health.value == 50.0F, "no heal at 1400ms");
    world.set_time_ms(start + 1450.0);
    engine::update_petal_orbits(world, 50.0);
    require(world.entities().get(owner)->health.value == 50.0F + count * heal,
      "all Rose instances heal in the same callback frame");
    require(world.petals().empty(), "consumed orbit records are removed");
    for (std::uint8_t instance = 0; instance < count; ++instance) {
      const auto* corpse = world.entities().get(handles[instance]);
      require(corpse != nullptr && corpse->health.value == 0.0F && corpse->death_processed,
        "the full current health is consumed");
      require(corpse->death_time_ms == world.time_ms() + 1000.0, "ordinary corpse window");
      require(!world.loadout().handle(0, instance).valid(), "equipped handle is released");
    }
    require(world.loadout().slots()[0].recharge_remaining_ms == combat->rechargeMilliseconds,
      "consumption arms catalog recharge");
    require(engine::refresh_loadout_petals(world, combat->rechargeMilliseconds - 50.0) == 0U,
      "no spawn before the catalog duration");
    require(world.loadout().recharge_progress()[0] < 65535U, "recharge reaches the wire state");
    world.set_time_ms(world.time_ms() + combat->rechargeMilliseconds);
    require(engine::refresh_loadout_petals(world, 50.0) == count,
      "all instances respawn at the catalog duration");
    for (std::uint8_t instance = 0; instance < count; ++instance)
      require(world.loadout().handle(0, instance) != old[instance], "respawn has a new handle");
    require(world.loadout().recharge_progress()[0] == 65535U, "ready wire state is full");
    for (const auto& state : world.petals())
      require(state.behavior_state == 0U && state.behavior_started_at_ms == world.time_ms(),
        "respawn starts a fresh behavior timer and state");
  }
}

void timer_boundary() {
  engine::World world;
  world.initialize();
  world.set_time_ms(5000.0);
  const auto owner = engine::spawn_player_default(world, "late", engine::make_default_profile());
  world.loadout().clear();
  require(world.loadout().equip(0, 6), "late Rose equips");
  require(engine::spawn_loadout_petals(world) == 1U, "late Rose spawns");
  auto* player = world.entities().get(owner);
  player->health = engine::f32(50.0F);
  world.set_time_ms(6000.0);
  engine::update_petal_orbits(world, 1000.0);
  require(world.petals()[0].behavior_state == 0U, "exactly 1000ms is still gated");
  world.set_time_ms(6000.001);
  engine::update_petal_orbits(world, 0.001);
  require(world.petals()[0].behavior_state == 2U, "first contraction increments the state twice");
  player->health = player->max_health;
  engine::update_petal_orbits(world, 16.67);
  require(world.petals()[0].behavior_state == 3U, "armed contraction continues at full health");
}

// Committed frame-by-frame product expectations for the rose callbacks. No
// movement or regeneration pass obscures the callback.
void trace() {
  std::printf("[");
  for (const auto type : {6U, 15U, 24U}) {
    engine::World world;
    const auto owner = setup(world, static_cast<std::uint16_t>(type));
    // The callback comparison uses one instance for each variant.
    while (world.petals().size() > 1U) world.petals().pop_back();
    auto* player = world.entities().get(owner);
    player->set_position_x(engine::f32(1.0F));
    player->set_position_y(engine::f32(2.0F));
    const auto petal_handle = world.petals()[0].handle;
    auto* petal = world.entities().get(petal_handle);
    petal->set_position_x(engine::f32(3.0F));
    petal->set_position_y(engine::f32(4.0F));
    std::printf("%s{\"type\":%u,\"frames\":[", type == 6U ? "" : ",", type);
    for (int frame = 1; frame <= 29; ++frame) {
      world.set_time_ms(frame * 50.0);
      engine::update_petal_orbits(world, 50.0);
      std::printf("%s{\"now\":%d,\"state\":%u,\"x\":%.17g,\"y\":%.17g,\"health\":%.17g,\"ownerHealth\":%.17g}",
        frame == 1 ? "" : ",", frame * 50,
        world.petals().empty() ? 10U : static_cast<unsigned>(world.petals()[0].behavior_state),
        static_cast<double>(petal->position.x.value), static_cast<double>(petal->position.y.value),
        static_cast<double>(petal->health.value), static_cast<double>(player->health.value));
    }
    std::printf("]}");
  }
  std::printf("]\n");
}

void lifecycle_trace() {
  std::printf("[");
  for (const auto type : {6U, 15U, 24U}) {
    engine::World world;
    const auto owner = setup(world, static_cast<std::uint16_t>(type));
    std::printf("%s{\"type\":%u,\"frames\":[", type == 6U ? "" : ",", type);
    for (int frame = 1; frame <= 200; ++frame) {
      engine::tick(world, 50.0);
      unsigned alive = 0;
      for (const auto handle : world.loadout().slots()[0].instances) {
        const auto* petal = world.entities().get(handle);
        if (petal != nullptr && petal->health.value > 0.0F) ++alive;
      }
      std::printf("%s{\"now\":%d,\"ownerHealth\":%.17g,\"alive\":%u,\"progress\":%u}",
        frame == 1 ? "" : ",", frame * 50,
        static_cast<double>(world.entities().get(owner)->health.value), alive,
        static_cast<unsigned>(world.loadout().recharge_progress()[0]));
    }
    std::printf("]}");
  }
  std::printf("]\n");
}

} // namespace

int main(int argc, char** argv) {
  if (argc > 1 && std::strcmp(argv[1], "--trace") == 0) { trace(); return 0; }
  if (argc > 1 && std::strcmp(argv[1], "--lifecycle") == 0) { lifecycle_trace(); return 0; }
  for (const auto type : {6U, 15U, 24U}) recharge_cycles(static_cast<std::uint16_t>(type));
  timer_boundary();
  std::puts("Rose variants, repeated recharge, simultaneous consumption and strict timer: passed");
}
