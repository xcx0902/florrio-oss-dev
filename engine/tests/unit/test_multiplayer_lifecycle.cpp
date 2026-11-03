#include "../support/gameplay.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/pets.hpp"
#include "engine/sim/loot.hpp"
#include <tuple>

namespace {
using namespace engine;
using namespace engine::test;
using namespace engine::test::gameplay;

void nearest_pickup_wins_and_equal_distance_uses_player_id() {
  for (unsigned repeat = 0; repeat < 10; ++repeat) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-30), profile());
    const auto b = join_player(*world, "B", at(10), profile());
    const auto drop = spawn_drop(*world, 2, at(0));
    world->set_time_ms(500);
    CHECK(find_pickup_recipient(*world, drop) == state(*world, b).player());
    CHECK(collect_drops(*world) == 1 && collect_drops(*world) == 0);
    CHECK(world->entities().get(drop)->pickup_recipient == b);
    CHECK(state(*world, b).profile().inventory(0) == 2 &&
          state(*world, a).profile().inventory(0) == 0);
    CHECK(state(*world, b).loadout().pickup_transfers().size() == 1);
    CHECK(state(*world, a).loadout().pickup_transfers().empty());
    body(*world, b).set_position(at(30));
    const auto tie = spawn_drop(*world, 3, at(0));
    world->set_time_ms(1000);
    CHECK(find_pickup_recipient(*world, tie) == state(*world, a).player());
    CHECK(collect_drops(*world) == 1);
    CHECK(world->entities().get(tie)->pickup_recipient == a);
    CHECK(state(*world, a).profile().inventory(0) == 3);
  }
}

void pickup_capacity_death_and_departure_are_transactional() {
  auto world = make_world();
  auto full = profile();
  for (unsigned slot = 0; slot < full.inventory_size(); ++slot) {
    full.set_inventory(slot, 1);
  }
  full.set_inventory_count(full.inventory_size());
  const auto a = join_player(*world, "full", at(0), full);
  const auto b = join_player(*world, "receiver", at(30), profile());
  const auto drop = spawn_drop(*world, 2, at(0));
  world->set_time_ms(500);
  CHECK(collect_drops(*world) == 1);
  const auto old = state(*world, b).player();
  CHECK(world->entities().get(drop)->ai.target == old);
  CHECK(world->entities().get(drop)->pickup_recipient == b);
  CHECK(damage_entity(*world, old, f32(1000), state(*world, a).player()).died);
  CHECK(collect_drops(*world) == 0);
  CHECK(world->entities().get(drop)->ai.target == old);
  CHECK(leave_player(*world, b));
  const auto c = join_player(*world, "new", at(0), profile());
  CHECK(collect_drops(*world) == 0);
  CHECK(state(*world, c).profile().inventory(0) == 0);
  CHECK(world->entities().get(drop)->pickup_recipient == b);
  CHECK(world->entities().get(drop)->ai.target == old);
  advance_ticks(*world, 40);
  CHECK(world->entities().get(drop) == nullptr);
}

void death_and_loot_run_once_and_other_player_keeps_fighting() {
  auto world = make_world();
  auto carried = profile(2, 30);
  for (unsigned slot = 0; slot < carried.inventory_size(); ++slot) {
    carried.set_inventory(slot, 2);
  }
  carried.set_inventory_count(carried.inventory_size());
  const auto a = join_player(*world, "A", at(-1000), carried);
  const auto b = join_player(*world, "B", at(1000), profile(1));
  const auto target = state(*world, a).player(), b_petal = petal(*world, b);
  CHECK(damage_entity(*world, target, f32(1000), b_petal).died);
  const auto drops = world->pickups().size();
  const auto random = world->random().state(), shuffle = world->death_shuffle_random().state();
  const auto kept = state(*world, a).last_death_kept();
  const auto death_count = world->deaths().size();
  CHECK(drops > 0 && drops <= 3);
  CHECK(!damage_entity(*world, target, f32(1000), b_petal).died);
  kill_entity(*world, target, b_petal);
  CHECK(world->pickups().size() == drops && world->deaths().size() == death_count);
  CHECK(world->random().state() == random && world->death_shuffle_random().state() == shuffle);
  CHECK(state(*world, a).last_death_kept() == kept);
  CHECK(state(*world, a).last_killer_name() == "B");
  CHECK(state(*world, a).death.source.player == b);
  CHECK(petal(*world, b) == b_petal && world->entities().get(b_petal)->health.value > 0);
  CHECK(apply_player_input(*world, b, 1, 1, f32(0), f32(200)));
  advance_ticks(*world, 1);
  CHECK(body(*world, b).position.x.value > 1000);
  const auto monster = spawn_entity_from_defaults(*world, EntityKind::kMob, 1, at(5000));
  CHECK(damage_entity(*world, monster, f32(10000), b_petal).died);
  CHECK(state(*world, b).loadout().score().value > 0);
  advance_ticks(*world, 19);
  CHECK(world->entities().get(target) == nullptr);
  CHECK(state(*world, a).last_killer_name() == "B" && state(*world, a).last_death_level() == 30);
  CHECK(leave_player(*world, a));
  CHECK(world->pickups().size() >= drops);
}

