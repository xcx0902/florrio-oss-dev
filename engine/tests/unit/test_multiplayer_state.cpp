// Core-only native tests: no WorkerApi, decoder, WASM or network initialization.
#include "../support/multiplayer.hpp"
#include "../support/test_support.hpp"
#include "engine/catalog/ids.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/passives.hpp"
#include "engine/sim/spawn.hpp"
#include <cmath>
#include <limits>
#include <string>
#include <type_traits>
#include <vector>

namespace {
using namespace engine;
using engine::test::advance_ticks;
using engine::test::join_player;
using engine::test::make_world;
Vec2 at(float x, float y = 0.0F) {
  return {f32(x), f32(y)};
}
PlayerState& state(World& world, PlayerId id) {
  return *world.players().get(id);
}
Entity& body(World& world, PlayerId id) {
  return *world.entities().get(state(world, id).player());
}

void registry_is_stable_ordered_and_generational() {
  static_assert(!std::is_convertible_v<std::uint64_t, PlayerId>);
  auto world = make_world();
  CHECK(!PlayerId{}.valid());
  CHECK(world->players().get({}) == nullptr);
  CHECK(!world->players().erase({}));
  const auto first = register_player(*world, "first");
  auto* saved = world->players().get(first);
  for (unsigned i = 0; i < 128; ++i) {
    CHECK(register_player(*world, std::to_string(i)).valid());
  }
  CHECK(world->players().get(first) == saved);
  std::uint64_t previous = 0;
  world->players().for_each([&](PlayerState& player) {
    CHECK(player.id().raw > previous);
    previous = player.id().raw;
    CHECK(!world->players().create().valid());
    CHECK(!world->players().erase(player.id()));
    CHECK(!leave_player(*world, player.id()));
    world->players().clear();
  });
  CHECK(world->players().size() == 129);
  const auto handle = spawn_player(*world, *saved, "first", at(-1000), {});
  CHECK(handle.valid());
  CHECK(!world->players().erase(first));
  CHECK(world->players().by_body(handle) == saved);
  CHECK(world->players().by_body(
            EntityHandle::from_parts(handle.index(), handle.generation() + 1)) == nullptr);
  CHECK(world->destroy(handle));
  CHECK(world->players().by_body(handle) == nullptr);
  CHECK(world->players().erase(first));
  const auto replacement = register_player(*world, "replacement");
  CHECK(replacement.raw > previous && replacement != first);
  CHECK(world->players().get(first) == nullptr);
  CHECK(world->players().get(replacement)->life_epoch == 0);
}

void two_players_spawn_in_one_world() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000));
  const auto b = join_player(*world, "B", at(1000));
  CHECK(a.valid() && b.valid() && a != b);
  CHECK(state(*world, a).player() != state(*world, b).player());
  CHECK(world->players().size() == 2);
  CHECK(world->entities().active_count() == 12);  // two bodies, ten Basic petals
  CHECK(state(*world, a).life_epoch == 1 && state(*world, b).life_epoch == 1);
  CHECK(state(*world, a).life == PlayerLife::kAlive);
  for (auto id : {a, b}) {
    for (const auto& orbit : state(*world, id).petals()) {
      CHECK(world->entities().get(orbit.handle)->owner == state(*world, id).player().raw);
    }
  }
}

void controls_are_isolated() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000));
  const auto b = join_player(*world, "B", at(1000));
  CHECK(engine::test::apply_player_input(*world, a, 1, f32(0), f32(200)));
  CHECK(engine::test::apply_player_input(*world, b, 2, f32(3.141592653589793), f32(200)));
  CHECK(body(*world, a).velocity.x == 0 && body(*world, b).velocity.x == 0);
  advance_ticks(*world, 1);
  CHECK(body(*world, a).position.x.value > -1000);
  CHECK(body(*world, b).position.x.value < 1000);
  CHECK(state(*world, a).petals()[0].orbit_radius == f32(130));
  CHECK(state(*world, b).petals()[0].orbit_radius == f32(40));
  const auto b_input = state(*world, b).input();
  CHECK(engine::test::apply_player_input(*world, a, 0, f32(0), f32(0)));
  CHECK(state(*world, b).input().buttons == b_input.buttons);
  CHECK(state(*world, b).input().normalized_angle == b_input.normalized_angle);
  advance_ticks(*world, 1);
  CHECK(body(*world, b).velocity.x < 0);
  CHECK(state(*world, a).input().strength == f32(0));
}

