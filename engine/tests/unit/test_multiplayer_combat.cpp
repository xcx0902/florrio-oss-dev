// Authoritative combat only; no Worker, transport or simulated client rewards.
#include "../support/gameplay.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/passives.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/pets.hpp"
#include "engine/sim/species_attacks.hpp"
#include "engine/sim/progression.hpp"
#include <cmath>

namespace {
using namespace engine;
using namespace engine::test;
using namespace engine::test::gameplay;

void body_contacts_use_both_actual_levels() {
  for (auto first : {1, 5, 6, 10}) for (auto second : {1, 5, 6, 10}) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(0), profile(0, first));
    const auto b = join_player(*world, "B", at(30), profile(0, second));
    body(*world, a).contact_damage = f32(10);
    body(*world, b).contact_damage = f32(20);
    contacts(*world);
    const float scale = std::clamp((std::max(first, second) - 5) * 0.2, 0.0, 1.0);
    CHECK(body(*world, a).health == f32(100 - 20 * scale));
    CHECK(body(*world, b).health == f32(100 - 10 * scale));
    if (scale > 0) {
      CHECK(body(*world, a).last_damage_source.player == b);
      CHECK(body(*world, b).last_damage_source.player == a);
    }
  }
}

void opposing_petals_damage_bodies_at_level_one() {
  for (bool reverse : {false, true}) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-1000), profile(1));
    const auto b = join_player(*world, "B", at(1000), profile(1));
    const auto attacker = reverse ? b : a, target = reverse ? a : b;
    const auto handle = petal(*world, attacker);
    world->entities().get(handle)->set_position(body(*world, target).position + at(10));
    body(*world, target).contact_damage = f32(0);
    contacts(*world);
    CHECK(body(*world, target).health == f32(90));
    CHECK(body(*world, attacker).health == f32(100));
    CHECK(body(*world, target).last_damage_source.player == attacker);
    CHECK(world->hit_events().size() == 1);
    CHECK(world->hit_events()[0].source.player == attacker);
  }
}

void petal_pairs_keep_existing_noncontact_rule() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000), profile(1));
  const auto b = join_player(*world, "B", at(1000), profile(1));
  world->entities().get(petal(*world, a))->set_position(at(0));
  world->entities().get(petal(*world, b))->set_position(at(1));
  contacts(*world);
  CHECK(world->entities().get(petal(*world, a))->health == f32(10));
  CHECK(world->entities().get(petal(*world, b))->health == f32(10));
}

void self_petal_pet_projectile_and_wild_roots() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(0), profile(21));
  const auto p = petal(*world, a);
  contacts(*world);
  CHECK(body(*world, a).health == f32(100));
  CHECK(body(*world, a).effect_count == 0);
  on_petal_incoming_hit(*world, p, state(*world, a).player());
  CHECK(body(*world, a).effect_count == 0);
  const auto pet = spawn_entity_from_defaults(*world, EntityKind::kMob, 9, at(10));
  inherit_entity_owner(*world, pet, state(*world, a).player());
  const auto shot = spawn_hornet_stinger(*world, pet, state(*world, a).player());
  CHECK(shot.valid());
  CHECK(owning_player_id(*world, shot) == a);
  contacts(*world);
  CHECK(body(*world, a).health == f32(100));
  CHECK(body(*world, a).effect_count == 0);
  CHECK(world->destroy(pet));
  CHECK(controlling_root(*world, shot) == state(*world, a).player());
  world->entities().get(shot)->set_position(at(10));
  contacts(*world);
  CHECK(body(*world, a).health == f32(100) && body(*world, a).effect_count == 0);
  const auto wild1 = spawn_entity_from_defaults(*world, EntityKind::kMob, 9, at(2000));
  const auto wild2 = spawn_entity_from_defaults(*world, EntityKind::kMob, 12, at(2001));
  const auto hp1 = world->entities().get(wild1)->health;
  const auto hp2 = world->entities().get(wild2)->health;
  CHECK(same_controlling_root(*world, wild1, wild2));
  contacts(*world);
  CHECK(world->entities().get(wild1)->health == hp1 && world->entities().get(wild2)->health == hp2);
  const auto wild_shot = spawn_hornet_stinger(*world, wild1, state(*world, a).player());
  CHECK(world->destroy(wild1));
  CHECK(same_controlling_root(*world, wild_shot, wild2));
  world->entities().get(wild_shot)->set_position(at(2001));
  contacts(*world);
  CHECK(world->entities().get(wild2)->health == hp2);
}

