#include "engine/net/catalog_id.hpp"
#include "../../../../engine/tests/support/single_player.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/combat.hpp"
#include <array>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string_view>

namespace {
void require(bool value, const char* message) {
  if (!value) {
    std::cerr << "single-player baseline: " << message << '\n';
    std::exit(1);
  }
}
void command(engine::WorkerApi& api, std::uint32_t sequence, std::uint32_t opcode) {
  engine::ByteWriter writer;
  writer.write_varint32(sequence);
  writer.write_varint32(opcode);
  if (opcode == 6U) {
    for (char ch : std::string_view("M00")) {
      writer.write_u8(ch);
    }
    writer.write_u8(0);
  }
  if (opcode == 3U) {
    writer.write_varint32(0);
  }
  if (opcode == 12U) {
    writer.write_varint32(1);
    writer.write_f32_le(0);
    writer.write_f32_le(200);
  }
  require(api.send(writer.bytes(), {}), "valid fixture input was rejected");
}
template <typename Container>
void array(const Container& values) {
  std::cout << '[';
  bool first = true;
  for (auto value : values) {
    if (!first) {
      std::cout << ',';
    }
    first = false;
    std::cout << static_cast<unsigned>(value);
  }
  std::cout << ']';
}
void checkpoint(engine::WorkerApi& api, const char* label) {
  auto& world = api.world();
  std::cout << "{\"label\":\"" << label << "\",\"tick\":" << world.tick()
            << ",\"timeMs\":" << world.time_ms() << ",\"rng\":{\"game\":" << world.random().state()
            << ",\"gameDraws\":" << world.random().draws() << ",\"handles\":\""
            << world.rng().state() << "\",\"deathShuffle\":" << world.death_shuffle_random().state()
            << ",\"deathShuffleDraws\":" << world.death_shuffle_random().draws()
            << "},\"body\":" << engine::test::player(world).player().raw
            << ",\"level\":" << +engine::test::player(world).profile().level()
            << ",\"experienceBits\":" << engine::test::player(world).profile().experience().bits()
            << ",\"scoreBits\":" << engine::test::player(world).loadout().score().bits()
            << ",\"inventory\":";
  array(engine::test::player(world).profile().inventory());
  std::cout << ",\"loadout\":[";
  for (std::size_t i = 0; i < engine::test::player(world).loadout().slots().size(); ++i) {
    if (i != 0) {
      std::cout << ',';
    }
    std::cout << static_cast<unsigned>(engine::test::player(world).loadout().slots()[i].type_id);
  }
  std::cout << "],\"lastDeathLevel\":" << +engine::test::player(world).last_death_level()
            << ",\"retained\":[";
  for (std::size_t i = 0; i < engine::test::player(world).last_death_kept_count(); ++i) {
    if (i != 0) {
      std::cout << ',';
    }
    std::cout << static_cast<unsigned>(engine::test::player(world).last_death_kept()[i]);
  }
  std::cout << "],\"drops\":[";
  bool first = true;
  for (auto handle : world.pickups()) {
    if (!first) {
      std::cout << ',';
    }
    first = false;
    const auto* drop = world.entities().get(handle);
    require(drop != nullptr, "pickup registry contains a stale handle");
    std::cout << '[' << handle.raw << ',' << static_cast<unsigned>(drop->petal_id) << ']';
  }
  std::cout << "],\"entities\":[";
  first = true;
  for (const auto& entity : world.entities().entities()) {
    if (entity.active) {
      if (!first) {
        std::cout << ',';
      }
      first = false;
      std::cout << '[' << entity.handle.raw << ',' << static_cast<unsigned>(entity.kind) << ','
                << engine::net::catalog_type_id(entity) << ',' << entity.owner << ','
                << entity.position.x.bits() << ',' << entity.position.y.bits() << ','
                << entity.health.bits() << ',' << entity.max_health.bits() << ','
                << entity.death_processed << ',' << entity.death_time_ms << ']';
    }
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
  const auto original = engine::test::player(world).player();
  require(original.valid(), "spawn did not create a body");
  const auto start_x = world.entities().get(original)->position.x;
  std::cout
      << "{\"schema\":\"single-player-domain-v1\",\"seeds\":{\"handleInitializer\":0,\"game\":285456437,\"deathGame\":47,\"deathShuffle\":1},\"tickMs\":50,\"autoPopulate\":false,\"entityColumns\":[\"handle\",\"kind\",\"type\",\"owner\",\"xBits\",\"yBits\",\"healthBits\",\"maxHealthBits\",\"deathProcessed\",\"deathTimeMs\"],\"checkpoints\":[";
  checkpoint(*api, "spawn");
  command(*api, 2, 12);
  for (int i = 0; i < 10; ++i) {
    api->think();
  }
  require(world.tick() == 10 && world.time_ms() == 500, "movement tick/time changed");
  require(world.entities().get(original)->position.x.value > start_x.value,
          "movement did not advance x");
  std::cout << ',';
  checkpoint(*api, "movement");
  auto position = world.entities().get(original)->position;
  position.x += engine::f32(1000);
  const auto mob =
      api->spawn(engine::EntityKind::kMob, engine::catalog::SpeciesId::kLadybug, position);
  require(mob.valid(), "combat mob spawn failed");
  const auto hit = engine::damage_entity(world, original, engine::f32(12.5F), mob);
  require(!hit.died && hit.remaining.value < world.entities().get(original)->max_health.value,
          "nonlethal hit failed");
  const auto kill = engine::damage_entity(world, mob, world.entities().get(mob)->health, original);
  require(kill.died && world.entities().get(mob)->death_processed, "mob death failed");
  require(engine::test::player(world).loadout().score().value > 0,
          "actual player kill did not award mob XP");
  std::cout << ',';
  checkpoint(*api, "combat");
  // Same carried items and streams as the existing level-30 death regression.
  const std::array<engine::catalog::PetalId, 16> carried{
      engine::catalog::PetalId::kBasicCommon,       engine::catalog::PetalId::kFastCommon,
      engine::catalog::PetalId::kRoseUnusual,       engine::catalog::PetalId::kStingerUnusual,
      engine::catalog::PetalId::kIrisUnusual,       engine::catalog::PetalId::kWingRare,
      engine::catalog::PetalId::kMissileRare,       engine::catalog::PetalId::kPeasEpic,
      engine::catalog::PetalId::kRoseEpic,          engine::catalog::PetalId::kBubbleRare,
      engine::catalog::PetalId::kPollenEpic,        engine::catalog::PetalId::kEggEpic,
      engine::catalog::PetalId::kAntennaeLegendary, engine::catalog::PetalId::kWebRare,
      engine::catalog::PetalId::kPeasLegendary,     engine::catalog::PetalId::kSaltRare};
  engine::test::player(world).profile().set_level(30);
  engine::test::player(world).profile().set_experience(engine::f32(2.5F));
  for (std::uint8_t i = 0; i < carried.size(); ++i) {
    engine::test::player(world).profile().set_inventory(i, carried[i]);
  }
  engine::test::player(world).profile().set_inventory_count(16);
  engine::test::player(world).loadout().restore_from_profile(engine::test::player(world).profile());
  engine::test::player(world).loadout().set_score(engine::f32(1234.5F));
  world.random().seed(47);
  world.seed_death_shuffle(1);
  // Remove the combat mob's loot before the independently seeded death case.
  const auto old_drops = world.pickups();
  for (auto drop : old_drops) {
    require(world.destroy(drop), "combat drop cleanup failed");
  }
  command(*api, 3, 3);
  require(world.entities().get(original)->death_processed, "suicide did not settle immediately");
  require(world.entities().get(original)->death_time_ms == 1500, "corpse deadline changed");
  require(world.pickups().size() == 3, "level-30 death no longer makes three drops");
  const std::array<engine::catalog::PetalId, 3> expected_drops{
      engine::catalog::PetalId::kPeasLegendary, engine::catalog::PetalId::kRoseEpic,
      engine::catalog::PetalId::kPollenEpic};
  for (std::size_t i = 0; i < expected_drops.size(); ++i) {
    require(world.entities().get(world.pickups()[i])->petal_id == expected_drops[i],
            "death drop order changed");
  }
  std::cout << ',';
  checkpoint(*api, "death");
  for (int i = 0; i < 19; ++i) {
    api->think();
  }
  require(world.entities().get(original) != nullptr, "corpse vanished before 1000ms");
  api->think();
  require(!engine::test::player(world).player().valid() &&
              world.entities().get(original) == nullptr,
          "corpse remains past deadline");
  std::cout << ',';
  checkpoint(*api, "corpse-removed");
  for (int i = 0; i < 19; ++i) {
    api->think();
  }
  command(*api, 4, 6);
  require(!engine::test::player(world).player().valid(), "spawn accepted before 2500ms");
  std::cout << ',';
  checkpoint(*api, "cooldown-blocked");
  api->think();
  command(*api, 5, 6);
  require(engine::test::player(world).player().valid() &&
              engine::test::player(world).player() != original,
          "respawn needs a new body");
  require(world.time_ms() == 2500 && engine::test::player(world).profile().level() == 22,
          "respawn timing/level changed");
  require(engine::test::player(world).profile().experience().value == 0, "respawn kept partial XP");
  require(world.entities().get(engine::test::player(world).player())->health ==
              world.entities().get(engine::test::player(world).player())->max_health,
          "respawn health incomplete");
  std::cout << ',';
  checkpoint(*api, "respawn");
  std::cout << "],\"complete\":true}\n";
}
