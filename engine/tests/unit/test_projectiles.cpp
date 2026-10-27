#include <iterator>
#include "engine/model/catalog.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/tick.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/ai.hpp"
#include "engine/core/byte_reader.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/net/original_snapshot.hpp"
#include <algorithm>
#include <array>
#include <map>
#include <string>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {
void require(bool condition, const char* message) {
  if (condition) return;
  std::fprintf(stderr, "Projectile regression: %s\n", message);
  std::exit(1);
}
} // namespace
// Use the existing independent archived decoder; it never calls writer/decrypt.
#define CHECK(condition) require(static_cast<bool>(condition), #condition)
#include "test_original_client_adapter.hpp"
#undef CHECK
namespace {
engine::EntityHandle setup(engine::World& world, std::uint16_t type) {
  world.initialize();
  world.set_auto_populate(false);
  const auto owner = engine::spawn_player_default(world, "projectile", engine::make_default_profile(), false);
  require(owner.valid(), "owner spawns");
  world.entities().get(owner)->set_position({engine::f32(0), engine::f32(0)});
  world.profile().set_inventory(0, type);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  require(world.loadout().equip(0, type), "projectile equips");
  require(engine::spawn_loadout_petals(world) == world.loadout().slots()[0].count, "projectile spawns");
  return owner;
}
void release_and_recharge() {
  for (const auto type : {10U, 11U, 12U, 19U, 20U, 29U, 30U, 34U}) {
    engine::World world;
    setup(world, type);
    const auto old = world.loadout().handle(0, 0);
    world.apply_input(1, engine::f32(0), engine::f32(0));
    world.set_time_ms(500);
    engine::update_petal_orbits(world, 0);
    require(world.loadout().handle(0, 0) == old, "exact 500ms remains equipped");
    world.set_time_ms(500.001);
    engine::update_petal_orbits(world, 0);
    require(!world.loadout().handle(0, 0).valid(), "strictly over 500ms releases");
    const auto* combat = engine::Catalog::instance().petal_combat(type);
    require(world.loadout().slots()[0].recharge_remaining_ms == combat->rechargeMilliseconds,
      "release arms exact catalog recharge");
    require(engine::refresh_loadout_petals(world, combat->rechargeMilliseconds - 1) == 0,
      "no replacement one ms before recharge");
    require(engine::refresh_loadout_petals(world, 1) == world.loadout().slots()[0].count,
      "replacement arrives on exact recharge boundary");
  }
}
void peas_lifecycle() {
  for (const auto type : {11U, 12U, 34U}) {
    engine::World world;
    const auto owner = setup(world, type);
    const auto parent = world.loadout().handle(0, 0);
    const auto target = engine::spawn_entity(world, engine::EntityKind::kMob, 1, {engine::f32(300), engine::f32(400)}, engine::f32(1));
    engine::on_petal_hit(world, parent, target, owner);
    require(world.entities().get(parent) != nullptr && world.deferred_launches().empty(),
      "contact does not split equipped Peas");
    world.apply_input(1, engine::f32(0), engine::f32(0));
    world.set_time_ms(550);
    engine::update_petal_orbits(world, 0);
    require(world.entities().get(parent) == nullptr, "split removes parent");
    require(world.deferred_launches().size() == 1, "one deferred launch");
    const auto children = world.deferred_launches()[0].children;
    require(children.size() == 4, "exactly four children");
    require(world.run_deferred_launches(550) == 0, "no launch in split frame");
    require(world.run_deferred_launches(551) == 1, "launch one millisecond later");
    for (const auto child : children) {
      const auto* entity = world.entities().get(child);
      require(entity->owner == owner.raw && entity->health.value == 5 && entity->max_health.value == 5,
        "split children keep owner and five health");
      require(entity->petal_render_flags == (type == 34 ? 3 : type == 12 ? 1 : 0), "variant render flags");
      require(entity->lifetime_remaining_ms == 1000, "exact 1000ms child lifetime");
    }
    engine::update_petal_behaviors(world, 1000);
    for (const auto child : children) {
      const auto* corpse = world.entities().get(child);
      require(corpse != nullptr && corpse->health.value == 0 && corpse->death_processed,
        "child expiry uses normal death and retains corpse");
      require(corpse->death_time_ms == 1550, "child corpse persists exactly one second");
    }
  }
}
void web_death_and_area() {
  for (const auto type : {29U, 30U}) {
    engine::World world;
    const auto owner = setup(world, type);
    const auto web = world.loadout().handle(0, 0);
    // Isolate one callback for WebR4's three-instance slot.
    while (world.petals().size() > 1) {
      const auto extra = world.petals().back().handle;
      world.petals().pop_back();
      (void)world.destroy(extra);
    }

    world.entities().get(web)->set_position({engine::f32(30), engine::f32(40)});
    const auto target = engine::spawn_entity(world, engine::EntityKind::kMob, 1, {engine::f32(500), engine::f32(400)}, engine::f32(1));
    engine::on_petal_hit(world, web, target, owner);
    require(world.area_effects().empty(), "orbiting Web contact creates no ground area");
    world.apply_input(1, engine::f32(0), engine::f32(0));
    world.set_time_ms(550);
    engine::update_petal_orbits(world, 0);
    engine::on_petal_hit(world, web, target, owner);
    require(world.area_effects().empty(), "nonlethal launched contact creates no area");
    engine::update_petal_behaviors(world, 650);
    require(world.area_effects().size() == 1, "Web expiry creates ground Web");
    const auto& area = world.area_effects()[0];
    const auto* ground = world.entities().get(area.owner);
    require(ground != nullptr && ground->position.x.value == 30 && ground->position.y.value == 40,
      "ground area uses dying projectile position");
    require(ground->lifetime_remaining_ms == 12000 && ground->collision_radius.value == 50,
      "ground Web lifetime and area radius match original");
    require(ground->physics_flag50 && ground->has_tag_component && ground->has_effect_area,
      "ground Web carries one-shot marker and area components");
    require(area.payload->intensity.value == 0.25F && std::isinf(area.payload->remaining_ms),
      "ground Web payload is permanent quarter-speed slow");
    engine::on_petal_death(world, web);
    require(world.area_effects().size() == 1, "death callback is consumed once");
    world.entities().get(target)->set_position({engine::f32(30), engine::f32(40)});
    (void)world.update_area_effects();
    require(engine::slow_multiplier(*world.entities().get(target)).value == 0.25F, "enter area applies slow");
    world.entities().get(target)->set_position({engine::f32(500), engine::f32(400)});
    (void)world.update_area_effects();
    require(engine::slow_multiplier(*world.entities().get(target)).value == 1, "leave area removes shared payload");
  }
}
void production_wire_models() {
  for (const auto type : {11U, 12U, 34U}) {
    engine::WorkerApi api;
    api.init(false);
    auto& world = api.world();
    const auto owner = setup(world, type);
    const auto parent = world.loadout().handle(0, 0);
    const auto equipped = archived_adapter_tests::decode(api.original_client_snapshot_bytes(1));
    require(equipped.records.at(parent.to_wire()).mask == 0x03184040U, "equipped Peas model mask");
    world.set_time_ms(550);
    require(engine::update_projectile_petal_orbit(world, world.petals()[0], 1), "wire Peas split");
    const auto children = world.deferred_launches()[0].children;
    const auto split = archived_adapter_tests::decode(api.original_client_snapshot_bytes(2));
    for (const auto child : children) {
      const auto& record = split.records.at(child.to_wire());
      require(record.mask == 0x03184050U, "child declares both component5 and component7");
      require(record.values.at(9) == (type == 34 ? 3 : type == 12 ? 1 : 0), "render byte is field9 including zero");
      require(record.values.at(50) == type, "split child retains petal type50");
      require(record.values.at(38) == 0, "lifecycle byte is independent of render flags");
      require(record.values.at(57) == owner.to_wire(), "split child owner is published");
    }
    engine::update_petal_behaviors(world, 1000);
    const auto dead = archived_adapter_tests::decode(api.original_client_snapshot_bytes(3));
    for (const auto child : children) {
      const auto& record = dead.records.at(child.to_wire());
      require(record.values.at(38) == 1 && record.values.at(53) == 0, "child expiry publishes ordinary death");
      require(!record.values.contains(9), "death does not overwrite the render byte");
    }
  }
  for (const auto type : {29U, 30U}) {
    engine::WorkerApi api;
    api.init(false);
    auto& world = api.world();
    const auto owner = setup(world, type);
    const auto web = world.loadout().handle(0, 0);
    world.entities().get(web)->set_position({engine::f32(30), engine::f32(40)});
    world.set_time_ms(550);
    require(engine::update_projectile_petal_orbit(world, world.petals()[0], 1), "wire Web releases");
    (void)engine::damage_entity(world, web, world.entities().get(web)->health);
    require(world.area_effects().size() == 1, "wire Web death emits one area");
    const auto ground = world.area_effects()[0].owner;
    const auto packet = archived_adapter_tests::decode(api.original_client_snapshot_bytes(1));
    const auto& record = packet.records.at(ground.to_wire());
    require(record.mask == 0x03184800U, "ground Web exact component12 mask");
    require(!record.values.contains(50) && !record.values.contains(9) && !record.values.contains(14),
      "ground Web has neither petal type, Peas flags nor effect-component field");
    require(record.values.at(7) == 50 && record.values.at(53) == 5 && record.values.at(55) == 5,
      "ground Web radius and health fields");
    require(record.values.at(49) == 30 && record.values.at(28) == 40 && record.values.at(57) == owner.to_wire(),
      "ground Web position and owner fields");
  }
}
void controlling_root_full_tick_contacts() {
  enum class Pair { kPetWild, kSiblings, kOwner, kWildPair };
  for (const auto pair : {Pair::kPetWild, Pair::kSiblings, Pair::kOwner, Pair::kWildPair}) {
    engine::World world;
    const auto owner = setup(world, 22);
    world.set_time_ms(1001);
    engine::update_petal_orbits(world, 1);
    const auto pet = world.loadout().handle(0, 0);
    require(pet.valid() && world.entities().get(pet)->kind == engine::EntityKind::kMob, "full tick uses actual Egg pet");
    world.entities().get(owner)->set_position({engine::f32(-500), engine::f32(0)});
    world.entities().get(pet)->set_position({engine::f32(300), engine::f32(0)});
    auto first = pet;
    if (pair == Pair::kWildPair) {
      world.entities().get(pet)->set_position({engine::f32(-500), engine::f32(0)});
      first = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 9, {engine::f32(300), engine::f32(0)});
    }
    const auto second = pair == Pair::kOwner ? owner
      : engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 9, {engine::f32(310), engine::f32(0)});
    if (pair == Pair::kOwner) world.entities().get(owner)->set_position({engine::f32(310), engine::f32(0)});
    if (pair == Pair::kSiblings) world.entities().get(second)->owner = owner.raw;
    auto* a = world.entities().get(first);
    auto* b = world.entities().get(second);
    // Keep the contact fixture in place while exercising all production phases.
    for (const auto handle : {pet, first, second}) {
      auto* body = world.entities().get(handle);
      body->ai.enabled = false;
      body->velocity = {};
      body->acceleration = {};
      body->health = body->max_health = engine::f32(100);
    }
    a->contact_damage = engine::f32(7);
    b->contact_damage = engine::f32(11);
    const bool hostile = pair == Pair::kPetWild;
    require(engine::same_controlling_root(world, first, second) != hostile, "fixture controlling roots");
    world.clear_hit_events();
    world.mark_known(first);
    world.mark_known(second);
    engine::tick(world, 50);
    require(a->health.value == (hostile ? 89 : 100), "full tick hostile pet receives wild contact damage");
    require(b->health.value == (hostile ? 93 : 100), "full tick pet damages wild; owner/sibling/wild pairs protected");
    if (hostile) require(world.hit_events().size() == 2, "full tick emits both real damage events");
  }
}
void callback_trace() {
  std::printf("[");
  bool first = true;
  for (const auto type : {10U, 19U, 20U, 29U, 30U})
    for (unsigned buttons = 0; buttons < 4; ++buttons)
      for (const double now : {500.0, 500.001, 550.0})
        for (const auto offset : {engine::Vec2{engine::f32(0), engine::f32(0)},
             engine::Vec2{engine::f32(3), engine::f32(4)},
             engine::Vec2{engine::f32(-3), engine::f32(-4)},
             engine::Vec2{engine::f32(1), engine::f32(7)}}) {
          engine::World world;
          setup(world, type);
          const auto handle = world.loadout().handle(0, 0);
          auto* petal = world.entities().get(handle);
          petal->set_position(offset);
          petal->velocity = {0.25, -0.125};
          petal->acceleration = {0.125, -0.25};
          world.random().seed(123456789);
          world.set_time_ms(now);
          const bool released = engine::update_projectile_petal_orbit(world, world.petals()[0], buttons);
          std::printf("%s{\"type\":%u,\"buttons\":%u,\"now\":%.17g,\"x\":%.17g,\"y\":%.17g,"
            "\"released\":%s,\"vx\":%.17g,\"vy\":%.17g,\"ax\":%.17g,\"ay\":%.17g,\"angle\":%.17g,\"life\":%.17g}",
            first ? "" : ",", type, buttons, now, static_cast<double>(offset.x.value),
            static_cast<double>(offset.y.value), released ? "true" : "false", petal->velocity.x,
            petal->velocity.y, petal->acceleration.x, petal->acceleration.y,
            static_cast<double>(petal->angle.value), petal->lifetime_remaining_ms);
          first = false;
        }
  std::printf("]\n");
}
void split_trace() {
  std::printf("[");
  bool first = true;
  for (const auto type : {11U, 12U, 34U}) for (const auto seed : {1U, 123456789U, 2147483646U}) {
    engine::World world;
    setup(world, type);
    const auto parent = world.loadout().handle(0, 0);
    world.entities().get(parent)->set_position({engine::f32(300), engine::f32(400)});
    world.random().seed(seed);
    world.set_time_ms(550);
    require(engine::update_projectile_petal_orbit(world, world.petals()[0], 1), "split trace releases");
    const auto children = world.deferred_launches()[0].children;
    require(world.run_deferred_launches(551) == 1, "split trace deferred launch");
    for (std::size_t index = 0; index < children.size(); ++index) {
      const auto* child = world.entities().get(children[index]);
      std::printf("%s{\"type\":%u,\"seed\":%u,\"index\":%zu,\"x\":%.17g,\"y\":%.17g,"
        "\"flags\":%u,\"health\":%.17g,\"life\":%.17g,\"vx\":%.17g,\"vy\":%.17g,\"ax\":%.17g,\"ay\":%.17g}",
        first ? "" : ",", type, seed, index, static_cast<double>(child->position.x.value),
        static_cast<double>(child->position.y.value), child->petal_render_flags,
        static_cast<double>(child->health.value), child->lifetime_remaining_ms,
        child->velocity.x, child->velocity.y, child->acceleration.x, child->acceleration.y);
      first = false;
    }
  }
  std::printf("]\n");
}
void lifecycle_trace() {
  std::printf("[");
  bool first = true;
  for (const auto type : {10U, 11U, 12U, 19U, 20U, 29U, 30U, 34U}) {
    engine::World world;
    setup(world, type);
    world.apply_input(1, engine::f32(0), engine::f32(0));
    std::printf("%s{\"type\":%u,\"frames\":[", first ? "" : ",", type);
    for (int frame = 1; frame <= 100; ++frame) {
      engine::tick(world, 50);
      std::printf("%s{\"now\":%d,\"equipped\":%s,\"progress\":%u}", frame == 1 ? "" : ",", frame * 50,
        world.loadout().handle(0, 0).valid() ? "true" : "false", world.loadout().recharge_progress()[0]);
    }
    std::printf("]}");
    first = false;
  }
  std::printf("]\n");
}
} // namespace
int main(int argc, char** argv) {
  if (argc > 1 && std::strcmp(argv[1], "--trace") == 0) { callback_trace(); return 0; }
  if (argc > 1 && std::strcmp(argv[1], "--split") == 0) { split_trace(); return 0; }
  if (argc > 1 && std::strcmp(argv[1], "--lifecycle") == 0) { lifecycle_trace(); return 0; }
  release_and_recharge();
  peas_lifecycle();
  web_death_and_area();
  production_wire_models();
  controlling_root_full_tick_contacts();
  std::puts("Projectile regression checks passed");
}