void catalog_equipment_ownership_and_recharge() {
  unsigned covered = 0;
  for (const auto& definition : Catalog::instance().petals()) {
    if (definition.typeId == 0) continue;
    ++covered;
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-1000), profile(definition.typeId));
    const auto b = join_player(*world, "B", at(1000), profile(definition.typeId));
    CHECK(apply_player_input(*world, a, 1, 2, f32(0), f32(0)));
    update_petal_orbits(*world, state(*world, a), 50);
    update_petal_orbits(*world, state(*world, b), 50);
    const auto b_handles = state(*world, b).loadout().slots()[0].instances;
    const auto b_phase = state(*world, b).loadout().orbit_phase();
    for (auto id : {a, b}) for (const auto& orbit : state(*world, id).petals()) {
      CHECK(owning_player_id(*world, orbit.handle) == id);
      CHECK(controlling_root(*world, orbit.handle) == state(*world, id).player());
    }
    if (!definition.orbitHidden) {
      const auto handle = petal(*world, a);
      CHECK(handle.valid());
      CHECK(damage_entity(*world, handle, f32(10000), state(*world, b).player()).died);
      CHECK(!state(*world, a).loadout().handle(0, 0).valid());
      const auto recharge = Catalog::instance().petal_combat(definition.typeId)->rechargeMilliseconds;
      CHECK(state(*world, a).loadout().slots()[0].recharge_remaining_ms == recharge);
      (void)refresh_loadout_petals(*world, state(*world, a), recharge);
      CHECK(petal(*world, a).valid() && petal(*world, a) != handle);
    } else {
      CHECK(state(*world, a).petals().empty());
      CHECK((body(*world, a).player_expression & 4) == 0);
      (void)refresh_loadout_petals(*world, state(*world, a), 0);
      CHECK((body(*world, a).player_expression & 4) != 0);
    }
    CHECK(state(*world, b).loadout().slots()[0].instances == b_handles);
    CHECK(state(*world, b).loadout().orbit_phase() == b_phase);
    CHECK(state(*world, b).loadout().slots()[0].recharge_remaining_ms == 0);
    CHECK(!discard_player_slot(*world, a, 1, 0, 65535));
    CHECK(!swap_player_slots(*world, a, 1, 0, 65535, 1, 0));
    CHECK(discard_player_slot(*world, a, 1, 0, definition.typeId));
    CHECK(state(*world, b).profile().inventory(0) == definition.typeId);
  }
  CHECK(covered == 38);
}

void roses_heal_only_their_owner() {
  for (auto type : {6, 15, 24}) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-1000), profile(type));
    const auto b = join_player(*world, "B", at(1000), profile(type));
    body(*world, a).health = f32(50); body(*world, b).health = f32(50);
    const auto b_handles = state(*world, b).loadout().slots()[0].instances;
    for (unsigned tick = 1; tick <= 29; ++tick) {
      world->set_time_ms(tick * 50);
      update_petal_orbits(*world, state(*world, a), 50);
    }
    CHECK(body(*world, a).health == f32(type == 6 ? 60 : type == 15 ? 72 : 60.5));
    CHECK(body(*world, b).health == f32(50));
    CHECK(state(*world, b).loadout().slots()[0].instances == b_handles);
    CHECK(state(*world, a).petals().empty());
  }
}

