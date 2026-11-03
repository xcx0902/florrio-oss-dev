#pragma once
#include "multiplayer.hpp"
#include "test_support.hpp"
#include "engine/model/entity_relations.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/spawn.hpp"

namespace engine::test::gameplay {
inline Vec2 at(float x, float y = 0) {
  return {f32(x), f32(y)};
}
inline PlayerState& state(World& world, PlayerId id) {
  return *world.players().get(id);
}
inline Entity& body(World& world, PlayerId id) {
  return *world.entities().get(state(world, id).player());
}
inline PlayerProfile profile(std::uint16_t type = 0, std::uint8_t level = 1) {
  auto value = make_default_profile();
  value.clear_inventory();
  value.set_level(level);
  if (type != 0) {
    value.set_inventory(0, type);
    value.set_inventory_count(1);
  }
  return value;
}
inline EntityHandle petal(World& world, PlayerId id) {
  return state(world, id).loadout().handle(0, 0);
}
inline void contacts(World& world) {
  update_contact_tree(world);
  (void)resolve_contacts(world);
}
inline void publish_cleanup(World& world) {
  // M04 owns read-only replication. This fixture only retires test tick events.
  world.clear_hit_events();
  world.clear_destroyed();
  world.players().for_each([](PlayerState& player) { player.loadout().clear_pickup_transfers(); });
}
}  // namespace engine::test::gameplay