void simultaneous_lethal_contacts_keep_solver_order_and_sources() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(0), profile(0, 10));
  const auto b = join_player(*world, "B", at(30), profile(0, 10));
  body(*world, a).contact_damage = f32(1000);
  body(*world, b).contact_damage = f32(1000);
  contacts(*world);
  CHECK(body(*world, a).death_processed && body(*world, b).death_processed);
  CHECK(state(*world, a).last_killer_name() == "B" && state(*world, b).last_killer_name() == "A");
  CHECK(state(*world, a).death.source.player == b && state(*world, b).death.source.player == a);
  CHECK(world->deaths().size() == 2);
  contacts(*world);
  CHECK(world->deaths().size() == 2);
  CHECK(state(*world, a).loadout().score() == f32(0) &&
        state(*world, b).loadout().score() == f32(0));
}

void spawn_fails_cleanly_when_all_candidates_are_occupied() {
  auto world = make_world();
  world->set_dimensions(f32(100), f32(100));
  const auto a = join_player(*world, "occupant", at(0), profile());
  const auto b = register_player(*world, "waiting");
  const auto count = world->entities().active_count();
  CHECK(!spawn_registered_player(*world, b, 0, "waiting", false).valid());
  CHECK(state(*world, b).life_epoch == 0 && !state(*world, b).player().valid());
  CHECK(world->entities().active_count() == count);
  advance_ticks(*world, 1);
  CHECK(world->tick() == 1 && body(*world, a).health.value > 0);
  CHECK(leave_player(*world, a));
  CHECK(spawn_registered_player(*world, b, 0, "waiting", false).valid());
}

void native_two_player_spawn_combat_loot_respawn_loop() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000), profile(1));
  auto inventory = profile(2);
  for (unsigned slot = 0; slot < 13; ++slot) {
    inventory.set_inventory(slot, 2);
  }
  inventory.set_inventory_count(13);
  const auto b = join_player(*world, "B", at(1000), inventory);
  const auto old = state(*world, b).player();
  body(*world, b).health = f32(1);
  body(*world, b).contact_damage = f32(0);
  world->entities().get(petal(*world, a))->set_position(at(1010));
  contacts(*world);
  CHECK(state(*world, b).life == PlayerLife::kCorpse);
  CHECK(state(*world, b).last_killer_name() == "A");
  CHECK(!world->pickups().empty());
  body(*world, a).set_position(at(1000));
  world->set_time_ms(500);
  CHECK(collect_drops(*world) > 0);
  for (auto drop : world->pickups()) {
    CHECK(world->entities().get(drop)->pickup_recipient == a);
  }
  CHECK(collect_drops(*world) == 0);
  advance_ticks(*world, 49);
  CHECK(!spawn_registered_player(*world, b, 1, "B", false).valid());
  advance_ticks(*world, 1);
  const auto fresh = spawn_registered_player(*world, b, 1, "B", false);
  CHECK(fresh.valid() && fresh != old && state(*world, b).id() == b);
  CHECK(state(*world, b).life_epoch == 2 && state(*world, b).input().buttons == 0);
  CHECK(!apply_player_input(*world, b, 1, 1, f32(0), f32(200)));
  CHECK(!discard_player_slot(*world, b, 1, 0, state(*world, b).profile().inventory(0)));
  CHECK(!world->destroy(old));
  CHECK(state(*world, a).life_epoch == 1 && state(*world, a).profile().inventory(1) == 2);
}

void departure_after_body_removal_cleans_orphan_attacks_and_areas() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000), profile(29));
  const auto b = join_player(*world, "B", at(1000), profile(1));
  CHECK(apply_player_input(*world, a, 1, 1, f32(0), f32(0)));
  world->set_time_ms(550);
  update_petal_orbits(*world, state(*world, a), 0);
  update_petal_behaviors(*world, 650);
  CHECK(world->area_effects().size() == 1);
  CHECK(world->destroy(state(*world, a).player()));
  CHECK(leave_player(*world, a));
  CHECK(world->area_effects().empty() && world->deferred_launches().empty());
  for (const auto& entity : world->entities().active_entities()) {
    CHECK(entity.attribution.player != a);
  }
  CHECK(world->entities().active_count() == 2);
  CHECK(petal(*world, b).valid());
}