void passives_orbit_modifiers_and_bubble_are_isolated() {
  for (auto type : {13, 14, 18, 21, 28, 32, 33}) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-1000), profile(type));
    const auto b = join_player(*world, "B", at(1000), profile(1));
    body(*world, a).health = f32(50); body(*world, b).health = f32(50);
    regenerate_players(*world, 50);
    CHECK(body(*world, a).max_health == f32(type == 33 ? 140 : type == 13 || type == 21 ? 120 : 100));
    CHECK(body(*world, b).max_health == f32(100));
    if (type == 32) CHECK(body(*world, a).health.value > body(*world, b).health.value);
    advance_loadout_orbit_phase(*world, state(*world, a), 50);
    advance_loadout_orbit_phase(*world, state(*world, b), 50);
    CHECK(state(*world, b).loadout().orbit_phase() == f32(0.125));
    if (type == 14) CHECK(state(*world, a).loadout().orbit_phase() == f32(0.165));
    if (type == 28) CHECK(state(*world, a).loadout().orbit_phase() == f32(-0.125));
    if (type == 18) {
      CHECK(apply_player_input(*world, a, 1, 2, f32(0), f32(0)));
      world->set_time_ms(550);
      update_petal_orbits(*world, state(*world, a), 0);
      CHECK(body(*world, a).velocity.x != 0 && body(*world, b).velocity.x == 0);
      CHECK(state(*world, a).petals().empty());
    }
  }
}

void launched_variants_keep_identity_and_independent_charge() {
  for (auto type : {10, 11, 12, 19, 20, 29, 30, 34}) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-1000), profile(type));
    const auto b = join_player(*world, "B", at(1000), profile(type));
    const auto parent = petal(*world, a), other = petal(*world, b);
    CHECK(apply_player_input(*world, a, 1, 1, f32(0), f32(0)));
    world->set_time_ms(550);
    update_petal_orbits(*world, state(*world, a), 0);
    CHECK(!petal(*world, a).valid() && petal(*world, b) == other);
    CHECK(state(*world, b).loadout().slots()[0].recharge_remaining_ms == 0);
    if (type == 11 || type == 12 || type == 34) {
      CHECK(world->entities().get(parent) == nullptr);
      CHECK(world->deferred_launches().size() == 1);
      const auto children = world->deferred_launches()[0].children;
      CHECK(children.size() == 4);
      CHECK(world->run_deferred_launches(551) == 1 && world->run_deferred_launches(551) == 0);
      for (auto child : children) {
        CHECK(owning_player_id(*world, child) == a);
        CHECK(world->entities().get(child)->velocity.x != 0 || world->entities().get(child)->velocity.y != 0);
      }
    } else CHECK(owning_player_id(*world, parent) == a);
  }
}

void wing_and_zone_locked_pets_use_their_players_input_and_zone() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000), profile(9));
  const auto b = join_player(*world, "B", at(1000), profile(9));
  CHECK(apply_player_input(*world, a, 1, 1, f32(0), f32(0)));
  CHECK(apply_player_input(*world, b, 1, 2, f32(0), f32(0)));
  update_petal_orbits(*world, state(*world, a), 50);
  update_petal_orbits(*world, state(*world, b), 50);
  CHECK(state(*world, a).petals()[0].orbit_radius.value > 140);
  CHECK(state(*world, b).petals()[0].orbit_radius.value < 45);
  const auto c = join_player(*world, "C", at(22000), profile(22, 60));
  const auto d = join_player(*world, "D", at(18000), profile(22, 60));
  for (auto id : {c, d}) CHECK(hatch_equipped_egg(*world, petal(*world, id), 9));
  const auto c_pet = petal(*world, c), d_pet = petal(*world, d);
  state(*world, c).set_zone_petals_disabled(true);
  damage_zone_locked_petals(*world, state(*world, c), 50);
  CHECK(world->entities().get(c_pet)->health == f32(0));
  CHECK(world->entities().get(d_pet)->health.value > 0 && petal(*world, d) == d_pet);
}