void many_inputs_one_tick_one_impulse() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000));
  const auto b = join_player(*world, "B", at(1000));
  const auto rng = world->random().state();
  for (unsigned input = 0; input < 100; ++input) {
    CHECK(engine::test::apply_player_input(*world, a, input & 3, f32(input), f32(200)));
  }
  CHECK(engine::test::apply_player_input(*world, a, 0, f32(0), f32(200)));
  CHECK(engine::test::apply_player_input(*world, b, 0, f32(0), f32(200)));
  CHECK(world->tick() == 0 && world->time_ms() == 0 && world->random().state() == rng);
  CHECK(body(*world, a).velocity.x == 0);
  apply_all_player_controls(*world, 50);
  const auto velocity = body(*world, a).velocity.x;
  apply_all_player_controls(*world, 50);
  CHECK(body(*world, a).velocity.x == velocity);
  advance_ticks(*world, 1);
  CHECK(body(*world, a).velocity.x == body(*world, b).velocity.x);
  CHECK(world->tick() == 1 && world->time_ms() == 50);
}

void profiles_are_isolated() {
  auto world = make_world();
  auto high = make_default_profile();
  high.set_level(45);
  high.set_inventory(0, 13);  // Cactus, +20 maximum health
  high.set_inventory(1, 32);  // Leaf, +1/s
  high.set_inventory(7, 2);
  high.set_inventory_count(8);
  const auto a = join_player(*world, "A", at(22000), high);
  const auto b = join_player(*world, "B", at(-22000));
  state(*world, a).profile().push_backpack(35);
  CHECK(state(*world, a).profile().active_slots() == 8);
  CHECK(state(*world, b).profile().active_slots() == 5);
  CHECK(state(*world, b).profile().backpack_count() == 0);
  body(*world, a).health = f32(50);
  body(*world, b).health = f32(50);
  regenerate_players(*world, 50);
  CHECK(body(*world, a).max_health == f32(170));
  CHECK(body(*world, b).max_health == f32(100));
  CHECK(equipped_leaf_healing(state(*world, a), 50) == 0.05);
  CHECK(equipped_leaf_healing(state(*world, b), 50) == 0.0);
  const auto b_profile = state(*world, b).profile().inventory();
  CHECK(discard_player_slot(*world, a, 1, 7, 2));
  CHECK(state(*world, a).profile().inventory(7) == 0);
  CHECK(state(*world, b).profile().inventory() == b_profile);
  CHECK(swap_player_slots(*world, a, 1, 0, 13, 2, 1));
  CHECK(state(*world, a).profile().inventory(2) == 13);
  CHECK(state(*world, b).loadout().slots()[2].type_id ==
        catalog::petal_type_id(catalog::PetalId::kBasicCommon));
  const auto b_hp = body(*world, b).health;
  CHECK(apply_effect(*world, state(*world, b).player(), EffectType::kHealBlock, f32(1), 1000,
                     state(*world, a).player()));
  regenerate_players(*world, 50);
  // Even a blocked heal retains the binary32 health rescale.
  CHECK(body(*world, b).health == (f32(100) * b_hp) / f32(100));
}

void zone_state_is_per_player() {
  auto world = make_world();
  auto profile = make_default_profile();
  profile.set_level(60);
  const auto a = join_player(*world, "A", at(-22000), profile);
  const auto b = join_player(*world, "B", at(22000), profile);
  state(*world, a).set_zone_timer_ms(f32(44950));
  const auto b_phase = state(*world, b).loadout().orbit_phase();
  advance_ticks(*world, 1);
  CHECK(state(*world, a).zone_petals_disabled());
  CHECK(state(*world, a).zone_progress() == 255);
  CHECK(state(*world, a).petals().empty());
  CHECK(state(*world, a).loadout().orbit_phase() == f32(0));
  CHECK(!state(*world, b).zone_petals_disabled());
  CHECK(state(*world, b).petals().size() == 5);
  CHECK(state(*world, b).loadout().orbit_phase() != b_phase);
  CHECK(body(*world, b).health.value > 0);
}

