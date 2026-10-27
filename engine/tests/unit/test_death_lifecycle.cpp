#include "engine/net/worker_api.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/player.hpp"
#include <array>
#include <cstdlib>
#include <iostream>
#include <vector>

namespace {
void require(bool condition, const char* message) {
  if (!condition) { std::cerr << message << '\n'; std::exit(1); }
}

// Native original43/145 + opcode6, game RNG 47, shuffle RNG 1. Reproduce with
// node engine/tests/oracle/death-lifecycle-evidence.mjs. These are observations
// from the frozen WASM, not expectations derived from the C++ implementation.
struct Case {
  std::uint8_t level, respawn_level;
  float score;
  std::vector<std::uint16_t> survivors, drops;
};
const std::array<Case, 6> cases{{
  {1, 1, 0, {15, 9, 10, 18, 8, 7, 6, 2}, {19, 12, 22}},
  {14, 10, 86, {15, 9, 10, 18, 8, 7, 6, 2}, {19, 12, 22}},
  {15, 11, 105, {15, 9, 10, 18, 29, 6, 7, 8, 2}, {19, 12, 22}},
  {30, 22, 577, {12, 22, 9, 29, 18, 10, 6, 7, 8}, {34, 15, 19}},
  {45, 33, 2008, {12, 22, 9, 29, 18, 10, 36, 8, 7, 2}, {34, 15, 19}},
  {99, 74, 66523, {12, 22, 9, 29, 18, 10, 36, 8, 7, 2}, {34, 15, 19}},
}};

void original_lifecycle(const Case& expected, bool restart_opcode) {
  engine::WorkerApi api;
  api.init(false);
  auto& world = api.world();
  const std::array<std::uint8_t, 3> join{0, 6, 0};
  require(api.send(join, {}), "initial protocol spawn");
  const auto body = world.player();
  const std::array<std::uint16_t, 16> carried{1, 2, 6, 7, 8, 9, 10, 12, 15, 18, 19, 22, 25, 29, 34, 36};
  world.profile().set_level(expected.level);
  world.profile().set_experience(engine::f32(2.5F));
  for (std::uint8_t i = 0; i < carried.size(); ++i) world.profile().set_inventory(i, carried[i]);
  world.profile().set_inventory_count(16);
  world.loadout().restore_from_profile(world.profile());
  world.loadout().set_score(engine::f32(1234.5F));
  world.random().seed(47);
  world.seed_death_shuffle(1);
  const std::array<std::uint8_t, 3> suicide{1, 3, 0};
  require(api.send(suicide, {}), "real suicide packet accepted");
  const auto* corpse = world.entities().get(body);
  require(corpse && corpse->death_processed, "suicide processes death immediately, before think");
  require(corpse->health.value == 0 && corpse->death_time_ms == 1000, "original 1000ms deadline");
  require(world.profile().inventory() == carried, "corpse retains complete carried inventory");
  require(world.profile().experience().value == 2.5F, "corpse retains final XP");
  require(world.last_death_score().value == 1234.5F, "death captures final points");
  require(world.last_death_level() == expected.level, "death captures final level");
  require(world.last_death_kept_count() == expected.survivors.size(), "original survivor count");
  for (std::size_t i = 0; i < expected.survivors.size(); ++i)
    require(world.last_death_kept()[i] == expected.survivors[i], "original survivor order");
  require(world.pickups().size() == expected.drops.size(), "original ground drop count");
  for (std::size_t i = 0; i < expected.drops.size(); ++i)
    require(world.entities().get(world.pickups()[i])->type_id == expected.drops[i], "original ground drop order");
  const std::array<std::uint8_t, 3> too_early{2, 6, 0};
  require(api.send(too_early, {}), "early spawn packet parsed");
  require(world.player() == body, "corpse blocks early spawn");
  for (int step = 0; step < 19; ++step) api.think();
  require(world.entities().get(body) != nullptr, "corpse remains through 950ms");
  api.think();
  require(world.entities().get(body) == nullptr && !world.player().valid(), "corpse removed at 1000ms");
  const std::array<std::uint8_t, 3> blocked{0, 6, 0};
  require(api.send(blocked, {}), "post-corpse spawn parsed");
  require(!world.player().valid(), "original 2500ms spawn cooldown outlives corpse");
  for (int step = 0; step < 29; ++step) api.think();
  require(api.send(blocked, {}), "2450ms retry parsed");
  require(!world.player().valid(), "spawn still blocked at 2450ms");
  api.think();
  require(world.time_ms() == 2500, "exact spawn cooldown boundary");
  const std::vector<std::uint8_t> spawn = restart_opcode
    ? std::vector<std::uint8_t>{3, 4} : std::vector<std::uint8_t>{3, 6, 'n', 'e', 'w', 0};
  require(api.send(spawn, {}), "respawn packet accepted");
  require(world.player().valid() && world.player() != body, "new body created");
  require(world.profile().level() == expected.respawn_level, "75 percent level, minimum one");
  require(world.profile().experience().value == 0, "partial XP discarded");
  require(world.loadout().score().value == expected.score, "points rebuilt from level thresholds");
  for (std::uint8_t i = 0; i < carried.size(); ++i) {
    const auto type = i < expected.survivors.size() ? expected.survivors[i]
      : i < world.profile().active_slots() ? 1 : 0;
    require(world.profile().inventory(i) == type, "survivors then Basic fillers, empty reserves otherwise");
    require(world.loadout().slots()[i].type_id == type, "profile and actual loadout agree");
  }
  require(world.profile().backpack_count() == 0 && world.profile().lost_count() == 0,
    "old backpack and loss lists do not leak into new life");
  require(world.last_death_kept_count() == 0, "spawn consumes remembered survivors");
  const auto* reborn = world.entities().get(world.player());
  require(reborn->health == reborn->max_health, "respawn restores full health");
}

void basic_fillers_and_repeated_death() {
  engine::WorkerApi api; api.init(false);
  const std::array<std::uint8_t, 3> join{1, 6, 0};
  require(api.send(join, {}), "fresh join");
  auto& world = api.world();
  for (std::uint8_t life = 0; life < 2; ++life) {
    const auto body = world.player();
    (void)engine::damage_entity(world, body, world.entities().get(body)->health);
    require(world.last_death_kept_count() == 0, "Basic never survives or drops");
    for (int step = 0; step < 50; ++step) api.think();
    const std::array<std::uint8_t, 3> join_again{static_cast<std::uint8_t>(life + 2), 6, 0};
    require(api.send(join_again, {}), "next join");
    require(world.profile().level() == 1 && world.loadout().score().value == 0, "fresh minimum on repeated deaths");
    require(world.profile().inventory_count() == 5, "five fresh fillers");
    for (std::uint8_t slot = 0; slot < 16; ++slot)
      require(world.profile().inventory(slot) == (slot < 5 ? 1 : 0), "no stale reserve petals");
  }
}

void persistent_death_shuffle() {
  engine::WorkerApi api; api.init(false);
  require(api.send(std::array<std::uint8_t, 3>{0, 6, 0}, {}), "shuffle fixture join");
  auto& world = api.world();
  world.seed_death_shuffle(2147483647U); // Original normalization: modulo, zero->1.
  const std::array<std::uint32_t, 3> states{192302371U, 914937185U, 662405787U};
  const std::array<std::array<std::uint16_t, 10>, 3> survivors{{
    {12,22,9,29,18,10,36,8,7,2},
    {12,22,18,10,29,9,36,8,6,2},
    {22,12,10,36,9,29,18,6,8,2},
  }};
  const std::array<std::uint16_t, 16> carried{1,2,6,7,8,9,10,12,15,18,19,22,25,29,34,36};
  for (std::size_t life = 0; life < states.size(); ++life) {
    world.profile().set_level(45);
    for (std::uint8_t slot = 0; slot < carried.size(); ++slot) world.profile().set_inventory(slot, carried[slot]);
    world.profile().set_inventory_count(16);
    world.loadout().restore_from_profile(world.profile());
    world.random().seed(47); // Does not reseed the independent death stream.
    const auto body = world.player();
    (void)engine::damage_entity(world, body, world.entities().get(body)->health);
    require(world.death_shuffle_random().state() == states[life], "successive original shuffle state");
    require(world.last_death_kept_count() == 10, "successive original survivor count");
    for (std::size_t i = 0; i < 10; ++i)
      require(world.last_death_kept()[i] == survivors[life][i], "successive original survivor ordering");
    for (int step = 0; step < 50; ++step) api.think();
    require(api.send(std::array<std::uint8_t, 3>{0, 6, 0}, {}), "successive original respawn");
    require(world.player().valid(), "successive body created");
    require(world.death_shuffle_random().state() == states[life], "spawn must not reseed death shuffle");
  }
}

void late_death_has_no_new_spawn_cooldown() {
  engine::WorkerApi api; api.init(false);
  require(api.send(std::array<std::uint8_t, 3>{0, 6, 0}, {}), "late fixture join");
  for (int step = 0; step < 60; ++step) api.think();
  const auto body = api.world().player();
  (void)engine::damage_entity(api.world(), body, api.world().entities().get(body)->health);
  for (int step = 0; step < 20; ++step) api.think();
  require(api.send(std::array<std::uint8_t, 3>{0, 6, 0}, {}), "late death spawn parsed");
  require(api.world().player().valid(), "cooldown is measured from spawn, not death");
}
} // namespace

int main() {
  for (const auto& expected : cases) for (const bool opcode : {false, true}) original_lifecycle(expected, opcode);
  basic_fillers_and_repeated_death();
  persistent_death_shuffle();
  late_death_has_no_new_spawn_cooldown();
  std::cout << "death lifecycle: 12 original-WASM cases, 1000/2500ms gates, persistent shuffle, repeated deaths passed\n";
}