void collision_effects_reflection_and_web_source() {
  for (auto type : {8, 12, 20, 21, 31, 34}) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-1000), profile(type));
    const auto b = join_player(*world, "B", at(1000), profile());
    const auto handle = petal(*world, a);
    // A caller's arbitrary attacker handle cannot redirect a petal's source.
    on_petal_hit(*world, handle, state(*world, b).player(), state(*world, b).player());
    CHECK(body(*world, b).effect_count == 1 && body(*world, a).effect_count == 0);
    CHECK(body(*world, b).effects[0].attribution.player == a);
    if (type == 21) {
      on_petal_incoming_hit(*world, handle, state(*world, b).player());
      CHECK(body(*world, b).effects[0].attribution.player == a);
    }
    CHECK(world->destroy(handle));
    body(*world, b).health = f32(0.01);
    if (type != 20 && type != 31) {
      CHECK(update_effects(*world, 50) == 1);
      CHECK(state(*world, b).last_killer_name() == "A");
      CHECK(state(*world, b).death.source.player == a);
    }
  }
  for (auto type : {29, 30}) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-1000), profile(type));
    const auto b = join_player(*world, "B", at(1000), profile());
    CHECK(apply_player_input(*world, a, 1, 1, f32(0), f32(0)));
    world->set_time_ms(550); update_petal_orbits(*world, state(*world, a), 0);
    update_petal_behaviors(*world, 650);
    CHECK(!world->area_effects().empty());
    const auto tag = world->area_effects()[0].owner;
    CHECK(owning_player_id(*world, tag) == a);
    CHECK(world->area_effects()[0].payload->attribution.player == a);
    body(*world, b).set_position(world->entities().get(tag)->position);
    (void)world->update_area_effects();
    CHECK(slow_multiplier(body(*world, b)) == f32(type == 29 ? 0.25 : 0.015625));
    std::vector<EntityHandle> tags;
    for (const auto& area : world->area_effects()) tags.push_back(area.owner);
    for (auto owner : tags) CHECK(world->destroy(owner));
    CHECK(slow_multiplier(body(*world, b)) == f32(1));
  }
}

void eggs_pets_and_nested_projectiles_keep_killer_name() {
  for (auto type : {22, 23}) {
    auto world = make_world();
    const auto a = join_player(*world, "A", at(-1000), profile(type));
    const auto b = join_player(*world, "B", at(1000), profile());
    const auto egg = petal(*world, a);
    CHECK(hatch_equipped_egg(*world, egg, type == 22 ? 9 : 12));
    const auto pet = petal(*world, a);
    CHECK(world->entities().get(pet)->kind == EntityKind::kMob);
    CHECK(owning_player_id(*world, pet) == a);
    CHECK(!target_eligible(*world, *world->entities().get(pet), body(*world, a)));
    body(*world, b).set_position(at(-800));
    CHECK(target_eligible(*world, *world->entities().get(pet), body(*world, b)));
    const auto shot = spawn_hornet_stinger(*world, pet, state(*world, b).player());
    CHECK(owning_player_id(*world, shot) == a);
    CHECK(world->destroy(pet));
    CHECK(damage_entity(*world, state(*world, b).player(), f32(1000), shot).died);
    CHECK(state(*world, b).last_killer_name() == "A");
    CHECK(state(*world, b).death.source.player == a);
    CHECK(state(*world, a).profile().experience() == f32(0));
    CHECK(state(*world, a).loadout().score() == f32(0));
  }
}