void destroy_body_keeps_player_record() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000));
  const auto b = join_player(*world, "B", at(1000));
  auto* saved = world->players().get(a);
  const auto b_body = state(*world, b).player();
  const auto b_petals = state(*world, b).petals().size();
  const auto b_handle = state(*world, b).loadout().handle(0, 0);
  saved->set_last_death(f32(123), 30);
  saved->set_last_killer(b_body, "B");
  const auto old_body = saved->player();
  CHECK(world->destroy(old_body));
  CHECK(!world->destroy(old_body));
  CHECK(world->players().get(a) == saved && !saved->player().valid());
  CHECK(saved->profile().level() == 1 && saved->player_name() == "A");
  CHECK(saved->last_death_score() == f32(123) && saved->last_killer_name() == "B");
  CHECK(world->players().by_body(old_body) == nullptr);
  CHECK(state(*world, b).player() == b_body && state(*world, b).petals().size() == b_petals);
  CHECK(state(*world, b).loadout().handle(0, 0) == b_handle);
  advance_ticks(*world, 1);
  CHECK(!saved->player().valid() && saved->petals().empty());
  CHECK(world->entities().get(b_body) != nullptr);
}

void spawn_is_idempotent() {
  auto world = make_world();
  const auto a = register_player(*world, "A");
  auto& player = state(*world, a);
  const auto handle = spawn_registered_player(*world, a, 0, "A", false);
  CHECK(handle.valid());
  const auto entities = world->entities().active_count();
  const auto random = world->random().state();
  const auto generation_rng = world->rng().state();
  CHECK(!spawn_registered_player(*world, a, 0, "overwritten").valid());
  CHECK(!spawn_registered_player(*world, a, 1, "overwritten").valid());
  CHECK(!spawn_player_default(*world, player, "overwritten", make_default_profile()).valid());
  CHECK(player.player() == handle && player.life_epoch == 1 && player.player_name() == "A");
  CHECK(world->entities().active_count() == entities && world->random().state() == random);
  CHECK(world->rng().state() == generation_rng && player.petals().size() == 5);
  CHECK(!spawn_registered_player(*world, PlayerId{9999}, 0, "unknown").valid());
}

void stale_body_handle_is_rejected() {
  auto world = make_world();
  const auto id = register_player(*world, "reuse");
  auto& player = state(*world, id);
  const auto old = spawn_player(*world, player, "reuse", at(0), {});
  CHECK(world->destroy(old));
  advance_ticks(*world, 50);
  // Fill the remaining FIFO slots so this next real spawn reuses the exact
  // old index with a different generation, rather than merely another index.
  for (unsigned i = 0; i < kEntitySlotCount - 4; ++i) {
    CHECK(world->entities().allocate().has_value());
  }
  const auto fresh = spawn_player(*world, player, "reuse", at(0), {});
  CHECK(fresh.valid() && old.index() == fresh.index() && old.generation() != fresh.generation());
  CHECK(world->entities().get(old) == nullptr && world->players().by_body(old) == nullptr);
  CHECK(world->players().by_body(fresh) == &player && player.life_epoch == 2);
  CHECK(!world->destroy(old));
  CHECK(!apply_player_input(*world, id, 1, 1, f32(0), f32(200)));
  CHECK(!discard_player_slot(*world, id, 1, 0, 1));
  CHECK(!swap_player_slots(*world, id, 1, 0, 1, 1, 1));
  CHECK(body(*world, id).health == f32(100));
}

