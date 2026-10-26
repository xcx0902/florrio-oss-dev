#include "engine/sim/combat.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/tick.hpp"
#include <cstdlib>
#include <iostream>

namespace {
void require(bool condition, const char* message) {
  if (!condition) { std::cerr << message << '\n'; std::exit(1); }
}

void idle_petal_hits_passive_ant() {
  engine::World world;
  world.initialize();
  const auto player = engine::spawn_player(world, "sim", engine::Vec2(engine::f32(-1000.0F), engine::f32(0.0F)), {});
  world.profile().set_level(1);
  const auto ant = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 7U, {});
  const auto petal = engine::spawn_petal(world, 1U, engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)),
    engine::f32(0.0F), engine::f32(0.0F), 0U, 0U);
  require(player.valid() && ant.valid() && petal.valid(), "passive contact setup");
  world.entities().get(petal)->owner = player.raw;
  require(!world.entities().get(ant)->ai.aggressive, "worker Ant is passive");
  require(world.input().buttons == 0U && world.input().strength.value == 0.0F, "no attack or movement input");
  require(engine::resolve_contacts(world) == 1U, "one Ant/petal contact");
  require(world.entities().get(ant)->health.value == 0.0F, "idle petal kills worker Ant");
  require(world.entities().get(petal)->health.value == 0.0F, "worker Ant kills idle petal");
  require(world.loadout().score().value > 0.0F, "contact kill awards player score");
}

void loot_precedes_mass_separation() {
  engine::World world;
  world.initialize();
  const auto player = engine::spawn_player(world, "sim", engine::Vec2(engine::f32(-1000.0F), engine::f32(0.0F)), {});
  const auto bee = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 6U,
    engine::Vec2(engine::f32(100.0F), engine::f32(50.0F)));
  const auto petal = engine::spawn_petal(world, 1U, engine::Vec2(engine::f32(120.0F), engine::f32(50.0F)),
    engine::f32(0.0F), engine::f32(0.0F), 0U, 0U);
  require(player.valid() && bee.valid() && petal.valid(), "loot contact setup");
  auto* victim = world.entities().get(bee);
  victim->health = engine::f32(10.0F);
  victim->loot_count = 1U;
  victim->loot_petals[0] = 2U;
  world.entities().get(petal)->owner = player.raw;
  require(engine::resolve_contacts(world) == 1U, "one Bee/petal contact");
  require(victim->death_processed, "Bee dies in contact response");
  require(victim->position.x.value != 100.0F, "corpse still receives mass separation");
  require(world.pickups().size() == 1U, "one actual loot pickup");
  const auto drop_handle = world.pickups()[0];
  const auto* drop = world.entities().get(drop_handle);
  require(drop != nullptr && drop->position.x.value == 100.0F && drop->position.y.value == 50.0F,
    "loot keeps original pre-separation position");
  require(drop->health.value == 0.0F && drop->max_health.value == 0.0F, "pickup has no health component");
  engine::tick(world, 50.0);
  drop = world.entities().get(drop_handle);
  require(drop != nullptr && !drop->death_processed, "healthless pickup survives death sweep");
}

void mob_manager_contacts_do_not_damage() {
  engine::World world;
  world.initialize();
  const auto first = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 7U, {});
  const auto second = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 7U,
    engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)));
  require(first.valid() && second.valid(), "mob contact setup");
  require(engine::resolve_contacts(world) == 1U, "one mob contact");
  require(world.entities().get(first)->health.value == 10.0F
    && world.entities().get(second)->health.value == 10.0F, "shared mob manager suppresses damage");
}

void pickup_grace_follow_and_expiry() {
  engine::World world;
  world.initialize();
  const auto player = engine::spawn_player(world, "pickup", engine::Vec2(engine::f32(65.0F), engine::f32(0.0F)), {});
  const auto handle = engine::spawn_loot_drop(world, 2U, {});
  require(player.valid() && handle.valid(), "pickup follow setup");
  for (int tick = 0; tick < 9; ++tick) engine::tick(world, 50.0);
  require(!world.entities().get(handle)->pickup_collected, "pickup waits until spawn+500 ms");
  require(world.loadout().pickup_transfers().empty(), "no early transfer event");
  engine::tick(world, 50.0);
  auto* drop = world.entities().get(handle);
  require(drop != nullptr && drop->pickup_collected, "70-unit query collects at 65-unit separation");
  require(drop->position.x.value == 31.719999313354492F, "original f64 follow rounds once to f32");
  require(world.loadout().pickup_transfers().size() == 1U, "one real transfer event");
  require(world.profile().inventory(0) == 2U, "actual carried slot receives type");
  world.entities().get(player)->position.x = engine::f32(100.0F);
  engine::tick(world, 50.0);
  require(world.entities().get(handle)->position.x.value == 65.04064178466797F,
    "collected pickup continues following recipient");
  while (world.time_ms() < 2450.0) engine::tick(world, 50.0);
  require(world.entities().get(handle) != nullptr, "pickup persists before exact transfer expiry");
  engine::tick(world, 50.0);
  require(world.entities().get(handle) == nullptr, "pickup expires at collection+2000 ms");
}