void dot_survives_body_removal_and_actual_slot_reuse() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000), profile(8));
  const auto b = join_player(*world, "B", at(1000), profile(22));
  CHECK(hatch_equipped_egg(*world, petal(*world, b), 9));
  const auto b_pet = petal(*world, b);
  const auto old_body = state(*world, a).player(), old_petal = petal(*world, a);
  on_petal_hit(*world, old_petal, state(*world, b).player(), old_body);
  const auto mob = spawn_entity_from_defaults(*world, EntityKind::kMob, 1, at(5000));
  CHECK(apply_effect(*world, mob, EffectType::kPoison, f32(100000), 1000, old_petal));
  CHECK(world->destroy(old_petal)); CHECK(world->destroy(old_body));
  CHECK(leave_player(*world, a));
  // The FIFO allocator must actually reuse both source slots with new generations.
  bool reused_body = false, reused_petal = false;
  const auto c = register_player(*world, "C");
  CHECK(c != a);
  CHECK(spawn_player(*world, state(*world, c), "C", at(4000), {}).valid());
  for (unsigned i = 0; i < kEntitySlotCount; ++i) {
    const auto allocated = world->entities().allocate();
    if (!allocated) break;
    if (allocated->index() == old_body.index()) { reused_body = true; CHECK(*allocated != old_body); }
    if (allocated->index() == old_petal.index()) { reused_petal = true; CHECK(*allocated != old_petal); }
  }
  CHECK(reused_body && reused_petal);
  body(*world, b).health = f32(0.01);
  CHECK(update_effects(*world, 50) == 2);
  CHECK(state(*world, b).last_killer_name() == "A");
  CHECK(state(*world, b).death.source.player == a && state(*world, b).death.source.body == old_body);
  CHECK(world->entities().get(b_pet)->death_processed);
  CHECK(world->entities().get(b_pet)->killer_name == "A");
  CHECK(world->entities().get(b_pet)->last_damage_source.player == a);
  CHECK(state(*world, c).profile().experience() == f32(0));
  CHECK(state(*world, c).loadout().score() == f32(0));
}

void effect_refresh_keys_and_payload_lifetime_survive_death_callbacks() {
  auto world = make_world();
  auto items = profile(31); items.set_inventory(1, 31); items.set_inventory_count(2);
  const auto a = join_player(*world, "A", at(-1000), items);
  const auto b = join_player(*world, "B", at(1000), profile());
  const auto first = petal(*world, a), second = state(*world, a).loadout().handle(1, 0);
  on_petal_hit(*world, first, state(*world, b).player(), state(*world, a).player());
  on_petal_hit(*world, second, state(*world, b).player(), state(*world, a).player());
  CHECK(body(*world, b).effect_count == 1 && slow_multiplier(body(*world, b)) == f32(0.5));
  CHECK(body(*world, b).effects[0].attribution.entity == second);
  CHECK(apply_effect(*world, first, EffectType::kSlow, f32(0.5), 1000, state(*world, b).player()));
  std::weak_ptr<EffectPayload> payload = world->entities().get(first)->effects[0].payload;
  // Stage an external health write before reap_dead. The owner's poison death
  // destroys this already-dead equipped child during the effects traversal.
  world->entities().get(first)->health = f32(0);
  CHECK(apply_effect(*world, state(*world, a).player(), EffectType::kPoison, f32(10000), 1000,
    state(*world, b).player()));
  CHECK(update_effects(*world, 50) == 1);
  CHECK(world->entities().get(first) == nullptr && payload.expired());
}

void delayed_monster_xp_goes_to_persistent_attacker_only() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000), profile(8));
  const auto b = join_player(*world, "B", at(1000), profile());
  const auto mob = spawn_entity_from_defaults(*world, EntityKind::kMob, 1, at(4000));
  const auto b_max = body(*world, b).max_health;
  CHECK(apply_effect(*world, mob, EffectType::kPoison, f32(100000), 1000, petal(*world, a)));
  CHECK(world->destroy(state(*world, a).player()));
  CHECK(update_effects(*world, 50) == 1);
  const auto reward = f32(Catalog::instance().entity(1)->scale);
  CHECK(state(*world, a).loadout().score() == reward);
  CHECK(state(*world, b).loadout().score() == f32(0));
  CHECK(state(*world, b).profile().level() == 1 && body(*world, b).max_health == b_max);
  kill_entity(*world, mob, state(*world, b).player());
  CHECK(state(*world, a).loadout().score() == reward && state(*world, b).loadout().score() == f32(0));
}