void same_input_sequence_is_independent() {
  // A minimal host fixture keeps reception and adoption separate. No decoder
  // or sequence gate exists in PlayerState; M05 supplies bounded peer policy.
  struct Peer {
    PlayerId id;
    LifeEpoch life;
    unsigned last_received = 0;
    unsigned last_applied = 0;
    bool receive(unsigned sequence) {
      if (sequence <= last_received) {
        return false;
      }
      last_received = sequence;
      return true;
    }
    bool adopt(World& world, f32 angle) {
      if (last_applied == last_received) {
        return false;
      }
      if (!engine::apply_player_input(world, id, life, 0, angle, f32(200))) {
        return false;
      }
      last_applied = last_received;
      return true;
    }
  };
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000));
  const auto b = join_player(*world, "B", at(1000));
  Peer first{a, 1}, second{b, 1};
  CHECK(first.receive(1) && second.receive(1));
  CHECK(first.last_received == 1 && first.last_applied == 0);
  CHECK(first.adopt(*world, f32(0)) && second.adopt(*world, f32(3.141592653589793)));
  CHECK(!first.receive(1));
  CHECK(first.last_applied == 1 && second.last_applied == 1);
  advance_ticks(*world, 1);
  CHECK(body(*world, a).velocity.x > 0 && body(*world, b).velocity.x < 0);
}

void input_expiry_and_life_guards() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000));
  const auto b = join_player(*world, "B", at(1000));
  CHECK(apply_player_input(*world, a, 1, 1, f32(0), f32(200)));
  advance_ticks(*world, 4);
  CHECK(state(*world, a).input().strength == f32(200));
  CHECK(apply_player_input(*world, b, 1, 2, f32(0), f32(100)));
  advance_ticks(*world, 1);
  CHECK(state(*world, a).input().strength == f32(0));
  advance_ticks(*world, 1);
  CHECK(state(*world, a).input().strength == f32(0));
  CHECK((body(*world, a).player_expression & 3) == 0);
  CHECK(state(*world, b).input().strength == f32(100));
  CHECK(state(*world, a).last_applied_input_tick == 0 &&
        state(*world, b).last_applied_input_tick == 4);
  CHECK(!apply_player_input(*world, {}, 1, 0, f32(0), f32(1)));
  CHECK(!apply_player_input(*world, a, 2, 0, f32(0), f32(1)));
  CHECK(!apply_player_input(*world, a, 1, 0, f32(INFINITY), f32(1)));
  CHECK(!apply_player_input(*world, a, 1, 0, f32(0), f32(NAN)));
  CHECK(!apply_player_input(*world, a, 1, 0, f32(0), f32(1), 0));
}

void corpse_respawn_preserves_identity_and_death() {
  auto world = make_world();
  auto profile = make_default_profile();
  profile.set_level(30);
  const auto a = join_player(*world, "A", at(-1000), profile);
  const auto b = join_player(*world, "B", at(1000));
  const auto old = state(*world, a).player();
  CHECK(apply_player_input(*world, a, 1, 3, f32(0), f32(200)));
  CHECK(damage_entity(*world, old, body(*world, a).health, state(*world, b).player()).died);
  CHECK(state(*world, a).life == PlayerLife::kCorpse);
  CHECK(state(*world, a).last_death_level() == 30 && state(*world, a).last_killer_name() == "B");
  CHECK(state(*world, a).input().buttons == 0);
  CHECK(!apply_player_input(*world, a, 1, 1, f32(0), f32(200)));
  CHECK(!spawn_registered_player(*world, a, 1, "A", false).valid());
  advance_ticks(*world, 19);
  CHECK(state(*world, a).player() == old);
  advance_ticks(*world, 1);
  CHECK(!state(*world, a).player().valid() && world->entities().get(old) == nullptr);
  CHECK(state(*world, a).profile().level() == 30 && state(*world, b).life_epoch == 1);
  advance_ticks(*world, 29);
  CHECK(!spawn_registered_player(*world, a, 1, "A", false).valid());
  advance_ticks(*world, 1);
  CHECK(state(*world, a).life == PlayerLife::kRespawnable);
  const auto fresh = spawn_registered_player(*world, a, 1, "A", false);
  CHECK(fresh.valid() && fresh != old && state(*world, a).life_epoch == 2);
  CHECK(state(*world, a).profile().level() == 22 && state(*world, a).last_death_level() == 30);
  CHECK(state(*world, a).input().buttons == 0 && state(*world, a).input().strength == f32(0));
  CHECK(!apply_player_input(*world, a, 1, 3, f32(0), f32(200)));
}

