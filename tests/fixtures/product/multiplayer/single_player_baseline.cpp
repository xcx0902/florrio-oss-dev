#include "engine/net/worker_api.hpp"
#include "engine/sim/combat.hpp"
#include <array>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string_view>

namespace {
void require(bool value, const char* message) {
  if (!value) { std::cerr << "single-player baseline: " << message << '\n'; std::exit(1); }
}
void command(engine::WorkerApi& api, std::uint32_t sequence, std::uint32_t opcode) {
  engine::ByteWriter writer;
  writer.write_varint32(sequence); writer.write_varint32(opcode);
  if (opcode == 6U) { for (char ch : std::string_view("M00")) writer.write_u8(ch); writer.write_u8(0); }
  if (opcode == 3U) writer.write_varint32(0);
  if (opcode == 12U) { writer.write_varint32(1); writer.write_f32_le(0); writer.write_f32_le(200); }
  require(api.send(writer.bytes(), {}), "valid fixture input was rejected");
}
template<typename Container> void array(const Container& values) {
  std::cout << '['; bool first = true;
  for (auto value : values) { if (!first) std::cout << ','; first = false; std::cout << +value; }
  std::cout << ']';
}
void checkpoint(engine::WorkerApi& api, const char* label) {
  auto& world = api.world();
  std::cout << "{\"label\":\"" << label << "\",\"tick\":" << world.tick()
    << ",\"timeMs\":" << world.time_ms() << ",\"rng\":{\"game\":" << world.random().state()
    << ",\"gameDraws\":" << world.random().draws() << ",\"handles\":\"" << world.rng().state()
    << "\",\"deathShuffle\":" << world.death_shuffle_random().state()
    << ",\"deathShuffleDraws\":" << world.death_shuffle_random().draws() << "},\"body\":" << world.player().raw
    << ",\"level\":" << +world.profile().level() << ",\"experienceBits\":" << world.profile().experience().bits()
    << ",\"scoreBits\":" << world.loadout().score().bits() << ",\"inventory\":";
  array(world.profile().inventory());
  std::cout << ",\"loadout\":[";
  for (std::size_t i = 0; i < world.loadout().slots().size(); ++i) {
    if (i != 0) std::cout << ',';
    std::cout << world.loadout().slots()[i].type_id;
  }
  std::cout << "],\"lastDeathLevel\":" << +world.last_death_level() << ",\"retained\":[";
  for (std::size_t i = 0; i < world.last_death_kept_count(); ++i) {
    if (i != 0) std::cout << ',';
    std::cout << world.last_death_kept()[i];
  }
  std::cout << "],\"drops\":[";
  bool first = true;
  for (auto handle : world.pickups()) {
    if (!first) std::cout << ','; first = false;
    const auto* drop = world.entities().get(handle);
    require(drop != nullptr, "pickup registry contains a stale handle");
    std::cout << '[' << handle.raw << ',' << drop->type_id << ']';
  }
  std::cout << "],\"entities\":["; first = true;
  for (const auto& entity : world.entities().entities()) if (entity.active) {
    if (!first) std::cout << ','; first = false;
    std::cout << '[' << entity.handle.raw << ',' << static_cast<unsigned>(entity.kind)
      << ',' << entity.type_id << ',' << entity.owner << ',' << entity.position.x.bits()
      << ',' << entity.position.y.bits() << ',' << entity.health.bits() << ',' << entity.max_health.bits()
      << ',' << entity.death_processed << ',' << entity.death_time_ms << ']';
  }
  std::cout << "]}";
}
}
int main() {
  auto api = std::make_unique<engine::WorkerApi>();
  api->init(false);
  auto& world = api->world();
  require(world.random().state() == 285456437U, "initial game seed changed");
  command(*api, 1, 6);
  const auto original = world.player();
  require(original.valid(), "spawn did not create a body");
  const auto start_x = world.entities().get(original)->position.x;
  std::cout << "{\"schema\":\"single-player-domain-v1\",\"seeds\":{\"handleInitializer\":0,\"game\":285456437,\"deathGame\":47,\"deathShuffle\":1},\"tickMs\":50,\"autoPopulate\":false,\"entityColumns\":[\"handle\",\"kind\",\"type\",\"owner\",\"xBits\",\"yBits\",\"healthBits\",\"maxHealthBits\",\"deathProcessed\",\"deathTimeMs\"],\"checkpoints\":[";
  checkpoint(*api, "spawn");
  command(*api, 2, 12);
  for (int i = 0; i < 10; ++i) api->think();
  require(world.tick() == 10 && world.time_ms() == 500, "movement tick/time changed");
  require(world.entities().get(original)->position.x.value > start_x.value, "movement did not advance x");
  std::cout << ','; checkpoint(*api, "movement");
  auto position = world.entities().get(original)->position;
  position.x += engine::f32(1000);
  const auto mob = api->spawn(engine::EntityKind::kMob, 4, position);
  require(mob.valid(), "combat mob spawn failed");
  const auto hit = engine::damage_entity(world, original, engine::f32(12.5F), mob);
  require(!hit.died && hit.remaining.value < world.entities().get(original)->max_health.value, "nonlethal hit failed");
  const auto kill = engine::damage_entity(world, mob, world.entities().get(mob)->health, original);
  require(kill.died && world.entities().get(mob)->death_processed, "mob death failed");
  require(world.loadout().score().value > 0, "actual player kill did not award mob XP");
  std::cout << ','; checkpoint(*api, "combat");
  // Same carried items and streams as the existing level-30 death regression.
  const std::array<std::uint16_t, 16> carried{1,2,6,7,8,9,10,12,15,18,19,22,25,29,34,36};
  world.profile().set_level(30); world.profile().set_experience(engine::f32(2.5F));
  for (std::uint8_t i = 0; i < carried.size(); ++i) world.profile().set_inventory(i, carried[i]);
  world.profile().set_inventory_count(16); world.loadout().restore_from_profile(world.profile());
  world.loadout().set_score(engine::f32(1234.5F)); world.random().seed(47); world.seed_death_shuffle(1);
  // Remove the combat mob's loot before the independently seeded death case.
  const auto old_drops = world.pickups();
  for (auto drop : old_drops) require(world.destroy(drop), "combat drop cleanup failed");
  command(*api, 3, 3);
  require(world.entities().get(original)->death_processed, "suicide did not settle immediately");
  require(world.entities().get(original)->death_time_ms == 1500, "corpse deadline changed");
  require(world.pickups().size() == 3, "level-30 death no longer makes three drops");
  const std::array<std::uint16_t, 3> expected_drops{34,15,19};
  for (std::size_t i = 0; i < expected_drops.size(); ++i)
    require(world.entities().get(world.pickups()[i])->type_id == expected_drops[i], "death drop order changed");
  std::cout << ','; checkpoint(*api, "death");
  for (int i = 0; i < 19; ++i) api->think();
  require(world.entities().get(original) != nullptr, "corpse vanished before 1000ms");
  api->think();
  require(!world.player().valid() && world.entities().get(original) == nullptr, "corpse remains past deadline");
  std::cout << ','; checkpoint(*api, "corpse-removed");
  for (int i = 0; i < 19; ++i) api->think();
  command(*api, 4, 6);
  require(!world.player().valid(), "spawn accepted before 2500ms");
  std::cout << ','; checkpoint(*api, "cooldown-blocked");
  api->think(); command(*api, 5, 6);
  require(world.player().valid() && world.player() != original, "respawn needs a new body");
  require(world.time_ms() == 2500 && world.profile().level() == 22, "respawn timing/level changed");
  require(world.profile().experience().value == 0, "respawn kept partial XP");
  require(world.entities().get(world.player())->health == world.entities().get(world.player())->max_health, "respawn health incomplete");
  std::cout << ','; checkpoint(*api, "respawn");
  std::cout << "],\"complete\":true}\n";
}