void full_inventory_does_not_invent_backpack_pickup() {
  engine::World world;
  world.initialize();
  require(engine::spawn_player(world, "full", {}, {}).valid(), "full inventory setup");
  for (std::uint8_t slot = 0; slot < world.profile().inventory_size(); ++slot) {
    require(world.loadout().equip(slot, 1U), "fill carried slots");
    world.profile().set_inventory(slot, 1U);
  }
  const auto handle = engine::spawn_loot_drop(world, 2U, {});
  for (int tick = 0; tick < 11; ++tick) engine::tick(world, 50.0);
  require(!world.entities().get(handle)->pickup_collected, "original198 rejects a full inventory");
  require(world.profile().backpack_count() == 0U && world.loadout().pickup_transfers().empty(),
    "no synthetic backpack or sentinel event");
}

void dead_query_body_stops_contact_traversal() {
  engine::World world;
  world.initialize();
  const auto owner = engine::spawn_player(world, "owner", engine::Vec2(engine::f32(-1000.0F), engine::f32(0.0F)), {});
  const auto ant = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 7U, {});
  const auto first = engine::spawn_petal(world, 1U, engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)),
    engine::f32(0.0F), engine::f32(0.0F));
  const auto second = engine::spawn_petal(world, 1U, engine::Vec2(engine::f32(21.0F), engine::f32(0.0F)),
    engine::f32(0.0F), engine::f32(0.0F));
  require(owner.valid() && ant.valid() && first.valid() && second.valid(), "dead query setup");
  world.entities().get(first)->owner = owner.raw;
  world.entities().get(second)->owner = owner.raw;
  require(engine::resolve_contacts(world) == 1U, "dying source aborts remaining candidate traversal");
  const auto first_health = world.entities().get(first)->health.value;
  const auto second_health = world.entities().get(second)->health.value;
  require(first_health + second_health == 10.0F, "corpse does not kill a second live petal");
}

void player_and_owned_corpses_keep_original_window() {
  engine::World world;
  world.initialize();
  const auto player = engine::spawn_player(world, "corpse", {}, {});
  require(world.loadout().equip(0U, 1U), "corpse loadout setup");
  world.profile().set_inventory(0U, 1U);
  require(engine::spawn_loadout_petals(world) == 1U, "one owned petal");
  const auto petal = world.loadout().handle(0U, 0U);
  require(petal.valid(), "owned petal handle");
  (void)engine::damage_entity(world, player, engine::f32(1000.0F));
  require(world.player() == player && world.entities().get(player) != nullptr,
    "dead player retains controlled-body handle");
  require(world.entities().get(petal) != nullptr && world.entities().get(petal)->health.value == 0.0F,
    "owned petal is a corpse rather than immediate deletion");
  require(world.profile().inventory(0U) == 1U, "corpse keeps carried inventory");
  for (int tick = 0; tick < 19; ++tick) engine::tick(world, 50.0);
  require(world.entities().get(player) != nullptr && world.entities().get(petal) != nullptr,
    "both corpses persist before 1000ms");
  require(world.petals().empty(), "dead player does not respawn equipped petals");
  engine::tick(world, 50.0);
  require(!world.player().valid() && world.entities().get(player) == nullptr
    && world.entities().get(petal) == nullptr, "corpses and controlled handle release at 1000ms");
}

void player_health_refreshes_before_each_regeneration() {
  engine::World world;
  world.initialize();
  const auto player = engine::spawn_player(world, "health", {}, {});
  require(player.valid(), "health refresh setup");
  auto* entity = world.entities().get(player);
  // Unmodified original wasm, death scenario at 6100ms: the unchanged 100
  // maximum still rescales 90.02083587646484 to 90.02084350585938 first.
  entity->health = engine::f32(90.02083587646484F);
  engine::regenerate_players(world, 50.0);
  require(entity->health.bits() == engine::f32(90.04167938232422F).bits(),
    "original per-tick health refresh and regeneration are bit-exact");
  require(entity->max_health.bits() == engine::f32(100.0F).bits(),
    "refresh does not require a maximum-health change");
  const auto before_no_step = entity->health.bits();
  engine::regenerate_players(world, 0.0);
  require(entity->health.bits() == before_no_step, "zero delta does not regenerate");
  entity->health = entity->max_health;
  engine::regenerate_players(world, 50.0);
  require(entity->health == entity->max_health, "regeneration remains capped");
  entity->health = engine::f32(0.0F);
  engine::regenerate_players(world, 50.0);
  require(entity->health.value == 0.0F, "regeneration cannot revive a corpse");
}
}

int main() {
  idle_petal_hits_passive_ant();
  std::cout << "ok 1 - idle petal and passive Ant exchange damage\n";
  loot_precedes_mass_separation();
  std::cout << "ok 2 - healthless loot spawns before mass separation\n";
  mob_manager_contacts_do_not_damage();
  std::cout << "ok 3 - shared mob manager contacts remain harmless\n";
  pickup_grace_follow_and_expiry();
  std::cout << "ok 4 - pickup grace, follow and absolute expiry match original\n";
  full_inventory_does_not_invent_backpack_pickup();
  std::cout << "ok 5 - full inventory leaves pickup in world\n";
  dead_query_body_stops_contact_traversal();
  std::cout << "ok 6 - dead querying body stops remaining contacts\n";
  player_and_owned_corpses_keep_original_window();
  std::cout << "ok 7 - player and owned corpses retain original 1000ms window\n";
  player_health_refreshes_before_each_regeneration();
  std::cout << "ok 8 - original per-tick player health refresh is bit-exact\n1..8\n";
}