void petal_destruction_and_leave_are_isolated() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000));
  const auto b = join_player(*world, "B", at(1000));
  const auto a_petal = state(*world, a).loadout().handle(0, 0);
  const auto b_petal = state(*world, b).loadout().handle(0, 0);
  CHECK(world->destroy(a_petal));
  CHECK(state(*world, a).petals().size() == 4 && !state(*world, a).loadout().handle(0, 0).valid());
  CHECK(state(*world, b).petals().size() == 5 &&
        state(*world, b).loadout().handle(0, 0) == b_petal);
  CHECK(leave_player(*world, a));
  CHECK(world->players().get(a) == nullptr && world->entities().active_count() == 6);
  CHECK(world->players().by_body(state(*world, b).player()) == &state(*world, b));
  CHECK(!leave_player(*world, a));
  const auto next = register_player(*world, "C");
  CHECK(next.raw > b.raw);
}

void single_player_regression() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000));
  CHECK(apply_player_input(*world, a, 1, 0, f32(0), f32(200)));
  advance_ticks(*world, 1);
  CHECK(world->tick() == 1 && world->time_ms() == 50 && world->quadtree_updates() == 1);
  CHECK(std::abs(body(*world, a).velocity.x - 0.125 * std::pow(0.992, 50.0)) < 1e-12);
  std::vector<std::string> trace;
  for (auto phase : world->phase_trace()) {
    trace.emplace_back(phase);
  }
  CHECK(trace ==
        std::vector<std::string>({"regenerate-players", "drops",          "petal-behaviors",
                                  "linked-constraints", "population",     "ai",
                                  "deferred-launches",  "effects",        "area-effects",
                                  "petal-phase",        "loadout-petals", "petal-orbits",
                                  "player-controls",    "movement",       "ant-hole-release",
                                  "broadphase",         "contacts",       "reap-dead",
                                  "expire-drops",       "corpse-sweep",   "hit-flush"}));
}

void two_worlds_do_not_share_players() {
  auto first = make_world(123), second = make_world(123), reference = make_world(123);
  const auto a = join_player(*first, "A", at(-1000));
  const auto b = join_player(*second, "B", at(1000));
  const auto c = join_player(*reference, "B", at(1000));
  CHECK(a == b && b == c);
  CHECK(first->players().get(a) != second->players().get(b));
  CHECK(!spawn_player(*second, state(*first, a), "foreign", at(0), {}).valid());
  CHECK(apply_player_input(*first, a, 1, 0, f32(0), f32(200)));
  for (unsigned i = 0; i < 10; ++i) {
    advance_ticks(*first, 1);
    advance_ticks(*second, 1);
    advance_ticks(*reference, 1);
  }
  CHECK(body(*second, b).position.x == body(*reference, c).position.x);
  CHECK(body(*second, b).position.y == body(*reference, c).position.y);
  CHECK(second->random().state() == reference->random().state());
  CHECK(second->tick() == 10 && second->quadtree_updates() == 10);
  CHECK(second->players().get(b)->player_name() == "B");
  CHECK(leave_player(*first, a));
  CHECK(second->players().size() == 1 && body(*second, b).health.value > 0);
  first->reset();
  CHECK(second->players().get(b)->life_epoch == 1 && second->tick() == 10);
}
}
int main() {
  engine::test::tapOutput = true;
  std::printf("TAP version 13\n");
#define RUN(name) engine::test::runTest(#name, name)
  RUN(registry_is_stable_ordered_and_generational);
  RUN(two_players_spawn_in_one_world);
  RUN(controls_are_isolated);
  RUN(many_inputs_one_tick_one_impulse);
  RUN(profiles_are_isolated);
  RUN(zone_state_is_per_player);
  RUN(destroy_body_keeps_player_record);
  RUN(spawn_is_idempotent);
  RUN(stale_body_handle_is_rejected);
  RUN(same_input_sequence_is_independent);
  RUN(input_expiry_and_life_guards);
  RUN(corpse_respawn_preserves_identity_and_death);
  RUN(petal_destruction_and_leave_are_isolated);
  RUN(single_player_regression);
  RUN(two_worlds_do_not_share_players);
#undef RUN
  std::printf("1..%d\n", engine::test::testsRun);
  return engine::test::failures ? 1 : 0;
}