void one_hundred_lives_leave_no_persistent_gameplay_residue() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-22000), profile());
  const auto b = join_player(*world, "B", at(22000), profile());
  const auto b_body = state(*world, b).player();
  for (unsigned cycle = 0; cycle < 100; ++cycle) {
    auto& player = state(*world, a);
    for (std::uint8_t slot = 0; slot < 16; ++slot) {
      const auto type = player.loadout().slots()[slot].type_id;
      if (type != 0) {
        CHECK(discard_player_slot(*world, a, player.life_epoch, slot, type));
      }
    }
    const std::uint16_t types[]{11, 22, 29, 8, 23, 34, 30, 32};
    const auto type = types[cycle % 8];
    CHECK(player.loadout().change_slot_type(*world, player, player.profile(), 0, type));
    (void)spawn_loadout_petals(*world, player);
    CHECK(apply_player_input(*world, a, player.life_epoch, 1, f32(0), f32(0), 100));
    advance_ticks(*world, 51);  // includes Egg hatch, Peas and Web launch/expiry
    const auto old = player.player();
    const auto epoch = player.life_epoch;
    CHECK(apply_effect(*world, old, EffectType::kSlow, f32(0.5), 100, b_body));
    CHECK(damage_entity(*world, old, f32(10000), b_body).died);
    CHECK(!damage_entity(*world, old, f32(10000), b_body).died);
    CHECK(!spawn_registered_player(*world, a, epoch, "A", false).valid());
    advance_ticks(*world, 300);  // allow 12s Web, corpse and collected-loot windows to end
    CHECK(world->area_effects().empty() && world->deferred_launches().empty());
    for (auto drop : std::vector<EntityHandle>(world->pickups())) {
      CHECK(world->destroy(drop));
    }
    CHECK(world->entities().active_count() == 1);
    CHECK(player.petals().empty());
    CHECK(state(*world, b).player() == b_body && state(*world, b).profile().level() == 1);
    const auto fresh = spawn_registered_player(*world, a, epoch, "A", false);
    CHECK(fresh.valid() && fresh != old && player.life_epoch == epoch + 1);
    body(*world, a).set_position(at(-22000));
    CHECK(!apply_player_input(*world, a, epoch, 3, f32(0), f32(200)));
    publish_cleanup(*world);
  }
  CHECK(state(*world, a).life_epoch == 101 && world->entities().active_count() == 7);
}

auto scenario(World& world, PlayerId a, PlayerId b) {
  const auto target = spawn_entity_from_defaults(world, EntityKind::kMob, 1, at(5000));
  const auto payload = add_area_effect(world, state(world, a).player(), f32(10), EffectType::kSlow,
                                       f32(0.5), 100, state(world, a).player());
  CHECK(damage_entity(world, target, f32(10000), petal(world, a)).died);
  CHECK(damage_entity(world, state(world, b).player(), f32(10000), petal(world, a)).died);
  return payload;
}
auto observation(World& world, PlayerId a, PlayerId b,
                 const std::shared_ptr<EffectPayload>& payload) {
  return std::tuple(world.random().state(), world.death_shuffle_random().state(),
                    state(world, a).loadout().score().value, state(world, b).last_killer_name(),
                    world.pickups().size(), world.deaths().size(), payload->id);
}
void interleaved_worlds_keep_events_rewards_rng_and_effect_ids_isolated() {
  auto first = make_world(123), second = make_world(123), reference = make_world(123);
  auto seed = [](World& world) {
    return std::pair(join_player(world, "A", at(-1000), profile(1)),
                     join_player(world, "B", at(1000), profile(2)));
  };
  const auto [a1, b1] = seed(*first);
  const auto [a2, b2] = seed(*second);
  const auto [a3, b3] = seed(*reference);
  const auto payload1 = scenario(*first, a1, b1);
  const auto payload2 = scenario(*second, a2, b2);
  const auto payload3 = scenario(*reference, a3, b3);
  for (unsigned tick = 0; tick < 2; ++tick) {
    advance_world(*first);
    advance_world(*second);
  }
  advance_ticks(*reference, 2);
  const auto result1 = observation(*first, a1, b1, payload1);
  const auto result2 = observation(*second, a2, b2, payload2);
  const auto result3 = observation(*reference, a3, b3, payload3);
  CHECK(result1 == result2 && result2 == result3);
  first->reset();
  CHECK(state(*second, b2).last_killer_name() == "A" && second->tick() == 2);
}
}

int main() {
  engine::test::tapOutput = true;
  std::printf("TAP version 13\n");
#define RUN(name) engine::test::runTest(#name, name)
  RUN(nearest_pickup_wins_and_equal_distance_uses_player_id);
  RUN(pickup_capacity_death_and_departure_are_transactional);
  RUN(death_and_loot_run_once_and_other_player_keeps_fighting);
  RUN(simultaneous_lethal_contacts_keep_solver_order_and_sources);
  RUN(spawn_fails_cleanly_when_all_candidates_are_occupied);
  RUN(native_two_player_spawn_combat_loot_respawn_loop);
  RUN(departure_after_body_removal_cleans_orphan_attacks_and_areas);
  RUN(one_hundred_lives_leave_no_persistent_gameplay_residue);
  RUN(interleaved_worlds_keep_events_rewards_rng_and_effect_ids_isolated);
#undef RUN
  std::printf("1..%d\n", engine::test::testsRun);
  return engine::test::failures ? 1 : 0;
}