void monster_kill_levels_only_the_actual_attacker() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(-1000), profile(1));
  const auto b = join_player(*world, "B", at(1000), profile(1));
  const auto reward = f32(Catalog::instance().entity(1)->scale);
  state(*world, a).profile().set_experience(experience_threshold(1) - reward);
  body(*world, a).health = f32(50); body(*world, b).health = f32(50);
  const auto mob = spawn_entity_from_defaults(*world, EntityKind::kMob, 1, at(4000));
  CHECK(damage_entity(*world, mob, f32(10000), petal(*world, a)).died);
  CHECK(state(*world, a).profile().level() == 2 && state(*world, b).profile().level() == 1);
  CHECK(body(*world, a).max_health.value > 100 && body(*world, a).health.value > 50);
  CHECK(body(*world, b).max_health == f32(100) && body(*world, b).health == f32(50));
  CHECK(state(*world, b).profile().inventory(0) == 1);
  CHECK(state(*world, b).loadout().score() == f32(0));
}

void ai_finds_second_player_after_first_dies() {
  auto world = make_world();
  const auto a = join_player(*world, "A", at(100), profile());
  const auto b = join_player(*world, "B", at(200), profile());
  const auto mob = spawn_entity_from_defaults(*world, EntityKind::kMob, 9, at(0));
  auto& ai = world->entities().get(mob)->ai;
  ai.aggressive = true; ai.territory = f32(0); ai.radius = f32(1000);
  CHECK(find_target(*world, mob) == state(*world, a).player());
  CHECK(damage_entity(*world, state(*world, a).player(), f32(1000), mob).died);
  update_ai(*world, 50);
  CHECK(ai.target == state(*world, b).player());
}

void invalid_cyclic_and_stale_owner_chains_are_bounded() {
  auto world = make_world();
  const auto a = spawn_entity(*world, EntityKind::kProjectile, 1, at(0), f32(1));
  const auto b = spawn_entity(*world, EntityKind::kProjectile, 1, at(0), f32(1));
  world->entities().get(a)->owner = b.raw; world->entities().get(b)->owner = a.raw;
  CHECK(!owning_player_id(*world, a).valid());
  CHECK(damage_source(*world, a).name.empty());
  CHECK(controlling_root(*world, a) == a);
  CHECK(world->destroy(b));
  CHECK(!owning_player_id(*world, a).valid());
  CHECK(damage_source(*world, EntityHandle::from_parts(a.index(), a.generation() + 1)).name.empty());
}
}

int main() {
  engine::test::tapOutput = true; std::printf("TAP version 13\n");
#define RUN(name) engine::test::runTest(#name, name)
  RUN(body_contacts_use_both_actual_levels);
  RUN(opposing_petals_damage_bodies_at_level_one);
  RUN(petal_pairs_keep_existing_noncontact_rule);
  RUN(self_petal_pet_projectile_and_wild_roots);
  RUN(catalog_equipment_ownership_and_recharge);
  RUN(roses_heal_only_their_owner);
  RUN(passives_orbit_modifiers_and_bubble_are_isolated);
  RUN(launched_variants_keep_identity_and_independent_charge);
  RUN(wing_and_zone_locked_pets_use_their_players_input_and_zone);
  RUN(collision_effects_reflection_and_web_source);
  RUN(eggs_pets_and_nested_projectiles_keep_killer_name);
  RUN(dot_survives_body_removal_and_actual_slot_reuse);
  RUN(effect_refresh_keys_and_payload_lifetime_survive_death_callbacks);
  RUN(delayed_monster_xp_goes_to_persistent_attacker_only);
  RUN(monster_kill_levels_only_the_actual_attacker);
  RUN(ai_finds_second_player_after_first_dies);
  RUN(invalid_cyclic_and_stale_owner_chains_are_bounded);
#undef RUN
  std::printf("1..%d\n", engine::test::testsRun);
  return engine::test::failures ? 1 : 0;
}
