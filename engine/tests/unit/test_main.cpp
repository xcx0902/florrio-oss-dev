#include "engine/abi.h"
#include "engine/core/byte_reader.hpp"
#include "engine/core/f32.hpp"
#include "engine/core/fixed_step.hpp"
#include "engine/core/rng.hpp"
#include "engine/core/vec2.hpp"
#include "engine/catalog/drop_table.hpp"
#include "engine/catalog/petal_defaults.hpp"
#include "engine/model/catalog.hpp"
#include "engine/model/component_store.hpp"
#include "engine/model/entity.hpp"
#include "engine/model/world.hpp"
#include "engine/model/hit_message.hpp"
#include "engine/model/simulation_frame.hpp"
#include "engine/net/input.hpp"
#include "engine/net/angle.hpp"
#include "engine/net/protocol.hpp"
#include "engine/net/snapshot.hpp"
#include "engine/net/snapshot_header.hpp"
#include "engine/net/original_snapshot.hpp"
#include "engine/net/dense_fields.hpp"
#include "engine/sim/quadtree.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/bounds.hpp"
#include "engine/sim/collision.hpp"
#include "engine/sim/collision_filter.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/progression.hpp"
#include "engine/sim/damage.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/petal_orbit.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/spatial.hpp"
#include "engine/sim/species_attacks.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/tick.hpp"

#include <array>
#include <algorithm>
#include <map>
#include "engine/net/packet_key.hpp"
#include <cmath>
#include <cstdio>
#include <cstring>
#include <set>
#include <cstdint>
#include <vector>

namespace {

int failures = 0;
int testsRun = 0;
int testsFailed = 0;
bool tapOutput = false;

void runTest(const char* name, void (*body)()) {
  const int before = failures;
  body();
  ++testsRun;
  const bool passed = failures == before;
  if (!passed) ++testsFailed;
  if (tapOutput) std::printf("%s %d - %s\n", passed ? "ok" : "not ok", testsRun, name);
}

#define CHECK(condition) do { \
  if (!(condition)) { \
    std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
    ++failures; \
  } \
} while (false)

#include "test_original_client_adapter.hpp"

void test_f32() {
  CHECK(engine::f32(1.0F).bits() == 0x3F800000U);
  CHECK(engine::f32::from_bits(0x3F800000U).to_float() == 1.0F);
  CHECK(engine::f32::from_double(0.5).to_float() == 0.5F);
  CHECK((engine::f32(1.5F) + engine::f32(2.25F)).to_float() == 3.75F);
  CHECK((engine::f32(3.0F) / engine::f32(2.0F)).to_float() == 1.5F);
}

void test_vec2() {
  const engine::Vec2 a(engine::f32(3.0F), engine::f32(4.0F));
  CHECK(std::fabs(a.length().to_float() - 5.0F) < 1e-6F);
  CHECK(a.length_squared().to_float() == 25.0F);
  const engine::Vec2 b = a.normalized();
  CHECK(std::fabs(b.length().to_float() - 1.0F) < 1e-6F);
  CHECK((a + engine::Vec2(engine::f32(1.0F), engine::f32(-1.0F))).x.to_float() == 4.0F);
}

void test_rng() {
  engine::ParkMillerRng park(1);
  CHECK(park.next() == 16807);
  CHECK(park.next() == 282475249);
  CHECK(park.next() == 1622650073);

  engine::MinstdRng lcg(0);
  const std::uint64_t first = lcg.next_state();
  CHECK(first == 1ULL);
  const std::uint64_t second = lcg.next_state();
  CHECK(second == 6364136223846793006ULL);
  const std::uint64_t third = lcg.next_state();
  CHECK(lcg.next_generation() == static_cast<std::uint32_t>((third * 6364136223846793005ULL + 1ULL) >> 33U));
}

void test_varint_roundtrip() {
  const std::array<std::uint32_t, 8> values{0, 1, 127, 128, 16384, 0xFFFFFF, 0xFFFFFFFFU, 42};
  for (const std::uint32_t value : values) {
    engine::ByteWriter writer;
    writer.write_varint32(value);
    engine::ByteReader reader(writer.bytes());
    const auto decoded = reader.read_varint32();
    CHECK(decoded.has_value());
    CHECK(*decoded == value);
    CHECK(reader.eof());
  }
  const std::array<std::uint8_t, 5> overflow{0x80, 0x80, 0x80, 0x80, 0x80};
  engine::ByteReader reader(overflow);
  CHECK(!reader.read_varint32().has_value());
  CHECK(reader.error() == engine::ParseError::kVarintOverflow);
}

void test_byte_reader_bounds() {
  const std::array<std::uint8_t, 3> bytes{1, 2, 3};
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(!reader.read_u32_le().has_value());
  CHECK(reader.error() == engine::ParseError::kOutOfBounds);
}

void test_xor() {
  std::array<std::uint8_t, 5> bytes{1, 2, 3, 4, 5};
  const std::array<std::uint8_t, 3> key{7, 11, 13};
  const auto original = bytes;
  engine::xor_in_place(bytes, key);
  CHECK(bytes != original);
  engine::xor_in_place(bytes, key);
  CHECK(bytes == original);
}

void test_fixed_step() {
  engine::FixedStepClock clock;
  CHECK(clock.advance(0.0) == 0);
  CHECK(clock.advance(49.0) == 0);
  CHECK(clock.advance(50.0) == 1);
  CHECK(clock.advance(1000.0) == 2); // 950 ms clamped to 100 ms => two ticks
  engine::FixedStepClock steady;
  for (int index = 0; index < 20; ++index) CHECK(steady.advance((index + 1) * 50.0) == 1);
}

void test_entity_handle() {
  const engine::EntityHandle handle = engine::EntityHandle::from_parts(5, 7);
  CHECK(handle.index() == 5);
  CHECK(handle.generation() == 7);
  const engine::EntityHandle wire = engine::EntityHandle::from_wire(handle.to_wire());
  CHECK(wire == handle);
  CHECK(engine::EntityHandle::from_wire(handle.to_wire()).raw == handle.raw);
}

void test_entity_pool() {
  engine::EntityPool pool;
  CHECK(pool.active_count() == 0);
  const auto first = pool.allocate();
  CHECK(first.has_value());
  CHECK(pool.active_count() == 1);
  CHECK(pool.get(*first) != nullptr);
  const std::uint32_t generation = first->generation();
  CHECK(generation != 0);
  CHECK(pool.release(*first));
  CHECK(pool.active_count() == 0);
  const auto second = pool.allocate();
  CHECK(second.has_value());
  CHECK(second->index() == 1); // FIFO free list: 0 was released to the tail
  CHECK(second->generation() == 1);
  CHECK(pool.get(*first) == nullptr);
  CHECK(pool.get(*second) != nullptr);
}

void test_world_tick() {
  engine::World world;
  world.set_initialized(true);
  const auto handle = world.entities().allocate();
  CHECK(handle.has_value());
  engine::Entity* entity = world.entities().get(*handle);
  CHECK(entity != nullptr);
  entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  entity->velocity = engine::Vec2d(10.0, -5.0);
  engine::tick(world, 100.0);
  CHECK(world.tick() == 1);
  const double damping = std::pow(0.992, 100.0);
  const double drag = 125.0 - 125.0 * damping;
  CHECK(std::fabs(entity->position.x.to_float() - static_cast<float>(drag * 10.0)) < 1e-3F);
  CHECK(std::fabs(entity->position.y.to_float() + static_cast<float>(drag * 5.0)) < 1e-3F);

  entity->health = engine::f32(0.0F);
  engine::tick(world, 50.0);
  CHECK(world.entities().get(*handle) == nullptr);
  CHECK(world.entities().active_count() == 0);
}

void test_petal_orbit() {
  CHECK(engine::orbit_radius(engine::OrbitProfile::kBasic, 0) == engine::f32(65.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kBasic, 1) == engine::f32(130.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kBasic, 2) == engine::f32(40.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kBasic, 3) == engine::f32(130.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kFast, 1) == engine::f32(145.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kHeavy, 2) == engine::f32(50.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kRock, 1) == engine::f32(110.0F));
  CHECK(engine::orbit_radius(engine::OrbitProfile::kRock, 2) == engine::f32(55.0F));
  for (std::uint32_t inputs = 0; inputs < 256; ++inputs) {
    const auto value = engine::orbit_radius(engine::OrbitProfile::kFast, static_cast<std::uint8_t>(inputs));
    CHECK(value == engine::f32(inputs & 1U ? 145.0F : inputs & 2U ? 40.0F : 65.0F));
  }
  CHECK(engine::wing_orbit_radius(0, engine::f32(0.0F)) == engine::f32(65.0F));
  CHECK(engine::wing_orbit_radius(1, engine::f32(0.0F)) == engine::f32(140.0F));
  CHECK(engine::wing_orbit_radius(2, engine::f32(0.0F)) == engine::f32(40.0F));
  CHECK(std::fabs(engine::wing_orbit_radius(1, engine::f32(1.5707963267948966F)).to_float() - 190.0F) < 1e-4F);
}

void test_petals() {
  engine::World world;
  world.set_initialized(true);
  CHECK(engine::petal_radius(1).to_float() == 14.0F);
  CHECK(engine::petal_radius(999).to_float() == 0.0F);
  const auto handle = engine::spawn_petal(world, 1,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::f32(10.0F), engine::f32(0.0F));
  CHECK(handle.valid());
  engine::Entity* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPetal);
  CHECK(entity->type_id == 1);
  CHECK(entity->radius.to_float() == 14.0F);
  // Original 397 spawns the petal at the owner's position; the orbit spring
  // pulls it outward afterwards.
  CHECK(entity->position.x.to_float() == 0.0F);
  CHECK(std::fabs(entity->position.y.to_float()) < 1e-6F);
  CHECK(world.petals().size() == 1);
  CHECK(world.petals()[0].handle == handle);
  CHECK(world.petals()[0].type_id == 1);
  CHECK(world.petals()[0].orbit_radius.to_float() == 10.0F);
  entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  entity->velocity = engine::Vec2d(0.0, 0.0);
  engine::update_petal_orbit(world, world.petals()[0], 16.0);
  CHECK(entity->velocity.x > 0.0);
  CHECK(std::fabs(entity->velocity.y) < 1e-6);
  entity->health = engine::f32(0.0F);
  engine::tick(world, 50.0);
  CHECK(world.petals().empty());
  world.reset();
  CHECK(world.petals().empty());
  const auto drop = engine::spawn_drop(world, 1, engine::Vec2(engine::f32(3.0F), engine::f32(4.0F)));
  CHECK(drop.valid());
  const engine::Entity* drop_entity = world.entities().get(drop);
  CHECK(drop_entity != nullptr);
  CHECK(drop_entity->kind == engine::EntityKind::kDrop);
  CHECK(drop_entity->type_id == 1);
  CHECK(drop_entity->radius.to_float() == 14.0F);
  engine::PetalSlot slot = engine::make_petal_slot(1);
  CHECK(slot.count == 1);
  CHECK(slot.ready());
  slot.recharge_remaining_ms = 2500.0;
  CHECK(!slot.ready());
  CHECK(!slot.advance(2499.0));
  CHECK(slot.advance(1.0));
  CHECK(slot.ready());
  CHECK(slot.recharge_remaining_ms == 0.0);
}

void test_populate_world() {
  engine::World world;
  world.set_initialized(true);
  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  std::array<std::uint8_t, 8> counts{};
  counts[0] = 2;
  const auto spawned = engine::populate_world(world, table, counts);
  CHECK(!spawned.empty());
  CHECK(world.entities().active_count() >= spawned.size());
  for (const auto handle : spawned) CHECK(world.entities().get(handle) != nullptr);
}

void test_player_loadout() {
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, 1));
  CHECK(loadout.equip(1, 2));
  CHECK(loadout.slots()[0].type_id == 1);
  CHECK(loadout.slots()[1].type_id == 2);
  CHECK(loadout.swap(0, 1, 1, 2));
  CHECK(loadout.slots()[0].type_id == 2);
  CHECK(loadout.slots()[1].type_id == 1);
  CHECK(!loadout.swap(0, 1, 1, 2));
  CHECK(loadout.discard(0, 2));
  CHECK(loadout.slots()[0].count == 0);
  CHECK(!loadout.discard(0, 2));
  loadout.clear();
  CHECK(loadout.slots()[1].count == 0);
}

void test_profile_discard_and_swap() {
  engine::PlayerProfile profile;
  profile.set_inventory(0, 4);
  profile.set_inventory(1, 2);
  profile.set_inventory_count(2);
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, 4));
  CHECK(loadout.equip(1, 2));
  CHECK(loadout.discard(profile, 0, 4));
  CHECK(profile.backpack_count() == 1);
  CHECK(profile.backpack()[0] == 4);
  CHECK(profile.inventory(0) == 0);
  CHECK(profile.level() > 0);
  CHECK(loadout.slots()[0].count == 0);
  CHECK(loadout.swap(profile, 1, 2, 0, 0));
  CHECK(profile.inventory(1) == 0);
  CHECK(loadout.slots()[1].count == 0);

  engine::PlayerProfile fifo;
  for (std::uint16_t item = 1; item <= 16; ++item) fifo.push_backpack(item);
  fifo.push_backpack(17);
  CHECK(fifo.backpack_count() == 16);
  CHECK(fifo.backpack()[0] == 2);
  CHECK(fifo.backpack()[15] == 17);
}

void test_discard_removes_petals() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "discard", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 1);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 1));
  CHECK(engine::spawn_loadout_petals(world) == 1);
  const engine::EntityHandle petal = world.loadout().slots()[0].instances[0];
  CHECK(petal.valid());
  CHECK(world.loadout().discard(world.profile(), 0, 1));
  engine::remove_slot_petals(world, 0);
  CHECK(world.entities().get(petal) == nullptr);
  CHECK(world.petals().empty());
}

void test_cactus_construction() {
  engine::ServerRng rng(1383144482U);
  const engine::CactusBody body = engine::configure_cactus(rng);
  CHECK(body.radius.value >= 40.0F && body.radius.value <= 60.0F);
  CHECK(body.health.value == body.radius.value * 0.7F);
  engine::World world;
  world.initialize();
  engine::ServerRng spawn_rng(1383144482U);
  const auto handle = engine::spawn_cactus_function144(world,
    engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)), spawn_rng);
  CHECK(handle.valid());
  const auto* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->type_id == 3);
  CHECK(entity->contact_damage.value == 30.0F);
  CHECK(entity->world_flags == 75);
  CHECK(entity->entity_flags == 96);
  CHECK(entity->component_flags92 == 0);
  CHECK(std::fabs(entity->health.value - entity->radius.value * 0.7F) < 1e-5F);
}

void test_player_spawn() {
  engine::World world;
  world.set_initialized(true);
  const engine::PlayerConfig config{engine::f32(25.0F), engine::f32(100.0F), engine::f32(100.0F), engine::f32(0.0F)};
  const auto player = engine::spawn_player(world, "tester",
    engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)), config);
  CHECK(player.valid());
  CHECK(world.player() == player);
  CHECK(world.player_name() == "tester");
  const engine::Entity* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPlayer);
  CHECK(entity->radius.to_float() == 25.0F);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->max_health.to_float() == 100.0F);
  CHECK(!engine::spawn_player(world, "again",
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), config).valid());
  world.apply_input(0, engine::f32(0.0F), engine::f32(23913.0F));
  engine::tick(world, 50.0);
  CHECK(entity->position.x.to_float() > 5.0F);
  CHECK(entity->position.x.to_float() < 7.0F);
  CHECK(std::fabs(entity->position.y.to_float() - 2.0F) < 1e-3F);
}

void test_drop_pickup() {
  engine::World world;
  world.set_initialized(true);
  const engine::PlayerConfig config{engine::f32(25.0F), engine::f32(100.0F), engine::f32(100.0F), engine::f32(0.0F)};
  CHECK(engine::spawn_player(world, "p", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), config).valid());
  const auto drop = engine::spawn_drop(world, 1, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  // Original pickup+48 stores spawn time; collection is gated until +500ms.
  // Keep the transfer assertions, and also reject any premature publication.
  for (unsigned step = 0; step < 9U; ++step) {
    engine::tick(world, 50.0);
    CHECK(!world.entities().get(drop)->pickup_collected);
    CHECK(world.loadout().pickup_transfers().empty());
  }
  engine::tick(world, 50.0);
  CHECK(world.entities().get(drop) != nullptr);
  CHECK(world.entities().get(drop)->pickup_collected);
  CHECK(world.loadout().pickup_transfers().size() == 1U);
  if (world.loadout().pickup_transfers().size() != 1U) return;
  CHECK(world.loadout().pickup_transfers()[0].drop == drop);
  CHECK(world.loadout().pickup_transfers()[0].slot == 0U);
  CHECK(world.loadout().slots()[0].type_id == 1);
  CHECK(world.loadout().slots()[0].count == 1);
  engine::tick(world, 1950.0);
  CHECK(world.entities().get(drop) != nullptr);
  engine::tick(world, 50.0);
  CHECK(world.entities().get(drop) == nullptr);
}

void test_spawn_table() {
  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  const float expected_totals[8] = {
    0.7942009568214417F, 0.8192009329795837F, 0.7390009760856628F, 0.8190009593963623F,
    0.48900100588798523F, 0.4140009880065918F, 0.5140010118484497F, 0.4140009880065918F,
  };
  const std::uint8_t expected_counts[8] = {8, 9, 9, 12, 10, 9, 10, 9};
  for (std::uint8_t band = 0; band < 8; ++band) {
    CHECK(table.band(band).total.value == expected_totals[band]);
    CHECK(table.band(band).entries.size() == expected_counts[band]);
  }
  const std::uint8_t expected_band0[] = {1, 2, 4, 5, 6, 7, 15, 19};
  for (std::size_t index = 0; index < table.band(0).entries.size(); ++index) {
    CHECK(table.band(0).entries[index].entity_type == expected_band0[index]);
  }
  engine::ServerRng sequence(1);
  CHECK(sequence.next() == 48271U);
  CHECK(sequence.next() == 182605794U);
  CHECK(sequence.next() == 1291394886U);
  CHECK(sequence.next() == 1914720637U);
  engine::ServerRng rng(1);
  const auto* first = table.choose(0, rng);
  CHECK(first != nullptr);
  CHECK(first->entity_type == 1);
  rng.seed(2147483646U);
  const auto* last = table.choose(0, rng);
  CHECK(last != nullptr);
  CHECK(last->entity_type == 15);
  rng.seed(787621659U); // original sp_server_init RNG state
  const auto* initial = table.choose(0, rng);
  CHECK(initial != nullptr);
  CHECK(initial->entity_type == 1);

  engine::ServerRng position_rng(787621659U);
  const auto position0 = table.sample_position(0, position_rng);
  CHECK(position0.x.value == -24180.6171875F);
  CHECK(position0.y.value == 652.9090576171875F);
  CHECK(position_rng.state() == 1424269740U);
  engine::ServerRng position_rng1(1);
  const auto position3 = table.sample_position(3, position_rng1);
  CHECK(position3.x.value == -2499.832275390625F);
  CHECK(position3.y.value == -1659.8701171875F);
  engine::ServerRng position_rng2(2147483646U);
  const auto position7 = table.sample_position(7, position_rng2);
  CHECK(position7.x.value == 24999.943359375F);
  CHECK(position7.y.value == 1659.8701171875F);

  engine::ServerRng retry_rng(787621659U);
  int calls = 0;
  const auto found = table.find_clear_position(0, retry_rng, [&](const engine::SpawnPosition&) {
    ++calls;
    return calls <= 2;
  });
  CHECK(found.has_value());
  CHECK(calls == 3);
  engine::ServerRng expected_rng(787621659U);
  (void)table.sample_position(0, expected_rng);
  (void)table.sample_position(0, expected_rng);
  const auto expected = table.sample_position(0, expected_rng);
  CHECK(*found == expected);
  CHECK(retry_rng.state() == expected_rng.state());
  engine::ServerRng full_rng(787621659U);
  const auto none = table.find_clear_position(0, full_rng, [](const engine::SpawnPosition&) { return true; },
    engine::f32(50000.0F), engine::f32(4000.0F), 2);
  CHECK(!none.has_value());
  engine::ServerRng two_trials(787621659U);
  (void)table.sample_position(0, two_trials);
  (void)table.sample_position(0, two_trials);
  CHECK(full_rng.state() == two_trials.state());

  engine::World world;
  world.initialize();
  world.random().seed(787621659U); // observed original post-population state
  int occupancy_calls = 0;
  const engine::EntityHandle spawned = table.spawn_from_band(world, 0,
    [&](const engine::SpawnPosition&) { return ++occupancy_calls <= 2; },
    [&](const engine::SpawnBandEntry& entry, const engine::SpawnPosition& position) {
      return engine::spawn_entity(world, engine::EntityKind::kMob, entry.entity_type,
        engine::Vec2(position.x, position.y), engine::f32(14.0F));
    });
  CHECK(spawned.valid());
  CHECK(occupancy_calls == 3);
  const auto* spawned_entity = world.entities().get(spawned);
  CHECK(spawned_entity != nullptr);
  CHECK(spawned_entity->active);
  CHECK(spawned_entity->type_id == 1);
  engine::ServerRng expected_spawn_rng(787621659U);
  (void)table.choose(0, expected_spawn_rng);
  (void)table.sample_position(0, expected_spawn_rng);
  (void)table.sample_position(0, expected_spawn_rng);
  const auto expected_spawn_position = table.sample_position(0, expected_spawn_rng);
  CHECK(spawned_entity->position.x.value == expected_spawn_position.x.value);
  CHECK(spawned_entity->position.y.value == expected_spawn_position.y.value);
}

void test_spawn_and_movement() {
  engine::World world;
  world.set_initialized(true);
  const engine::EntityHandle handle = engine::spawn_entity(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(10.0F), engine::f32(20.0F)), engine::f32(3.0F));
  CHECK(handle.valid());
  engine::Entity* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kMob);
  CHECK(entity->type_id == 4);
  entity->velocity = engine::Vec2d(2.0, 0.0);
  engine::integrate_positions(world, 0.5);
  CHECK(std::fabs(entity->position.x.to_float() - 11.0F) < 1e-6F);
}

void test_collision() {
  const engine::Vec2 a(engine::f32(0.0F), engine::f32(0.0F));
  const engine::Vec2 b(engine::f32(3.0F), engine::f32(4.0F));
  CHECK(!engine::circles_overlap(a, engine::f32(2.0F), b, engine::f32(2.0F)));
  CHECK(engine::circles_overlap(a, engine::f32(3.0F), b, engine::f32(2.0F)));
  CHECK(engine::circles_overlap(a, engine::f32(2.5F), b, engine::f32(2.5F)));
}

void test_damage_and_effects() {
  engine::Entity entity;
  entity.health = engine::f32(10.0F);
  CHECK(engine::apply_damage(entity, engine::f32(3.0F)).to_float() == 7.0F);
  CHECK(engine::apply_damage(entity, engine::f32(100.0F)).to_float() == 0.0F);
  CHECK(engine::apply_damage(entity, engine::f32(-1.0F)).to_float() == 0.0F);
  engine::EffectTimer timer(100);
  CHECK(timer.active());
  timer.advance(40);
  CHECK(timer.remaining() == 60);
  timer.advance(60);
  CHECK(!timer.active());
}

void test_petal_orbit_profiles() {
  const engine::Vec2 center(engine::f32(1.0F), engine::f32(2.0F));
  const engine::Vec2 at_zero = engine::orbit_position(center, engine::f32(5.0F), engine::f32(0.0F));
  CHECK(std::fabs(at_zero.x.to_float() - 6.0F) < 1e-6F);
  CHECK(std::fabs(at_zero.y.to_float() - 2.0F) < 1e-6F);
}

void test_input_decoder() {
  engine::ByteWriter writer;
  writer.write_varint32(7);
  writer.write_varint32(12);
  writer.write_varint32(3);
  writer.write_f32_le(1.5F);
  writer.write_f32_le(0.25F);
  writer.write_varint32(8);
  writer.write_varint32(8);
  writer.write_u8(4);
  writer.write_u8(1);
  writer.write_varint32(9);
  writer.write_varint32(10);
  writer.write_u8(2);
  writer.write_u8(3);
  writer.write_u8(5);
  writer.write_u8(6);
  writer.write_varint32(10);
  writer.write_varint32(4);
  writer.write_varint32(11);
  writer.write_varint32(13);
  std::vector<std::uint8_t> packet = writer.bytes();
  const std::array<std::uint8_t, 4> key{0x11, 0x22, 0x33, 0x44};
  engine::apply_packet_xor(packet, key);
  std::vector<engine::InputMessage> messages;
  const engine::Status status = engine::decode_input_packet(packet, key, messages);
  CHECK(status == engine::Status::kOk);
  CHECK(messages.size() == 5);
  CHECK(messages[0].sequence == 7);
  CHECK(messages[0].command.opcode == 12);
  CHECK(messages[0].command.buttons == 3);
  CHECK(messages[0].command.angle == 1.5F);
  CHECK(messages[0].command.strength == 0.25F);
  CHECK(messages[1].sequence == 8);
  CHECK(messages[1].command.opcode == 8);
  CHECK(messages[1].command.slot_a == 4);
  CHECK(messages[1].command.value_a == 1);
  CHECK(messages[2].sequence == 9);
  CHECK(messages[2].command.opcode == 10);
  CHECK(messages[2].command.slot_a == 2);
  CHECK(messages[2].command.value_a == 3);
  CHECK(messages[2].command.slot_b == 5);
  CHECK(messages[2].command.value_b == 6);
  CHECK(messages[3].sequence == 10);
  CHECK(messages[3].command.opcode == 4);
  CHECK(messages[4].sequence == 11);
  CHECK(messages[4].command.opcode == 13);

  engine::ByteWriter sanitized;
  sanitized.write_varint32(8);
  sanitized.write_varint32(12);
  sanitized.write_varint32(0);
  sanitized.write_u32_le(0x00000001U); // subnormal
  sanitized.write_u32_le(0x7FC00000U); // NaN
  std::vector<std::uint8_t> sanitized_packet = sanitized.bytes();
  engine::apply_packet_xor(sanitized_packet, key);
  std::vector<engine::InputMessage> sanitized_messages;
  CHECK(engine::decode_input_packet(sanitized_packet, key, sanitized_messages) == engine::Status::kOk);
  CHECK(sanitized_messages.size() == 1);
  CHECK(sanitized_messages[0].sequence == 8);
  CHECK(sanitized_messages[0].command.angle == 0.0F);
  CHECK(sanitized_messages[0].command.strength == 0.0F);

  std::uint32_t last_sequence = 0;
  CHECK(engine::accept_input_sequence(last_sequence, 5));
  CHECK(!engine::accept_input_sequence(last_sequence, 5));
  CHECK(!engine::accept_input_sequence(last_sequence, 4));
  CHECK(engine::accept_input_sequence(last_sequence, 6));
  CHECK(engine::accept_input_sequence(last_sequence, 0));

  engine::ByteWriter strings;
  strings.write_varint32(9);
  strings.write_varint32(5);
  for (const char byte : std::string("hello")) strings.write_u8(static_cast<std::uint8_t>(byte));
  strings.write_u8(0);
  strings.write_varint32(6);
  strings.write_varint32(6);
  for (const char byte : std::string("player")) strings.write_u8(static_cast<std::uint8_t>(byte));
  strings.write_u8(0);
  strings.write_varint32(0);
  strings.write_varint32(0);
  strings.write_u8(7);
  for (const char byte : std::string("a")) strings.write_u8(static_cast<std::uint8_t>(byte));
  strings.write_u8(0);
  for (const char byte : std::string("b")) strings.write_u8(static_cast<std::uint8_t>(byte));
  strings.write_u8(0);
  for (const char byte : std::string("c")) strings.write_u8(static_cast<std::uint8_t>(byte));
  strings.write_u8(0);
  std::vector<std::uint8_t> string_packet = strings.bytes();
  engine::apply_packet_xor(string_packet, key);
  std::vector<engine::InputMessage> string_messages;
  CHECK(engine::decode_input_packet(string_packet, key, string_messages) == engine::Status::kOk);
  CHECK(string_messages.size() == 3);
  CHECK(string_messages[0].sequence == 9);
  CHECK(string_messages[0].command.opcode == 5);
  CHECK(string_messages[0].command.text == "hello");
  CHECK(string_messages[1].sequence == 6);
  CHECK(string_messages[1].command.opcode == 6);
  CHECK(string_messages[1].command.text == "player");
  CHECK(string_messages[2].sequence == 0);
  CHECK(string_messages[2].command.opcode == 0);
  CHECK(string_messages[2].command.value_a == 7);
  CHECK(string_messages[2].command.texts.size() == 3);
  CHECK(string_messages[2].command.texts[2] == "c");

  // Malformed / truncated packets follow the original lossy readers: OOB byte
  // and varint reads return zero, and the command still dispatches.
  {
    std::vector<engine::InputMessage> empty_messages;
    CHECK(engine::decode_input_packet(std::span<const std::uint8_t>{}, key, empty_messages)
          == engine::Status::kOk);
    CHECK(empty_messages.empty());
  }
  {
    engine::ByteWriter truncated;
    truncated.write_varint32(12); // sequence only, no opcode
    std::vector<std::uint8_t> bytes = truncated.bytes();
    engine::apply_packet_xor(bytes, key);
    std::vector<engine::InputMessage> decoded;
    CHECK(engine::decode_input_packet(bytes, key, decoded) == engine::Status::kOk);
    CHECK(decoded.size() == 1);
    CHECK(decoded[0].sequence == 12);
    CHECK(decoded[0].command.opcode == 0);
    CHECK(decoded[0].command.texts.size() == 3);
  }
  {
    engine::ByteWriter truncated;
    truncated.write_varint32(13);
    truncated.write_varint32(12);
    truncated.write_varint32(5); // buttons only; both floats are missing
    std::vector<std::uint8_t> bytes = truncated.bytes();
    engine::apply_packet_xor(bytes, key);
    std::vector<engine::InputMessage> decoded;
    CHECK(engine::decode_input_packet(bytes, key, decoded) == engine::Status::kOk);
    CHECK(decoded.size() == 1);
    CHECK(decoded[0].command.opcode == 12);
    CHECK(decoded[0].command.buttons == 5);
    CHECK(decoded[0].command.angle == 0.0F);
    CHECK(decoded[0].command.strength == 0.0F);
  }
  {
    engine::ByteWriter truncated;
    truncated.write_varint32(14);
    truncated.write_varint32(8);
    truncated.write_u8(9); // slot only; the petal byte is missing
    std::vector<std::uint8_t> bytes = truncated.bytes();
    engine::apply_packet_xor(bytes, key);
    std::vector<engine::InputMessage> decoded;
    CHECK(engine::decode_input_packet(bytes, key, decoded) == engine::Status::kOk);
    CHECK(decoded.size() == 1);
    CHECK(decoded[0].command.slot_a == 9);
    CHECK(decoded[0].command.value_a == 0);
  }
  {
    engine::ByteWriter overflow;
    overflow.write_varint32(15);
    overflow.write_varint32(1); // reserved opcode keeps the rest opaque
    overflow.write_u8(0xAA);
    overflow.write_u8(0xBB);
    std::vector<std::uint8_t> bytes = overflow.bytes();
    engine::apply_packet_xor(bytes, key);
    std::vector<engine::InputMessage> decoded;
    CHECK(engine::decode_input_packet(bytes, key, decoded) == engine::Status::kOk);
    CHECK(decoded.size() == 1);
    CHECK(decoded[0].command.opcode == 1);
    CHECK(decoded[0].command.payload.size() == 2);
  }
}

void test_snapshot_writer() {
  engine::SnapshotWriter writer(9);
  const engine::EntityHandle handle = engine::EntityHandle::from_parts(3, 5);
  const engine::EntityHandle deleted = engine::EntityHandle::from_parts(2, 4);
  writer.write_delete(deleted);
  writer.write_entity(handle, engine::EntityKind::kPlayer,
    engine::Vec2(engine::f32(1.5F), engine::f32(-2.5F)), engine::f32(0.25F), engine::f32(100.0F),
    engine::f32(250.0F), 3U);
  const engine::EntityHandle event_entity = engine::EntityHandle::from_parts(9, 1);
  engine::ByteWriter event_writer;
  event_writer.write_u32_le(event_entity.to_wire());
  event_writer.write_u8(7);
  writer.write_event(14, event_writer.bytes());
  engine::ByteWriter time_writer;
  time_writer.write_u32_le(event_entity.to_wire());
  writer.write_event(11, time_writer.bytes());
  const auto bytes = writer.finish();
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 9);
  CHECK(reader.read_varint32().value() == 0); // reliable ack
  CHECK(reader.read_varint32().value() == 1); // deletes
  CHECK(reader.read_varint32().value() == 1); // updates
  CHECK(reader.read_varint32().value() == 2); // events
  CHECK(reader.read_u32_le().value() == deleted.to_wire());
  CHECK(reader.read_u32_le().value() == handle.to_wire());
  CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(engine::EntityKind::kPlayer));
  CHECK(std::fabs(reader.read_f32_le().value() - 1.5F) < 1e-6F);
  CHECK(std::fabs(reader.read_f32_le().value() + 2.5F) < 1e-6F);
  CHECK(reader.read_f32_le().value() == 0.25F);
  CHECK(reader.read_f32_le().value() == 100.0F);
  CHECK(reader.read_f32_le().value() == 250.0F);
  CHECK(reader.read_u8().value() == 3);
  CHECK(reader.read_u8().value() == 14);
  CHECK(reader.read_u32_le().value() == event_entity.to_wire());
  CHECK(reader.read_u8().value() == 7);
  CHECK(reader.read_u8().value() == 11);
  CHECK(reader.read_u32_le().value() == event_entity.to_wire());
  CHECK(reader.eof());

  engine::World world;
  world.initialize();
  const engine::EntityHandle spawned = engine::spawn_entity(world, engine::EntityKind::kMob, 1,
    engine::Vec2(engine::f32(7.0F), engine::f32(8.0F)), engine::f32(14.0F));
  CHECK(spawned.valid());
  engine::SnapshotWriter world_writer(11);
  world_writer.write_world(world);
  const auto world_bytes = world_writer.finish();
  engine::ByteReader world_reader(world_bytes);
  CHECK(world_reader.read_u8().value() == 1);
  CHECK(world_reader.read_varint32().value() == 11);
  CHECK(world_reader.read_varint32().value() == 0); // reliable ack
  CHECK(world_reader.read_varint32().value() == 0); // deletes
  CHECK(world_reader.read_varint32().value() == 1); // updates
  CHECK(world_reader.read_varint32().value() == 0); // events
  CHECK(world_reader.read_u32_le().value() == spawned.to_wire());
  CHECK(world_reader.read_u8().value() == static_cast<std::uint8_t>(engine::EntityKind::kMob));
  CHECK(world_reader.read_f32_le().value() == 7.0F);
  CHECK(world_reader.read_f32_le().value() == 8.0F);
  CHECK(world_reader.read_f32_le().value() == 0.0F);
  CHECK(world_reader.read_f32_le().value() == 1.0F);
}

void test_original_client_component_mask() {
  engine::OriginalClientSnapshotWriter writer;
  writer.begin(3, 0);
  const engine::EntityHandle handle = engine::EntityHandle::from_parts(7, 2);
  const std::uint32_t native_mask = engine::OriginalClientSnapshotWriter::kDefaultComponentMask
    | (1U << 29); // component 30
  writer.write_entity(handle, 4, static_cast<std::uint8_t>(engine::EntityKind::kMob), 0,
                      1.0F, 2.0F, 0.5F, 25.0F, 25.0F, 30.0F, true, native_mask);
  const auto bytes = engine::OriginalClientSnapshotWriter::decrypt(writer.finish());
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1U);
  CHECK(reader.read_varint32().value() == 3U);
  CHECK(reader.read_varint32().value() == 0U);
  CHECK(reader.read_varint32().value() > 0U); // block length
  CHECK(reader.read_varint32().value() == 0U); // removal count
  CHECK(reader.read_u16_le().value() == 0U);  // first pad
  CHECK(reader.read_u16_le().value() == 0U);  // second pad
  CHECK(reader.read_u32_le().value() == handle.to_wire());
  CHECK(reader.read_u8().value() == (1U ^ 54U));
  CHECK(reader.read_u32_le().value() == native_mask);
}

void test_snapshot_header() {
  const auto bytes = engine::empty_snapshot(9, 3);
  CHECK(bytes.size() == 6);
  CHECK(bytes[0] == 1);
  engine::ByteReader reader(bytes);
  const auto header = engine::read_snapshot_header(reader);
  CHECK(header.has_value());
  CHECK(header->sequence == 9);
  CHECK(header->reliable_ack == 3);
  CHECK(reader.read_varint32().value() == 0);
  CHECK(reader.read_varint32().value() == 0);
  CHECK(reader.read_varint32().value() == 0);
  CHECK(reader.eof());

  engine::SnapshotPacketBuilder builder;
  builder.begin(12, 4);
  const engine::EntityHandle handle = engine::EntityHandle::from_parts(7, 3);
  builder.add_delete(handle);
  const std::array<std::uint8_t, 2> event_payload{0xAA, 0xBB};
  builder.add_event(14, event_payload);
  const auto built = builder.finish();
  engine::ByteReader built_reader(built);
  CHECK(built_reader.read_u8().value() == 1);
  CHECK(built_reader.read_varint32().value() == 12);
  CHECK(built_reader.read_varint32().value() == 4);
  CHECK(built_reader.read_varint32().value() == 1);
  CHECK(built_reader.read_varint32().value() == 0);
  CHECK(built_reader.read_varint32().value() == 1);
  CHECK(built_reader.read_u32_le().value() == handle.to_wire());
  CHECK(built_reader.read_u8().value() == 14);
  CHECK(built_reader.read_u8().value() == 0xAA);
  CHECK(built_reader.read_u8().value() == 0xBB);
  CHECK(built_reader.eof());
}

void test_original_snapshot_writer() {
  engine::OriginalSnapshotWriter writer;
  writer.begin(12, 4);
  const engine::EntityHandle handle = engine::EntityHandle::from_parts(3, 5);
  writer.write_bare_entity(handle);
  const auto bytes = writer.finish();
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 12);
  CHECK(reader.read_varint32().value() == 4);
  CHECK(reader.read_varint32().value() == 0); // deletes
  CHECK(reader.read_varint32().value() == 1); // updates
  CHECK(reader.read_varint32().value() == 0); // events
  CHECK(reader.read_u32_le().value() == handle.to_wire());
  CHECK(reader.read_u8().value() == 52); // flags=2 XOR 54
  CHECK(reader.read_u8().value() == 0); // sparse field terminator
  CHECK(reader.eof());

  engine::OriginalSnapshotWriter mask_writer;
  mask_writer.begin(13, 4);
  mask_writer.write_mask_entity(handle, 5);
  const auto mask_bytes = mask_writer.finish();
  engine::ByteReader mask_reader(mask_bytes);
  CHECK(mask_reader.read_u8().value() == 1);
  CHECK(mask_reader.read_varint32().value() == 13);
  CHECK(mask_reader.read_varint32().value() == 4);
  CHECK(mask_reader.read_varint32().value() == 0);
  CHECK(mask_reader.read_varint32().value() == 1);
  CHECK(mask_reader.read_varint32().value() == 0);
  CHECK(mask_reader.read_u32_le().value() == handle.to_wire());
  CHECK(mask_reader.read_u8().value() == 55); // flags=1 XOR 54
  CHECK(mask_reader.read_u32_le().value() == 5);
  CHECK(mask_reader.read_u8().value() == 0);
  CHECK(mask_reader.eof());

  engine::OriginalSnapshotWriter field_writer;
  field_writer.begin(14, 4);
  field_writer.write_mask_byte_field(handle, 5, 1, 0x7A);
  const auto field_bytes = field_writer.finish();
  engine::ByteReader field_reader(field_bytes);
  CHECK(field_reader.read_u8().value() == 1);
  CHECK(field_reader.read_varint32().value() == 14);
  CHECK(field_reader.read_varint32().value() == 4);
  CHECK(field_reader.read_varint32().value() == 0);
  CHECK(field_reader.read_varint32().value() == 1);
  CHECK(field_reader.read_varint32().value() == 0);
  CHECK(field_reader.read_u32_le().value() == handle.to_wire());
  CHECK(field_reader.read_u8().value() == 55);
  CHECK(field_reader.read_u32_le().value() == 5);
  CHECK(field_reader.read_varint32().value() == 1);
  CHECK(field_reader.read_u8().value() == 0x7A);
  CHECK(field_reader.read_u8().value() == 0);
  CHECK(field_reader.eof());

  engine::OriginalSnapshotWriter float_writer;
  float_writer.begin(15, 4);
  float_writer.write_mask_float_field5(handle, 5, 1.5F);
  const auto float_bytes = float_writer.finish();
  engine::ByteReader float_reader(float_bytes);
  CHECK(float_reader.read_u8().value() == 1);
  CHECK(float_reader.read_varint32().value() == 15);
  CHECK(float_reader.read_varint32().value() == 4);
  CHECK(float_reader.read_varint32().value() == 0);
  CHECK(float_reader.read_varint32().value() == 1);
  CHECK(float_reader.read_varint32().value() == 0);
  CHECK(float_reader.read_u32_le().value() == handle.to_wire());
  CHECK(float_reader.read_u8().value() == 55);
  CHECK(float_reader.read_u32_le().value() == 5);
  CHECK(float_reader.read_varint32().value() == 5);
  CHECK(float_reader.read_f32_le().value() == 1.5F);
  CHECK(float_reader.read_u8().value() == 0);
  CHECK(float_reader.eof());

  engine::OriginalSnapshotWriter generic_writer;
  generic_writer.begin(16, 4);
  generic_writer.write_mask_float_field(handle, 5, 7, 2.5F);
  const auto generic_bytes = generic_writer.finish();
  engine::ByteReader generic_reader(generic_bytes);
  CHECK(generic_reader.read_u8().value() == 1);
  CHECK(generic_reader.read_varint32().value() == 16);
  CHECK(generic_reader.read_varint32().value() == 4);
  CHECK(generic_reader.read_varint32().value() == 0);
  CHECK(generic_reader.read_varint32().value() == 1);
  CHECK(generic_reader.read_varint32().value() == 0);
  CHECK(generic_reader.read_u32_le().value() == handle.to_wire());
  CHECK(generic_reader.read_u8().value() == 55);
  CHECK(generic_reader.read_u32_le().value() == 5);
  CHECK(generic_reader.read_varint32().value() == 7);
  CHECK(generic_reader.read_f32_le().value() == 2.5F);
  CHECK(generic_reader.read_u8().value() == 0);
  CHECK(generic_reader.eof());

  engine::OriginalSnapshotWriter double_writer;
  double_writer.begin(17, 4);
  double_writer.write_mask_double_field35(handle, 5, 2.25);
  const auto double_bytes = double_writer.finish();
  engine::ByteReader double_reader(double_bytes);
  CHECK(double_reader.read_u8().value() == 1);
  CHECK(double_reader.read_varint32().value() == 17);
  CHECK(double_reader.read_varint32().value() == 4);
  CHECK(double_reader.read_varint32().value() == 0);
  CHECK(double_reader.read_varint32().value() == 1);
  CHECK(double_reader.read_varint32().value() == 0);
  CHECK(double_reader.read_u32_le().value() == handle.to_wire());
  CHECK(double_reader.read_u8().value() == 55);
  CHECK(double_reader.read_u32_le().value() == 5);
  CHECK(double_reader.read_varint32().value() == 35);
  CHECK(double_reader.read_f64_le().value() == 2.25);
  CHECK(double_reader.read_u8().value() == 0);
  CHECK(double_reader.eof());

  engine::OriginalSnapshotWriter field18_writer;
  field18_writer.begin(18, 4);
  field18_writer.write_mask_double_field18(handle, 5, 3.25);
  const auto field18_bytes = field18_writer.finish();
  engine::ByteReader field18_reader(field18_bytes);
  CHECK(field18_reader.read_u8().value() == 1);
  CHECK(field18_reader.read_varint32().value() == 18);
  CHECK(field18_reader.read_varint32().value() == 4);
  CHECK(field18_reader.read_varint32().value() == 0);
  CHECK(field18_reader.read_varint32().value() == 1);
  CHECK(field18_reader.read_varint32().value() == 0);
  CHECK(field18_reader.read_u32_le().value() == handle.to_wire());
  CHECK(field18_reader.read_u8().value() == 55);
  CHECK(field18_reader.read_u32_le().value() == 5);
  CHECK(field18_reader.read_varint32().value() == 18);
  CHECK(field18_reader.read_f64_le().value() == 3.25);
  CHECK(field18_reader.read_u8().value() == 0);
  CHECK(field18_reader.eof());

  engine::OriginalSnapshotWriter field27_writer;
  field27_writer.begin(19, 4);
  field27_writer.write_mask_float_field27(handle, 5, 5.5F);
  const auto field27_bytes = field27_writer.finish();
  engine::ByteReader field27_reader(field27_bytes);
  CHECK(field27_reader.read_u8().value() == 1);
  CHECK(field27_reader.read_varint32().value() == 19);
  CHECK(field27_reader.read_varint32().value() == 4);
  CHECK(field27_reader.read_varint32().value() == 0);
  CHECK(field27_reader.read_varint32().value() == 1);
  CHECK(field27_reader.read_varint32().value() == 0);
  CHECK(field27_reader.read_u32_le().value() == handle.to_wire());
  CHECK(field27_reader.read_u8().value() == 55);
  CHECK(field27_reader.read_u32_le().value() == 5);
  CHECK(field27_reader.read_varint32().value() == 27);
  CHECK(field27_reader.read_f32_le().value() == 5.5F);
  CHECK(field27_reader.read_u8().value() == 0);
  CHECK(field27_reader.eof());

  engine::OriginalSnapshotWriter string_writer;
  string_writer.begin(20, 4);
  string_writer.write_mask_string_field4(handle, 5, "hi");
  const auto string_bytes = string_writer.finish();
  engine::ByteReader string_reader(string_bytes);
  CHECK(string_reader.read_u8().value() == 1);
  CHECK(string_reader.read_varint32().value() == 20);
  CHECK(string_reader.read_varint32().value() == 4);
  CHECK(string_reader.read_varint32().value() == 0);
  CHECK(string_reader.read_varint32().value() == 1);
  CHECK(string_reader.read_varint32().value() == 0);
  CHECK(string_reader.read_u32_le().value() == handle.to_wire());
  CHECK(string_reader.read_u8().value() == 55);
  CHECK(string_reader.read_u32_le().value() == 5);
  CHECK(string_reader.read_varint32().value() == 4);
  CHECK(string_reader.read_u8().value() == 'h');
  CHECK(string_reader.read_u8().value() == 'i');
  CHECK(string_reader.read_u8().value() == 0);
  CHECK(string_reader.read_u8().value() == 0);
  CHECK(string_reader.eof());

  engine::OriginalSnapshotWriter byte2_writer;
  byte2_writer.begin(21, 4);
  byte2_writer.write_mask_byte_field(handle, 5, 2, 0xAB);
  const auto byte2_bytes = byte2_writer.finish();
  engine::ByteReader byte2_reader(byte2_bytes);
  CHECK(byte2_reader.read_u8().value() == 1);
  CHECK(byte2_reader.read_varint32().value() == 21);
  CHECK(byte2_reader.read_varint32().value() == 4);
  CHECK(byte2_reader.read_varint32().value() == 0);
  CHECK(byte2_reader.read_varint32().value() == 1);
  CHECK(byte2_reader.read_varint32().value() == 0);
  CHECK(byte2_reader.read_u32_le().value() == handle.to_wire());
  CHECK(byte2_reader.read_u8().value() == 55);
  CHECK(byte2_reader.read_u32_le().value() == 5);
  CHECK(byte2_reader.read_varint32().value() == 2);
  CHECK(byte2_reader.read_u8().value() == 0xAB);
  CHECK(byte2_reader.read_u8().value() == 0);
  CHECK(byte2_reader.eof());

  engine::OriginalSnapshotWriter array_writer;
  array_writer.begin(22, 4);
  array_writer.write_mask_byte_array_field60(handle, 5, 2, 0xCD);
  const auto array_bytes = array_writer.finish();
  engine::ByteReader array_reader(array_bytes);
  CHECK(array_reader.read_u8().value() == 1);
  CHECK(array_reader.read_varint32().value() == 22);
  CHECK(array_reader.read_varint32().value() == 4);
  CHECK(array_reader.read_varint32().value() == 0);
  CHECK(array_reader.read_varint32().value() == 1);
  CHECK(array_reader.read_varint32().value() == 0);
  CHECK(array_reader.read_u32_le().value() == handle.to_wire());
  CHECK(array_reader.read_u8().value() == 55);
  CHECK(array_reader.read_u32_le().value() == 5);
  CHECK(array_reader.read_varint32().value() == 60);
  CHECK(array_reader.read_varint32().value() == 3);
  CHECK(array_reader.read_u8().value() == 0xCD);
  CHECK(array_reader.read_u8().value() == 0); // array terminator
  CHECK(array_reader.read_u8().value() == 0); // field terminator
  CHECK(array_reader.eof());

  engine::OriginalSnapshotWriter varint_array_writer;
  varint_array_writer.begin(23, 4);
  varint_array_writer.write_mask_varint_array_field(handle, 5, 39, 1, 200);
  const auto varint_array_bytes = varint_array_writer.finish();
  engine::ByteReader varint_array_reader(varint_array_bytes);
  CHECK(varint_array_reader.read_u8().value() == 1);
  CHECK(varint_array_reader.read_varint32().value() == 23);
  CHECK(varint_array_reader.read_varint32().value() == 4);
  CHECK(varint_array_reader.read_varint32().value() == 0);
  CHECK(varint_array_reader.read_varint32().value() == 1);
  CHECK(varint_array_reader.read_varint32().value() == 0);
  CHECK(varint_array_reader.read_u32_le().value() == handle.to_wire());
  CHECK(varint_array_reader.read_u8().value() == 55);
  CHECK(varint_array_reader.read_u32_le().value() == 5);
  CHECK(varint_array_reader.read_varint32().value() == 39);
  CHECK(varint_array_reader.read_varint32().value() == 2);
  CHECK(varint_array_reader.read_varint32().value() == 200);
  CHECK(varint_array_reader.read_u8().value() == 0);
  CHECK(varint_array_reader.read_u8().value() == 0);
  CHECK(varint_array_reader.eof());

  engine::OriginalSnapshotWriter short_array_writer;
  short_array_writer.begin(24, 4);
  short_array_writer.write_mask_short_array_field(handle, 5, 61, 0, 0xBEEF);
  const auto short_array_bytes = short_array_writer.finish();
  engine::ByteReader short_array_reader(short_array_bytes);
  CHECK(short_array_reader.read_u8().value() == 1);
  CHECK(short_array_reader.read_varint32().value() == 24);
  CHECK(short_array_reader.read_varint32().value() == 4);
  CHECK(short_array_reader.read_varint32().value() == 0);
  CHECK(short_array_reader.read_varint32().value() == 1);
  CHECK(short_array_reader.read_varint32().value() == 0);
  CHECK(short_array_reader.read_u32_le().value() == handle.to_wire());
  CHECK(short_array_reader.read_u8().value() == 55);
  CHECK(short_array_reader.read_u32_le().value() == 5);
  CHECK(short_array_reader.read_varint32().value() == 61);
  CHECK(short_array_reader.read_varint32().value() == 1);
  CHECK(short_array_reader.read_varint32().value() == 0xBEEF);
  CHECK(short_array_reader.read_u8().value() == 0);
  CHECK(short_array_reader.read_u8().value() == 0);
  CHECK(short_array_reader.eof());

  engine::OriginalSnapshotWriter multi_writer;
  multi_writer.begin(26, 4);
  const std::array<engine::OriginalSnapshotWriter::FloatField, 2> multi_fields{{
    {5, 1.5F}, {7, 2.5F},
  }};
  multi_writer.write_mask_float_fields(handle, 5, multi_fields);
  const auto multi_bytes = multi_writer.finish();
  engine::ByteReader multi_reader(multi_bytes);
  CHECK(multi_reader.read_u8().value() == 1);
  CHECK(multi_reader.read_varint32().value() == 26);
  CHECK(multi_reader.read_varint32().value() == 4);
  CHECK(multi_reader.read_varint32().value() == 0);
  CHECK(multi_reader.read_varint32().value() == 1);
  CHECK(multi_reader.read_varint32().value() == 0);
  CHECK(multi_reader.read_u32_le().value() == handle.to_wire());
  CHECK(multi_reader.read_u8().value() == 55);
  CHECK(multi_reader.read_u32_le().value() == 5);
  CHECK(multi_reader.read_varint32().value() == 5);
  CHECK(multi_reader.read_f32_le().value() == 1.5F);
  CHECK(multi_reader.read_varint32().value() == 2);
  CHECK(multi_reader.read_f32_le().value() == 2.5F);
  CHECK(multi_reader.read_u8().value() == 0);
  CHECK(multi_reader.eof());

  engine::OriginalSnapshotWriter varint_writer;
  varint_writer.begin(27, 4);
  varint_writer.write_mask_varint_field(handle, 5, 30, 300);
  const auto varint_bytes = varint_writer.finish();
  engine::ByteReader varint_reader(varint_bytes);
  CHECK(varint_reader.read_u8().value() == 1);
  CHECK(varint_reader.read_varint32().value() == 27);
  CHECK(varint_reader.read_varint32().value() == 4);
  CHECK(varint_reader.read_varint32().value() == 0);
  CHECK(varint_reader.read_varint32().value() == 1);
  CHECK(varint_reader.read_varint32().value() == 0);
  CHECK(varint_reader.read_u32_le().value() == handle.to_wire());
  CHECK(varint_reader.read_u8().value() == 55);
  CHECK(varint_reader.read_u32_le().value() == 5);
  CHECK(varint_reader.read_varint32().value() == 30);
  CHECK(varint_reader.read_varint32().value() == 300);
  CHECK(varint_reader.read_u8().value() == 0);
  CHECK(varint_reader.eof());

  engine::OriginalSnapshotWriter reference_writer;
  reference_writer.begin(28, 4);
  reference_writer.write_mask_reference_field(handle, 5, 23, 0x11223344);
  const auto reference_bytes = reference_writer.finish();
  engine::ByteReader reference_reader(reference_bytes);
  CHECK(reference_reader.read_u8().value() == 1);
  CHECK(reference_reader.read_varint32().value() == 28);
  CHECK(reference_reader.read_varint32().value() == 4);
  CHECK(reference_reader.read_varint32().value() == 0);
  CHECK(reference_reader.read_varint32().value() == 1);
  CHECK(reference_reader.read_varint32().value() == 0);
  CHECK(reference_reader.read_u32_le().value() == handle.to_wire());
  CHECK(reference_reader.read_u8().value() == 55);
  CHECK(reference_reader.read_u32_le().value() == 5);
  CHECK(reference_reader.read_varint32().value() == 23);
  CHECK(reference_reader.read_u32_le().value() == 0x11223344);
  CHECK(reference_reader.read_u8().value() == 0);
  CHECK(reference_reader.eof());

  engine::OriginalSnapshotWriter string48_writer;
  string48_writer.begin(29, 4);
  string48_writer.write_mask_string_field(handle, 5, 48, "abc");
  const auto string48_bytes = string48_writer.finish();
  engine::ByteReader string48_reader(string48_bytes);
  CHECK(string48_reader.read_u8().value() == 1);
  CHECK(string48_reader.read_varint32().value() == 29);
  CHECK(string48_reader.read_varint32().value() == 4);
  CHECK(string48_reader.read_varint32().value() == 0);
  CHECK(string48_reader.read_varint32().value() == 1);
  CHECK(string48_reader.read_varint32().value() == 0);
  CHECK(string48_reader.read_u32_le().value() == handle.to_wire());
  CHECK(string48_reader.read_u8().value() == 55);
  CHECK(string48_reader.read_u32_le().value() == 5);
  CHECK(string48_reader.read_varint32().value() == 48);
  CHECK(string48_reader.read_u8().value() == 'a');
  CHECK(string48_reader.read_u8().value() == 'b');
  CHECK(string48_reader.read_u8().value() == 'c');
  CHECK(string48_reader.read_u8().value() == 0);
  CHECK(string48_reader.read_u8().value() == 0);
  CHECK(string48_reader.eof());

  engine::OriginalSnapshotWriter string_array_writer;
  string_array_writer.begin(30, 4);
  string_array_writer.write_mask_string_array_field(handle, 5, 25, 1, "xy");
  const auto string_array_bytes = string_array_writer.finish();
  engine::ByteReader string_array_reader(string_array_bytes);
  CHECK(string_array_reader.read_u8().value() == 1);
  CHECK(string_array_reader.read_varint32().value() == 30);
  CHECK(string_array_reader.read_varint32().value() == 4);
  CHECK(string_array_reader.read_varint32().value() == 0);
  CHECK(string_array_reader.read_varint32().value() == 1);
  CHECK(string_array_reader.read_varint32().value() == 0);
  CHECK(string_array_reader.read_u32_le().value() == handle.to_wire());
  CHECK(string_array_reader.read_u8().value() == 55);
  CHECK(string_array_reader.read_u32_le().value() == 5);
  CHECK(string_array_reader.read_varint32().value() == 25);
  CHECK(string_array_reader.read_varint32().value() == 2);
  CHECK(string_array_reader.read_u8().value() == 'x');
  CHECK(string_array_reader.read_u8().value() == 'y');
  CHECK(string_array_reader.read_u8().value() == 0);
  CHECK(string_array_reader.read_u8().value() == 0);
  CHECK(string_array_reader.read_u8().value() == 0);
  CHECK(string_array_reader.eof());

  engine::OriginalSnapshotWriter float45_writer;
  float45_writer.begin(31, 4);
  float45_writer.write_mask_float_field45(handle, 5, 6.5F);
  const auto float45_bytes = float45_writer.finish();
  engine::ByteReader float45_reader(float45_bytes);
  CHECK(float45_reader.read_u8().value() == 1);
  CHECK(float45_reader.read_varint32().value() == 31);
  CHECK(float45_reader.read_varint32().value() == 4);
  CHECK(float45_reader.read_varint32().value() == 0);
  CHECK(float45_reader.read_varint32().value() == 1);
  CHECK(float45_reader.read_varint32().value() == 0);
  CHECK(float45_reader.read_u32_le().value() == handle.to_wire());
  CHECK(float45_reader.read_u8().value() == 55);
  CHECK(float45_reader.read_u32_le().value() == 5);
  CHECK(float45_reader.read_varint32().value() == 45);
  CHECK(float45_reader.read_f32_le().value() == 6.5F);
  CHECK(float45_reader.read_u8().value() == 0);
  CHECK(float45_reader.eof());

  engine::OriginalSnapshotWriter sparse_writer;
  sparse_writer.begin(32, 4);
  const std::array<std::uint32_t, 2> ordinals{{1, 3}};
  sparse_writer.write_sparse_entity(handle, ordinals);
  const auto sparse_bytes = sparse_writer.finish();
  engine::ByteReader sparse_reader(sparse_bytes);
  CHECK(sparse_reader.read_u8().value() == 1);
  CHECK(sparse_reader.read_varint32().value() == 32);
  CHECK(sparse_reader.read_varint32().value() == 4);
  CHECK(sparse_reader.read_varint32().value() == 0);
  CHECK(sparse_reader.read_varint32().value() == 1);
  CHECK(sparse_reader.read_varint32().value() == 0);
  CHECK(sparse_reader.read_u32_le().value() == handle.to_wire());
  CHECK(sparse_reader.read_u8().value() == 54);
  CHECK(sparse_reader.read_varint32().value() == 0); // ordinal 1
  CHECK(sparse_reader.read_varint32().value() == 3); // delta 2
  CHECK(sparse_reader.read_varint32().value() == 1); // terminator
  CHECK(sparse_reader.read_u8().value() == 0);
  CHECK(sparse_reader.eof());

  engine::OriginalSnapshotWriter bit_writer;
  bit_writer.begin(33, 4);
  bit_writer.write_mask_bit_field(handle, 5, 33, true);
  const auto bit_bytes = bit_writer.finish();
  engine::ByteReader bit_reader(bit_bytes);
  CHECK(bit_reader.read_u8().value() == 1);
  CHECK(bit_reader.read_varint32().value() == 33);
  CHECK(bit_reader.read_varint32().value() == 4);
  CHECK(bit_reader.read_varint32().value() == 0);
  CHECK(bit_reader.read_varint32().value() == 1);
  CHECK(bit_reader.read_varint32().value() == 0);
  CHECK(bit_reader.read_u32_le().value() == handle.to_wire());
  CHECK(bit_reader.read_u8().value() == 55);
  CHECK(bit_reader.read_u32_le().value() == 5);
  CHECK(bit_reader.read_varint32().value() == 33);
  CHECK(bit_reader.read_u8().value() == 1);
  CHECK(bit_reader.read_u8().value() == 0);
  CHECK(bit_reader.eof());

  engine::OriginalSnapshotWriter bits_writer;
  bits_writer.begin(38, 4);
  const std::array<engine::OriginalSnapshotWriter::BitField, 2> bit_fields{{
    {33, true}, {40, false},
  }};
  bits_writer.write_mask_bit_fields(handle, 5, bit_fields);
  const auto bits_bytes = bits_writer.finish();
  engine::ByteReader bits_reader(bits_bytes);
  CHECK(bits_reader.read_u8().value() == 1);
  CHECK(bits_reader.read_varint32().value() == 38);
  CHECK(bits_reader.read_varint32().value() == 4);
  CHECK(bits_reader.read_varint32().value() == 0);
  CHECK(bits_reader.read_varint32().value() == 1);
  CHECK(bits_reader.read_varint32().value() == 0);
  CHECK(bits_reader.read_u32_le().value() == handle.to_wire());
  CHECK(bits_reader.read_u8().value() == 55);
  CHECK(bits_reader.read_u32_le().value() == 5);
  CHECK(bits_reader.read_varint32().value() == 33);
  CHECK(bits_reader.read_u8().value() == 1);
  CHECK(bits_reader.read_varint32().value() == 7);
  CHECK(bits_reader.read_u8().value() == 0);
  CHECK(bits_reader.read_u8().value() == 0);
  CHECK(bits_reader.eof());

  engine::OriginalSnapshotWriter angle_writer;
  angle_writer.begin(34, 4);
  angle_writer.write_mask_angle_field8(handle, 5, 0x8000);
  const auto angle_bytes = angle_writer.finish();
  engine::ByteReader angle_reader(angle_bytes);
  CHECK(angle_reader.read_u8().value() == 1);
  CHECK(angle_reader.read_varint32().value() == 34);
  CHECK(angle_reader.read_varint32().value() == 4);
  CHECK(angle_reader.read_varint32().value() == 0);
  CHECK(angle_reader.read_varint32().value() == 1);
  CHECK(angle_reader.read_varint32().value() == 0);
  CHECK(angle_reader.read_u32_le().value() == handle.to_wire());
  CHECK(angle_reader.read_u8().value() == 55);
  CHECK(angle_reader.read_u32_le().value() == 5);
  CHECK(angle_reader.read_varint32().value() == 8);
  CHECK(angle_reader.read_u16_le().value() == 0x8000);
  CHECK(angle_reader.read_u8().value() == 0);
  CHECK(angle_reader.eof());

  engine::OriginalSnapshotWriter handle_array_writer;
  handle_array_writer.begin(35, 4);
  handle_array_writer.write_mask_handle_array_field3(handle, 5, 0, 0xCAFEBABE);
  const auto handle_array_bytes = handle_array_writer.finish();
  engine::ByteReader handle_array_reader(handle_array_bytes);
  CHECK(handle_array_reader.read_u8().value() == 1);
  CHECK(handle_array_reader.read_varint32().value() == 35);
  CHECK(handle_array_reader.read_varint32().value() == 4);
  CHECK(handle_array_reader.read_varint32().value() == 0);
  CHECK(handle_array_reader.read_varint32().value() == 1);
  CHECK(handle_array_reader.read_varint32().value() == 0);
  CHECK(handle_array_reader.read_u32_le().value() == handle.to_wire());
  CHECK(handle_array_reader.read_u8().value() == 55);
  CHECK(handle_array_reader.read_u32_le().value() == 5);
  CHECK(handle_array_reader.read_varint32().value() == 3);
  CHECK(handle_array_reader.read_varint32().value() == 1);
  CHECK(handle_array_reader.read_u32_le().value() == 0xCAFEBABE);
  CHECK(handle_array_reader.read_u8().value() == 0);
  CHECK(handle_array_reader.read_u8().value() == 0);
  CHECK(handle_array_reader.eof());

  engine::OriginalSnapshotWriter event_writer;
  event_writer.begin(37, 4);
  event_writer.write_chat_event("hi");
  event_writer.write_entity_time_event(handle);
  event_writer.write_visual_event(handle, 2);
  const auto event_bytes = event_writer.finish();
  engine::ByteReader event_reader(event_bytes);
  CHECK(event_reader.read_u8().value() == 1);
  CHECK(event_reader.read_varint32().value() == 37);
  CHECK(event_reader.read_varint32().value() == 4);
  CHECK(event_reader.read_varint32().value() == 0);
  CHECK(event_reader.read_varint32().value() == 0);
  CHECK(event_reader.read_varint32().value() == 3);
  CHECK(event_reader.read_u8().value() == 9);
  CHECK(event_reader.read_u8().value() == 'h');
  CHECK(event_reader.read_u8().value() == 'i');
  CHECK(event_reader.read_u8().value() == 0);
  CHECK(event_reader.read_u8().value() == 11);
  CHECK(event_reader.read_u32_le().value() == handle.to_wire());
  CHECK(event_reader.read_u8().value() == 14);
  CHECK(event_reader.read_u32_le().value() == handle.to_wire());
  CHECK(event_reader.read_u8().value() == 2);
  CHECK(event_reader.eof());

  engine::OriginalSnapshotWriter dense_writer;
  dense_writer.begin(41, 4);
  dense_writer.write_dense_byte_group52(handle, 0x11, 0x22);
  const auto dense_bytes = dense_writer.finish();
  engine::ByteReader dense_reader(dense_bytes);
  CHECK(dense_reader.read_u8().value() == 1);
  CHECK(dense_reader.read_varint32().value() == 41);
  CHECK(dense_reader.read_varint32().value() == 4);
  CHECK(dense_reader.read_varint32().value() == 0);
  CHECK(dense_reader.read_varint32().value() == 1);
  CHECK(dense_reader.read_varint32().value() == 0);
  CHECK(dense_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense_reader.read_u8().value() == 62);
  CHECK(dense_reader.read_u8().value() == 0x11);
  CHECK(dense_reader.read_u8().value() == 0x22);
  CHECK(dense_reader.eof());

  engine::OriginalSnapshotWriter dense56_writer;
  dense56_writer.begin(42, 4);
  const std::array<std::uint8_t, 1> dense56_values{{0x33}};
  dense56_writer.write_dense_byte_group(handle, dense56_values);
  const auto dense56_bytes = dense56_writer.finish();
  engine::ByteReader dense56_reader(dense56_bytes);
  CHECK(dense56_reader.read_u8().value() == 1);
  CHECK(dense56_reader.read_varint32().value() == 42);
  CHECK(dense56_reader.read_varint32().value() == 4);
  CHECK(dense56_reader.read_varint32().value() == 0);
  CHECK(dense56_reader.read_varint32().value() == 1);
  CHECK(dense56_reader.read_varint32().value() == 0);
  CHECK(dense56_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense56_reader.read_u8().value() == 62);
  CHECK(dense56_reader.read_u8().value() == 0x33);
  CHECK(dense56_reader.eof());

  engine::OriginalSnapshotWriter dense116_writer;
  dense116_writer.begin(43, 4);
  const std::array<float, 2> dense116_values{{1.25F, 2.5F}};
  dense116_writer.write_dense_float_group(handle, dense116_values);
  const auto dense116_bytes = dense116_writer.finish();
  engine::ByteReader dense116_reader(dense116_bytes);
  CHECK(dense116_reader.read_u8().value() == 1);
  CHECK(dense116_reader.read_varint32().value() == 43);
  CHECK(dense116_reader.read_varint32().value() == 4);
  CHECK(dense116_reader.read_varint32().value() == 0);
  CHECK(dense116_reader.read_varint32().value() == 1);
  CHECK(dense116_reader.read_varint32().value() == 0);
  CHECK(dense116_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense116_reader.read_u8().value() == 62);
  CHECK(dense116_reader.read_f32_le().value() == 1.25F);
  CHECK(dense116_reader.read_f32_le().value() == 2.5F);
  CHECK(dense116_reader.eof());

  engine::OriginalSnapshotWriter dense_string_writer;
  dense_string_writer.begin(44, 4);
  dense_string_writer.write_dense_string_group(handle, "abc");
  const auto dense_string_bytes = dense_string_writer.finish();
  engine::ByteReader dense_string_reader(dense_string_bytes);
  CHECK(dense_string_reader.read_u8().value() == 1);
  CHECK(dense_string_reader.read_varint32().value() == 44);
  CHECK(dense_string_reader.read_varint32().value() == 4);
  CHECK(dense_string_reader.read_varint32().value() == 0);
  CHECK(dense_string_reader.read_varint32().value() == 1);
  CHECK(dense_string_reader.read_varint32().value() == 0);
  CHECK(dense_string_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense_string_reader.read_u8().value() == 62);
  CHECK(dense_string_reader.read_u8().value() == 'a');
  CHECK(dense_string_reader.read_u8().value() == 'b');
  CHECK(dense_string_reader.read_u8().value() == 'c');
  CHECK(dense_string_reader.read_u8().value() == 0);
  CHECK(dense_string_reader.eof());

  engine::OriginalSnapshotWriter dense_mixed_writer;
  dense_mixed_writer.begin(45, 4);
  dense_mixed_writer.write_dense_angle_float_group(handle, 0x4000, 1.5F, 2.5F);
  const auto dense_mixed_bytes = dense_mixed_writer.finish();
  engine::ByteReader dense_mixed_reader(dense_mixed_bytes);
  CHECK(dense_mixed_reader.read_u8().value() == 1);
  CHECK(dense_mixed_reader.read_varint32().value() == 45);
  CHECK(dense_mixed_reader.read_varint32().value() == 4);
  CHECK(dense_mixed_reader.read_varint32().value() == 0);
  CHECK(dense_mixed_reader.read_varint32().value() == 1);
  CHECK(dense_mixed_reader.read_varint32().value() == 0);
  CHECK(dense_mixed_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense_mixed_reader.read_u8().value() == 62);
  CHECK(dense_mixed_reader.read_u16_le().value() == 0x4000);
  CHECK(dense_mixed_reader.read_f32_le().value() == 1.5F);
  CHECK(dense_mixed_reader.read_f32_le().value() == 2.5F);
  CHECK(dense_mixed_reader.eof());

  engine::OriginalSnapshotWriter dense152_writer;
  dense152_writer.begin(46, 4);
  dense152_writer.write_dense_group152_base(handle, 1, 2, 3, 300);
  const auto dense152_bytes = dense152_writer.finish();
  engine::ByteReader dense152_reader(dense152_bytes);
  CHECK(dense152_reader.read_u8().value() == 1);
  CHECK(dense152_reader.read_varint32().value() == 46);
  CHECK(dense152_reader.read_varint32().value() == 4);
  CHECK(dense152_reader.read_varint32().value() == 0);
  CHECK(dense152_reader.read_varint32().value() == 1);
  CHECK(dense152_reader.read_varint32().value() == 0);
  CHECK(dense152_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense152_reader.read_u8().value() == 62);
  CHECK(dense152_reader.read_u8().value() == 1);
  CHECK(dense152_reader.read_u8().value() == 2);
  CHECK(dense152_reader.read_u8().value() == 3);
  CHECK(dense152_reader.read_varint32().value() == 300);
  CHECK(dense152_reader.eof());

  engine::OriginalSnapshotWriter dense152x_writer;
  dense152x_writer.begin(47, 4);
  std::array<std::uint8_t, 16> bytes60{};
  for (std::uint8_t index = 0; index < 16; ++index) bytes60[index] = index;
  std::array<std::uint16_t, 8> shorts61{};
  for (std::uint16_t index = 0; index < 8; ++index) shorts61[index] = static_cast<std::uint16_t>(100 + index);
  dense152x_writer.write_dense_group152_extended(handle, 1, 2, 3, 300, 1.5F,
                                                  bytes60, shorts61, 7, 8);
  const auto dense152x_bytes = dense152x_writer.finish();
  engine::ByteReader dense152x_reader(dense152x_bytes);
  CHECK(dense152x_reader.read_u8().value() == 1);
  CHECK(dense152x_reader.read_varint32().value() == 47);
  CHECK(dense152x_reader.read_varint32().value() == 4);
  CHECK(dense152x_reader.read_varint32().value() == 0);
  CHECK(dense152x_reader.read_varint32().value() == 1);
  CHECK(dense152x_reader.read_varint32().value() == 0);
  CHECK(dense152x_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense152x_reader.read_u8().value() == 126);
  CHECK(dense152x_reader.read_u8().value() == 1);
  CHECK(dense152x_reader.read_u8().value() == 2);
  CHECK(dense152x_reader.read_u8().value() == 3);
  CHECK(dense152x_reader.read_varint32().value() == 300);
  CHECK(dense152x_reader.read_f32_le().value() == 1.5F);
  for (std::uint8_t index = 0; index < 16; ++index)
    CHECK(dense152x_reader.read_u8().value() == index);
  for (std::uint16_t index = 0; index < 8; ++index)
    CHECK(dense152x_reader.read_varint32().value() == 100 + index);
  CHECK(dense152x_reader.read_u8().value() == 7);
  CHECK(dense152x_reader.read_u8().value() == 8);
  CHECK(dense152x_reader.eof());

  engine::OriginalSnapshotWriter dense124_writer;
  dense124_writer.begin(48, 4);
  const std::array<bool, 2> dense124_values{{true, false}};
  dense124_writer.write_dense_bit_group(handle, dense124_values);
  const auto dense124_bytes = dense124_writer.finish();
  engine::ByteReader dense124_reader(dense124_bytes);
  CHECK(dense124_reader.read_u8().value() == 1);
  CHECK(dense124_reader.read_varint32().value() == 48);
  CHECK(dense124_reader.read_varint32().value() == 4);
  CHECK(dense124_reader.read_varint32().value() == 0);
  CHECK(dense124_reader.read_varint32().value() == 1);
  CHECK(dense124_reader.read_varint32().value() == 0);
  CHECK(dense124_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense124_reader.read_u8().value() == 62);
  CHECK(dense124_reader.read_u8().value() == 1);
  CHECK(dense124_reader.eof());

  engine::OriginalSnapshotWriter dense8_writer;
  dense8_writer.begin(49, 4);
  dense8_writer.write_dense_float_bit_group(handle, 3.5F, true);
  const auto dense8_bytes = dense8_writer.finish();
  engine::ByteReader dense8_reader(dense8_bytes);
  CHECK(dense8_reader.read_u8().value() == 1);
  CHECK(dense8_reader.read_varint32().value() == 49);
  CHECK(dense8_reader.read_varint32().value() == 4);
  CHECK(dense8_reader.read_varint32().value() == 0);
  CHECK(dense8_reader.read_varint32().value() == 1);
  CHECK(dense8_reader.read_varint32().value() == 0);
  CHECK(dense8_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense8_reader.read_u8().value() == 62);
  CHECK(dense8_reader.read_f32_le().value() == 3.5F);
  CHECK(dense8_reader.read_u8().value() == 1);
  CHECK(dense8_reader.eof());

  engine::OriginalSnapshotWriter dense_ref_writer;
  dense_ref_writer.begin(50, 4);
  dense_ref_writer.write_dense_reference_group(handle, 0x11111111, 0x22222222);
  const auto dense_ref_bytes = dense_ref_writer.finish();
  engine::ByteReader dense_ref_reader(dense_ref_bytes);
  CHECK(dense_ref_reader.read_u8().value() == 1);
  CHECK(dense_ref_reader.read_varint32().value() == 50);
  CHECK(dense_ref_reader.read_varint32().value() == 4);
  CHECK(dense_ref_reader.read_varint32().value() == 0);
  CHECK(dense_ref_reader.read_varint32().value() == 1);
  CHECK(dense_ref_reader.read_varint32().value() == 0);
  CHECK(dense_ref_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense_ref_reader.read_u8().value() == 62);
  CHECK(dense_ref_reader.read_u32_le().value() == 0x11111111);
  CHECK(dense_ref_reader.read_u32_le().value() == 0x22222222);
  CHECK(dense_ref_reader.eof());

  engine::OriginalSnapshotWriter dense72_writer;
  dense72_writer.begin(51, 4);
  std::array<std::uint8_t, 10> bytes16{};
  for (std::uint8_t index = 0; index < 10; ++index) bytes16[index] = index;
  dense72_writer.write_dense_group72(handle, 9, 1.25F, "n", bytes16, 20, 2.5F, 3.5F, 4.5F, 34, 47, 0xABCD);
  const auto dense72_bytes = dense72_writer.finish();
  engine::ByteReader dense72_reader(dense72_bytes);
  CHECK(dense72_reader.read_u8().value() == 1);
  CHECK(dense72_reader.read_varint32().value() == 51);
  CHECK(dense72_reader.read_varint32().value() == 4);
  CHECK(dense72_reader.read_varint32().value() == 0);
  CHECK(dense72_reader.read_varint32().value() == 1);
  CHECK(dense72_reader.read_varint32().value() == 0);
  CHECK(dense72_reader.read_u32_le().value() == handle.to_wire());
  CHECK(dense72_reader.read_u8().value() == 62);
  CHECK(dense72_reader.read_u8().value() == 9);
  CHECK(dense72_reader.read_f32_le().value() == 1.25F);
  CHECK(dense72_reader.read_u8().value() == 'n');
  CHECK(dense72_reader.read_u8().value() == 0);
  for (std::uint8_t index = 0; index < 10; ++index)
    CHECK(dense72_reader.read_u8().value() == index);
  CHECK(dense72_reader.read_u8().value() == 20);
  CHECK(dense72_reader.read_f32_le().value() == 2.5F);
  CHECK(dense72_reader.read_f32_le().value() == 3.5F);
  CHECK(dense72_reader.read_f32_le().value() == 4.5F);
  CHECK(dense72_reader.read_u8().value() == 34);
  CHECK(dense72_reader.read_u8().value() == 47);
  CHECK(dense72_reader.read_u32_le().value() == 0xABCD);
  CHECK(dense72_reader.eof());

  engine::OriginalSnapshotWriter denseM27_writer;
  denseM27_writer.begin(52, 4);
  denseM27_writer.write_dense_group_minus27(handle, "a", 300, 1.5, "b", 2.5F, true, 3.5, 400, 16385, 268435457);
  const auto denseM27_bytes = denseM27_writer.finish();
  engine::ByteReader denseM27_reader(denseM27_bytes);
  CHECK(denseM27_reader.read_u8().value() == 1);
  CHECK(denseM27_reader.read_varint32().value() == 52);
  CHECK(denseM27_reader.read_varint32().value() == 4);
  CHECK(denseM27_reader.read_varint32().value() == 0);
  CHECK(denseM27_reader.read_varint32().value() == 1);
  CHECK(denseM27_reader.read_varint32().value() == 0);
  CHECK(denseM27_reader.read_u32_le().value() == handle.to_wire());
  CHECK(denseM27_reader.read_u8().value() == 62);
  CHECK(denseM27_reader.read_u8().value() == 'a');
  CHECK(denseM27_reader.read_u8().value() == 0);
  CHECK(denseM27_reader.read_varint32().value() == 300);
  CHECK(denseM27_reader.read_f64_le().value() == 1.5);
  CHECK(denseM27_reader.read_u8().value() == 'b');
  CHECK(denseM27_reader.read_u8().value() == 0);
  CHECK(denseM27_reader.read_f32_le().value() == 2.5F);
  CHECK(denseM27_reader.read_u8().value() == 1);
  CHECK(denseM27_reader.read_f64_le().value() == 3.5);
  CHECK(denseM27_reader.read_varint32().value() == 400);
  CHECK(denseM27_reader.read_varint32().value() == 16385);
  CHECK(denseM27_reader.read_varint32().value() == 268435457);
  CHECK(denseM27_reader.eof());

  engine::OriginalSnapshotWriter denseM16_writer;
  denseM16_writer.begin(53, 4);
  std::array<std::uint32_t, 10> handles3{};
  for (std::uint32_t index = 0; index < 10; ++index) handles3[index] = 0x100 + index;
  const std::array<std::string_view, 10> strings10{{
    "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9",
  }};
  std::array<std::uint32_t, 10> varints39{};
  for (std::uint32_t index = 0; index < 10; ++index) varints39[index] = 400 + index;
  denseM16_writer.write_dense_group_minus16(handle, handles3, strings10, 1, 2, 1.5F, 300,
                                            varints39, 2.5F, 3.5F, 46, 500);
  const auto denseM16_bytes = denseM16_writer.finish();
  engine::ByteReader denseM16_reader(denseM16_bytes);
  CHECK(denseM16_reader.read_u8().value() == 1);
  CHECK(denseM16_reader.read_varint32().value() == 53);
  CHECK(denseM16_reader.read_varint32().value() == 4);
  CHECK(denseM16_reader.read_varint32().value() == 0);
  CHECK(denseM16_reader.read_varint32().value() == 1);
  CHECK(denseM16_reader.read_varint32().value() == 0);
  CHECK(denseM16_reader.read_u32_le().value() == handle.to_wire());
  CHECK(denseM16_reader.read_u8().value() == 62);
  for (std::uint32_t index = 0; index < 10; ++index)
    CHECK(denseM16_reader.read_u32_le().value() == 0x100 + index);
  for (std::uint32_t index = 0; index < 10; ++index) {
    CHECK(denseM16_reader.read_u8().value() == 's');
    CHECK(denseM16_reader.read_u8().value() == static_cast<std::uint8_t>('0' + index));
    CHECK(denseM16_reader.read_u8().value() == 0);
  }
  CHECK(denseM16_reader.read_u8().value() == 1);
  CHECK(denseM16_reader.read_u8().value() == 2);
  CHECK(denseM16_reader.read_f32_le().value() == 1.5F);
  CHECK(denseM16_reader.read_varint32().value() == 300);
  for (std::uint32_t index = 0; index < 10; ++index)
    CHECK(denseM16_reader.read_varint32().value() == 400 + index);
  CHECK(denseM16_reader.read_f32_le().value() == 2.5F);
  CHECK(denseM16_reader.read_f32_le().value() == 3.5F);
  CHECK(denseM16_reader.read_u8().value() == 46);
  CHECK(denseM16_reader.read_varint32().value() == 500);
  CHECK(denseM16_reader.eof());
}

void test_world_initialize() {
  engine::World world;
  world.initialize();
  CHECK(world.initialized());
  CHECK(world.entities().active_count() == 0);
  CHECK(world.entities().entities()[0].handle.raw == 1048936448U);
  CHECK(world.entities().entities()[0].handle.index() == 0);
  std::set<std::uint32_t> handles;
  for (const auto& entity : world.entities().entities()) {
    CHECK(entity.handle.index() < engine::kEntitySlotCount);
    CHECK(entity.handle.generation() != 0);
    handles.insert(entity.handle.raw);
  }
  CHECK(handles.size() == engine::kEntitySlotCount);
  engine::MinstdRng expected(0);
  for (std::uint32_t index = 0; index < engine::kEntitySlotCount; ++index) {
    std::uint32_t generation = 0;
    do { generation = expected.next_generation(); } while ((generation & 262143U) == 0U);
  }
  CHECK(world.rng().state() == expected.state());
  CHECK(world.rng().state() == 11065635568950165505ULL); // layout-probe rngState
  CHECK(world.random().state() == 285456437U); // post-constructor RNG state
  CHECK(!world.components().has(0));
  world.apply_input(3, engine::f32(7000.0F), engine::f32(-2.0F));
  CHECK(world.input().buttons == 3);
  CHECK(std::fabs(world.input().normalized_angle.value - 0.5315678F) < 1e-6F);
  CHECK(world.input().strength.value == 0.0F);
  CHECK(world.input().direction == 21U);
  CHECK(engine::pack_direction(engine::f32(0.0F)) == 0U);
  CHECK(engine::pack_direction(engine::f32(1.0F)) == 40U);
  CHECK(engine::pack_direction(engine::f32(-1.0F)) == 214U);
  CHECK(engine::pack_direction(engine::f32(3.141592653589793F)) == 127U);
}

void test_player_input_appearance() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  world.apply_input(3U, engine::f32(1.0F), engine::f32(0.0F));
  const auto player = engine::spawn_player_default(world, "appearance",
    engine::make_default_profile(), false);
  auto* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  CHECK(entity->player_look == 0U);
  CHECK(entity->player_expression == 0U);
  entity->player_expression = 0xA0U;
  for (std::uint32_t buttons : {0U, 1U, 2U, 3U, 4U, 5U, 0U, 0x10000000U}) {
    world.apply_input(buttons, engine::f32(1.0F), engine::f32(0.0F));
    CHECK(entity->player_look == 40U);
    CHECK(entity->player_expression == (0xA0U | (buttons & 3U)));
    CHECK(entity->type_id == 0U);
  }
  world.apply_input(2U, engine::f32(-1.0F), engine::f32(0.0F));
  CHECK(entity->player_look == 214U);
  CHECK(entity->player_expression == 0xA2U);
  CHECK(world.destroy(player));
  const auto respawned = engine::spawn_player_default(world, "appearance",
    engine::make_default_profile(), false);
  entity = world.entities().get(respawned);
  CHECK(entity != nullptr);
  CHECK(entity->player_look == 0U);
  CHECK(entity->player_expression == 0U);
}

void test_state_dump() {
  engine::WorkerApi api;
  api.init();
  CHECK(api.dump_state(nullptr, 0) == 0U);
  const auto spawned = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(12.5F), engine::f32(-3.25F)));
  CHECK(spawned.valid());
  CHECK(api.dump_state(nullptr, 0) == 1U);
  std::array<std::uint8_t, 48> record{};
  CHECK(api.dump_state(record.data(), 1) == 1U);
  std::uint32_t handle = 0;
  std::uint16_t type = 0;
  std::uint8_t kind = 0;
  float x = 0.0F, y = 0.0F;
  std::memcpy(&handle, record.data(), 4);
  std::memcpy(&type, record.data() + 4, 2);
  std::memcpy(&kind, record.data() + 6, 1);
  std::memcpy(&x, record.data() + 8, 4);
  std::memcpy(&y, record.data() + 12, 4);
  CHECK(handle == spawned.raw);
  CHECK(type == 4U);
  CHECK(kind == static_cast<std::uint8_t>(engine::EntityKind::kMob));
  CHECK(x == 12.5F);
  CHECK(y == -3.25F);
  // R01 diagnostic tail: velocity/acceleration are exposed for the state trace.
  float vx = 0.0F, vy = 0.0F, ax = 0.0F, ay = 0.0F;
  std::memcpy(&vx, record.data() + 32, 4);
  std::memcpy(&vy, record.data() + 36, 4);
  std::memcpy(&ax, record.data() + 40, 4);
  std::memcpy(&ay, record.data() + 44, 4);
  CHECK(vx == 0.0F && vy == 0.0F && ax == 0.0F && ay == 0.0F);
}

void test_worker_api() {
  engine::WorkerApi populated;
  populated.init(true);
  CHECK(populated.world().initialized());
  CHECK(populated.world().entities().active_count() == 866U);
  CHECK(populated.world().random().state() == 787621659U);

  engine::WorkerApi api;
  api.init();
  CHECK(api.world().initialized());
  api.think();
  CHECK(api.flush().empty());

  engine::ByteWriter writer;
  writer.write_varint32(1);
  writer.write_varint32(12);
  writer.write_varint32(5);
  writer.write_f32_le(0.0F);
  writer.write_f32_le(1.0F);
  std::vector<std::uint8_t> packet = writer.bytes();
  const std::array<std::uint8_t, 4> key{0x11, 0x22, 0x33, 0x44};
  engine::apply_packet_xor(packet, key);
  CHECK(api.send(packet, key));
  CHECK(api.world().input().buttons == 5);
  CHECK(api.world().input().strength.value == 1.0F);
  CHECK(api.world().input().direction == 0U);
  CHECK(api.last_sequence() == 1);
  CHECK(api.send(packet, key)); // duplicate sequence is ignored, not a decode failure

  for (int tick = 0; tick < 1000; ++tick) api.think();
  CHECK(api.world().initialized());
  CHECK(api.world().entities().active_count() == 0);

  const auto spawned = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(spawned.valid());
  CHECK(api.occupied(engine::Vec2(engine::f32(100.0F), engine::f32(0.0F))));
  CHECK(!api.occupied(engine::Vec2(engine::f32(2000.0F), engine::f32(0.0F))));
  CHECK(!api.spawn(engine::EntityKind::kMob, 1, engine::Vec2(engine::f32(5000.0F), engine::f32(0.0F))).valid());
  const auto bytes = api.snapshot_bytes(7);
  CHECK(bytes.size() > 2);
  CHECK(bytes[0] == 1);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 7);
  api.enqueue_snapshot(8);
  const auto packets = api.flush();
  CHECK(packets.size() == 1);
  CHECK(packets[0].payload.size() == bytes.size());

  CHECK(api.despawn(spawned));
  CHECK(!api.occupied(engine::Vec2(engine::f32(0.0F), engine::f32(0.0F))));
  const auto delete_bytes = api.snapshot_bytes(9);
  engine::ByteReader delete_reader(delete_bytes);
  CHECK(delete_reader.read_u8().value() == 1);
  CHECK(delete_reader.read_varint32().value() == 9);
  CHECK(delete_reader.read_varint32().value() == 0); // reliable ack
  CHECK(delete_reader.read_varint32().value() == 1); // deletes
  CHECK(delete_reader.read_varint32().value() == 0); // updates
  CHECK(delete_reader.read_varint32().value() == 0); // events
  CHECK(delete_reader.read_u32_le().value() == spawned.to_wire());
  CHECK(delete_reader.eof());

  const std::array<std::uint8_t, 3> chat{'h', 'i', 0};
  api.emit_event(9, chat);
  const auto event_bytes = api.snapshot_bytes(10);
  engine::ByteReader event_reader(event_bytes);
  CHECK(event_reader.read_u8().value() == 1);
  CHECK(event_reader.read_varint32().value() == 10);
  CHECK(event_reader.read_varint32().value() == 0); // ack
  CHECK(event_reader.read_varint32().value() == 0); // deletes
  CHECK(event_reader.read_varint32().value() == 0); // updates
  CHECK(event_reader.read_varint32().value() == 1); // events
  CHECK(event_reader.read_u8().value() == 9);
  CHECK(event_reader.read_u8().value() == 'h');
  CHECK(event_reader.read_u8().value() == 'i');
  CHECK(event_reader.read_u8().value() == 0);
  CHECK(event_reader.eof());

  const auto second = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(2000.0F), engine::f32(0.0F)));
  CHECK(second.valid());
  const auto original = api.original_snapshot_bytes(20, 1);
  engine::ByteReader original_reader(original);
  CHECK(original_reader.read_u8().value() == 1);
  CHECK(original_reader.read_varint32().value() == 20);
  CHECK(original_reader.read_varint32().value() == 1);
  CHECK(original_reader.read_varint32().value() == 0);
  CHECK(original_reader.read_varint32().value() == 1);
  CHECK(original_reader.read_varint32().value() == 0);
  CHECK(original_reader.read_u32_le().value() == second.to_wire());
  CHECK(original_reader.read_u8().value() == 52);
  CHECK(original_reader.read_u8().value() == 0);
  CHECK(original_reader.eof());

  engine::Entity* live = api.world().entities().get(second);
  CHECK(live != nullptr);
  live->snapshot_component_mask = 5;
  live->snapshot_field5 = engine::f32(1.5F);
  live->angle = engine::f32(1.5707964F);
  const auto masked = api.original_snapshot_bytes(25, 1);
  engine::ByteReader masked_reader(masked);
  CHECK(masked_reader.read_u8().value() == 1);
  CHECK(masked_reader.read_varint32().value() == 25);
  CHECK(masked_reader.read_varint32().value() == 1);
  CHECK(masked_reader.read_varint32().value() == 0);
  CHECK(masked_reader.read_varint32().value() == 1);
  CHECK(masked_reader.read_varint32().value() == 0);
  CHECK(masked_reader.read_u32_le().value() == second.to_wire());
  CHECK(masked_reader.read_u8().value() == 55);
  CHECK(masked_reader.read_u32_le().value() == 5);
  CHECK(masked_reader.read_varint32().value() == 5);
  CHECK(masked_reader.read_f32_le().value() == 1.5F);
  CHECK(masked_reader.read_varint32().value() == 3);
  CHECK(masked_reader.read_u16_le().value() == 0x3FFF); // original truncates quarter turn
  CHECK(masked_reader.read_u8().value() == 0);
  CHECK(masked_reader.eof());

  const auto next = api.original_snapshot_next(2);
  engine::ByteReader next_reader(next);
  CHECK(next_reader.read_u8().value() == 1);
  CHECK(next_reader.read_varint32().value() == 0);
  CHECK(next_reader.read_varint32().value() == 2);
  CHECK(next_reader.read_varint32().value() == 0);
  CHECK(next_reader.read_varint32().value() == 1);
  CHECK(next_reader.read_varint32().value() == 0);
  CHECK(next_reader.read_u32_le().value() == second.to_wire());
  const auto next2 = api.original_snapshot_next(2);
  engine::ByteReader next2_reader(next2);
  CHECK(next2_reader.read_u8().value() == 1);
  CHECK(next2_reader.read_varint32().value() == 1);

  live->snapshot_dense52 = false;
  live->snapshot_present_groups = 1;
  live->snapshot_dense52_field22 = 0x55;
  live->snapshot_dense52_field54 = 0x66;
  const auto dense_live = api.original_snapshot_bytes(60, 0);
  engine::ByteReader dense_live_reader(dense_live);
  CHECK(dense_live_reader.read_u8().value() == 1);
  CHECK(dense_live_reader.read_varint32().value() == 60);
  CHECK(dense_live_reader.read_varint32().value() == 0);
  CHECK(dense_live_reader.read_varint32().value() == 0);
  CHECK(dense_live_reader.read_varint32().value() == 1);
  CHECK(dense_live_reader.read_varint32().value() == 0);
  CHECK(dense_live_reader.read_u32_le().value() == second.to_wire());
  CHECK(dense_live_reader.read_u8().value() == 62);
  CHECK(dense_live_reader.read_u8().value() == 0x55);
  CHECK(dense_live_reader.read_u8().value() == 0x66);
  CHECK(dense_live_reader.eof());

  live->snapshot_dense52 = false;
  live->snapshot_present_groups = 0;
  live->snapshot_component_mask = 0;
  CHECK(api.set_component_presence(live->handle, 3, true));
  CHECK(api.set_component_presence(live->handle, 5, true));
  CHECK(!api.set_component_presence(live->handle, 31, true));
  live->snapshot_field5 = engine::f32(7.5F);
  live->angle = engine::f32(3.14159265358979323846F / 2.0F);
  const auto presence_packet = api.original_snapshot_bytes(61, 0);
  engine::ByteReader presence_reader(presence_packet);
  CHECK(presence_reader.read_u8().value() == 1);
  CHECK(presence_reader.read_varint32().value() == 61);
  CHECK(presence_reader.read_varint32().value() == 0);
  CHECK(presence_reader.read_varint32().value() == 0);
  CHECK(presence_reader.read_varint32().value() == 1);
  CHECK(presence_reader.read_varint32().value() == 0);
  CHECK(presence_reader.read_u32_le().value() == live->handle.to_wire());
  CHECK(presence_reader.read_u8().value() == 55);
  CHECK(presence_reader.read_u32_le().value() == 20);
  CHECK(presence_reader.read_varint32().value() == 5);
  CHECK(presence_reader.read_f32_le().value() == 7.5F);
  CHECK(presence_reader.read_varint32().value() == 3);
  CHECK(presence_reader.read_u16_le().value() == 0x3FFF);
  // The native 30-slot presence table mirrors the wire mask.
  CHECK(live->component_present(3));
  CHECK(!live->component_present(4));
  CHECK(live->component_present(5));
  CHECK(!live->component_present(0));
  CHECK(!live->component_present(31));

  CHECK(api.set_snapshot_groups(second, (1U << 1) | (1U << 2)));
  CHECK(api.set_snapshot_byte(second, 36, 0x33));
  CHECK(api.set_snapshot_byte(second, 9, 0x44));
  CHECK(!api.set_snapshot_byte(second, 64, 0x55));
  const auto live_groups = api.original_snapshot_bytes(66, 0);
  engine::ByteReader live_groups_reader(live_groups);
  CHECK(live_groups_reader.read_u8().value() == 1);
  CHECK(live_groups_reader.read_varint32().value() == 66);
  CHECK(live_groups_reader.read_varint32().value() == 0);
  CHECK(live_groups_reader.read_varint32().value() == 0);
  CHECK(live_groups_reader.read_varint32().value() == 1);
  CHECK(live_groups_reader.read_varint32().value() == 0);
  CHECK(live_groups_reader.read_u32_le().value() == second.to_wire());
  CHECK(live_groups_reader.read_u8().value() == 62);
  CHECK(live_groups_reader.read_u8().value() == 0x33);
  CHECK(live_groups_reader.read_u8().value() == 0x44);
  CHECK(live_groups_reader.eof());

  CHECK(api.set_snapshot_group(second, 120));
  CHECK(api.set_snapshot_varint(second, 8, 0x4000));
  CHECK(api.set_snapshot_float(second, 28, 1.5F));
  CHECK(api.set_snapshot_float(second, 49, 2.5F));
  const auto typed_group = api.original_snapshot_bytes(67, 0);
  engine::ByteReader typed_group_reader(typed_group);
  CHECK(typed_group_reader.read_u8().value() == 1);
  CHECK(typed_group_reader.read_varint32().value() == 67);
  CHECK(typed_group_reader.read_varint32().value() == 0);
  CHECK(typed_group_reader.read_varint32().value() == 0);
  CHECK(typed_group_reader.read_varint32().value() == 1);
  CHECK(typed_group_reader.read_varint32().value() == 0);
  CHECK(typed_group_reader.read_u32_le().value() == second.to_wire());
  CHECK(typed_group_reader.read_u8().value() == 62);
  CHECK(typed_group_reader.read_u16_le().value() == 0x4000);
  CHECK(typed_group_reader.read_f32_le().value() == 1.5F);
  CHECK(typed_group_reader.read_f32_le().value() == 2.5F);
  CHECK(typed_group_reader.eof());

  CHECK(api.set_snapshot_group(second, 116));
  CHECK(api.set_snapshot_float(second, 53, 3.5F));
  CHECK(api.set_snapshot_float(second, 55, 4.5F));
  const auto float_group = api.original_snapshot_bytes(68, 0);
  engine::ByteReader float_group_reader(float_group);
  CHECK(float_group_reader.read_u8().value() == 1);
  CHECK(float_group_reader.read_varint32().value() == 68);
  CHECK(float_group_reader.read_varint32().value() == 0);
  CHECK(float_group_reader.read_varint32().value() == 0);
  CHECK(float_group_reader.read_varint32().value() == 1);
  CHECK(float_group_reader.read_varint32().value() == 0);
  CHECK(float_group_reader.read_u32_le().value() == second.to_wire());
  CHECK(float_group_reader.read_u8().value() == 62);
  CHECK(float_group_reader.read_f32_le().value() == 3.5F);
  CHECK(float_group_reader.read_f32_le().value() == 4.5F);
  CHECK(float_group_reader.eof());

  CHECK(api.set_snapshot_group(second, 124));
  CHECK(api.set_snapshot_bit(second, 29, true));
  CHECK(api.set_snapshot_bit(second, 40, true));
  const auto bit_group = api.original_snapshot_bytes(69, 0);
  engine::ByteReader bit_group_reader(bit_group);
  CHECK(bit_group_reader.read_u8().value() == 1);
  CHECK(bit_group_reader.read_varint32().value() == 69);
  CHECK(bit_group_reader.read_varint32().value() == 0);
  CHECK(bit_group_reader.read_varint32().value() == 0);
  CHECK(bit_group_reader.read_varint32().value() == 1);
  CHECK(bit_group_reader.read_varint32().value() == 0);
  CHECK(bit_group_reader.read_u32_le().value() == second.to_wire());
  CHECK(bit_group_reader.read_u8().value() == 62);
  CHECK(bit_group_reader.read_u8().value() == 3);

  CHECK(api.set_snapshot_group(second, -27));
  CHECK(api.set_snapshot_string(second, 4, "a"));
  CHECK(api.set_snapshot_varint(second, 15, 300));
  CHECK(api.set_snapshot_double(second, 18, 1.5));
  CHECK(api.set_snapshot_string(second, 25, "b"));
  CHECK(api.set_snapshot_float(second, 27, 2.5F));
  CHECK(api.set_snapshot_bit(second, 33, true));
  CHECK(api.set_snapshot_double(second, 35, 3.5));
  CHECK(api.set_snapshot_varint(second, 41, 400));
  CHECK(api.set_snapshot_varint(second, 44, 16385));
  CHECK(api.set_snapshot_varint(second, 51, 268435457));
  const auto mixed_group = api.original_snapshot_bytes(70, 0);
  engine::ByteReader mixed_group_reader(mixed_group);
  CHECK(mixed_group_reader.read_u8().value() == 1);
  CHECK(mixed_group_reader.read_varint32().value() == 70);
  CHECK(mixed_group_reader.read_varint32().value() == 0);
  CHECK(mixed_group_reader.read_varint32().value() == 0);
  CHECK(mixed_group_reader.read_varint32().value() == 1);
  CHECK(mixed_group_reader.read_varint32().value() == 0);
  CHECK(mixed_group_reader.read_u32_le().value() == second.to_wire());
  CHECK(mixed_group_reader.read_u8().value() == 62);
  CHECK(mixed_group_reader.read_u8().value() == 'a');
  CHECK(mixed_group_reader.read_u8().value() == 0);
  CHECK(mixed_group_reader.read_varint32().value() == 300);
  CHECK(mixed_group_reader.read_f64_le().value() == 1.5);
  CHECK(mixed_group_reader.read_u8().value() == 'b');
  CHECK(mixed_group_reader.read_u8().value() == 0);
  CHECK(mixed_group_reader.read_f32_le().value() == 2.5F);
  CHECK(mixed_group_reader.read_u8().value() == 1);
  CHECK(mixed_group_reader.read_f64_le().value() == 3.5);
  CHECK(mixed_group_reader.read_varint32().value() == 400);
  CHECK(mixed_group_reader.read_varint32().value() == 16385);
  CHECK(mixed_group_reader.read_varint32().value() == 268435457);
  CHECK(mixed_group_reader.eof());

  CHECK(api.set_snapshot_group(second, -8));
  CHECK(api.set_snapshot_float(second, 13, 3.5F));
  CHECK(api.set_snapshot_bit(second, 37, true));
  const auto float_bit_group = api.original_snapshot_bytes(71, 0);
  engine::ByteReader float_bit_reader(float_bit_group);
  CHECK(float_bit_reader.read_u8().value() == 1);
  CHECK(float_bit_reader.read_varint32().value() == 71);
  CHECK(float_bit_reader.read_varint32().value() == 0);
  CHECK(float_bit_reader.read_varint32().value() == 0);
  CHECK(float_bit_reader.read_varint32().value() == 1);
  CHECK(float_bit_reader.read_varint32().value() == 0);
  CHECK(float_bit_reader.read_u32_le().value() == second.to_wire());
  CHECK(float_bit_reader.read_u8().value() == 62);
  CHECK(float_bit_reader.read_f32_le().value() == 3.5F);
  CHECK(float_bit_reader.read_u8().value() == 1);

  CHECK(api.set_snapshot_group(second, -15));
  CHECK(api.set_snapshot_reference(second, 23, 0x11111111));
  CHECK(api.set_snapshot_reference(second, 57, 0x22222222));
  const auto ref_group = api.original_snapshot_bytes(72, 0);
  engine::ByteReader ref_reader(ref_group);
  CHECK(ref_reader.read_u8().value() == 1);
  CHECK(ref_reader.read_varint32().value() == 72);
  CHECK(ref_reader.read_varint32().value() == 0);
  CHECK(ref_reader.read_varint32().value() == 0);
  CHECK(ref_reader.read_varint32().value() == 1);
  CHECK(ref_reader.read_varint32().value() == 0);
  CHECK(ref_reader.read_u32_le().value() == second.to_wire());
  CHECK(ref_reader.read_u8().value() == 62);
  CHECK(ref_reader.read_u32_le().value() == 0x11111111);
  CHECK(ref_reader.read_u32_le().value() == 0x22222222);

  CHECK(api.set_snapshot_group(second, 72));
  CHECK(api.set_snapshot_byte(second, 1, 9));
  CHECK(api.set_snapshot_float(second, 5, 1.25F));
  CHECK(api.set_snapshot_string(second, 6, "n"));
  std::array<std::uint8_t, 10> live_bytes16{};
  for (std::uint8_t index = 0; index < 10; ++index) live_bytes16[index] = index;
  CHECK(api.set_snapshot_byte_array10(second, 16, live_bytes16));
  CHECK(api.set_snapshot_byte(second, 20, 20));
  CHECK(api.set_snapshot_float(second, 21, 2.5F));
  CHECK(api.set_snapshot_float(second, 24, 3.5F));
  CHECK(api.set_snapshot_float(second, 32, 4.5F));
  CHECK(api.set_snapshot_byte(second, 34, 34));
  CHECK(api.set_snapshot_byte(second, 47, 47));
  CHECK(api.set_snapshot_reference(second, 56, 0xABCD));
  const auto group72_live = api.original_snapshot_bytes(73, 0);
  engine::ByteReader group72_reader(group72_live);
  CHECK(group72_reader.read_u8().value() == 1);
  CHECK(group72_reader.read_varint32().value() == 73);
  CHECK(group72_reader.read_varint32().value() == 0);
  CHECK(group72_reader.read_varint32().value() == 0);
  CHECK(group72_reader.read_varint32().value() == 1);
  CHECK(group72_reader.read_varint32().value() == 0);
  CHECK(group72_reader.read_u32_le().value() == second.to_wire());
  CHECK(group72_reader.read_u8().value() == 62);
  CHECK(group72_reader.read_u8().value() == 9);
  CHECK(group72_reader.read_f32_le().value() == 1.25F);
  CHECK(group72_reader.read_u8().value() == 'n');
  CHECK(group72_reader.read_u8().value() == 0);
  for (std::uint8_t index = 0; index < 10; ++index)
    CHECK(group72_reader.read_u8().value() == index);
  CHECK(group72_reader.read_u8().value() == 20);
  CHECK(group72_reader.read_f32_le().value() == 2.5F);
  CHECK(group72_reader.read_f32_le().value() == 3.5F);
  CHECK(group72_reader.read_f32_le().value() == 4.5F);
  CHECK(group72_reader.read_u8().value() == 34);
  CHECK(group72_reader.read_u8().value() == 47);
  CHECK(group72_reader.read_u32_le().value() == 0xABCD);
  CHECK(group72_reader.eof());

  CHECK(api.set_snapshot_auto_position(second, true));
  const auto group72_auto = api.original_snapshot_bytes(76, 0);
  engine::ByteReader auto_reader(group72_auto);
  CHECK(auto_reader.read_u8().value() == 1);
  CHECK(auto_reader.read_varint32().value() == 76);
  (void)auto_reader.read_varint32();
  CHECK(auto_reader.read_varint32().value() == 0);
  CHECK(auto_reader.read_varint32().value() == 1);
  CHECK(auto_reader.read_varint32().value() == 0);
  CHECK(auto_reader.read_u32_le().value() == second.to_wire());
  CHECK(auto_reader.read_u8().value() == 62);
  CHECK(auto_reader.read_u8().value() == 9);
  CHECK(auto_reader.read_f32_le().value() == 2000.0F);
  CHECK(auto_reader.read_u8().value() == 'n');
  CHECK(auto_reader.read_u8().value() == 0);
  for (std::uint8_t index = 0; index < 10; ++index) (void)auto_reader.read_u8();
  CHECK(auto_reader.read_u8().value() == 20);
  CHECK(auto_reader.read_f32_le().value() == 2.5F);
  CHECK(auto_reader.read_f32_le().value() == 0.0F);

  CHECK(api.set_snapshot_group(second, -16));
  std::array<std::uint32_t, 10> live_handles{};
  std::array<std::uint32_t, 10> live_varints{};
  std::array<std::string, 10> live_strings{};
  for (std::uint32_t index = 0; index < 10; ++index) {
    live_handles[index] = 0x100 + index;
    live_varints[index] = 400 + index;
    live_strings[index] = std::string("s") + static_cast<char>('0' + index);
  }
  CHECK(api.set_snapshot_handle_array(second, 3, live_handles));
  CHECK(api.set_snapshot_string_array(second, 10, live_strings));
  CHECK(api.set_snapshot_byte(second, 11, 1));
  CHECK(api.set_snapshot_byte(second, 12, 2));
  CHECK(api.set_snapshot_float(second, 19, 1.5F));
  CHECK(api.set_snapshot_varint(second, 30, 300));
  CHECK(api.set_snapshot_varint_array(second, 39, live_varints));
  CHECK(api.set_snapshot_float(second, 42, 2.5F));
  CHECK(api.set_snapshot_float(second, 45, 3.5F));
  CHECK(api.set_snapshot_byte(second, 46, 46));
  CHECK(api.set_snapshot_varint(second, 52, 500));
  const auto groupM16_live = api.original_snapshot_bytes(74, 0);
  engine::ByteReader groupM16_reader(groupM16_live);
  CHECK(groupM16_reader.read_u8().value() == 1);
  CHECK(groupM16_reader.read_varint32().value() == 74);
  CHECK(groupM16_reader.read_varint32().value() == 0);
  CHECK(groupM16_reader.read_varint32().value() == 0);
  CHECK(groupM16_reader.read_varint32().value() == 1);
  CHECK(groupM16_reader.read_varint32().value() == 0);
  CHECK(groupM16_reader.read_u32_le().value() == second.to_wire());
  CHECK(groupM16_reader.read_u8().value() == 62);
  for (std::uint32_t index = 0; index < 10; ++index)
    CHECK(groupM16_reader.read_u32_le().value() == 0x100 + index);
  for (std::uint32_t index = 0; index < 10; ++index) {
    CHECK(groupM16_reader.read_u8().value() == 's');
    CHECK(groupM16_reader.read_u8().value() == static_cast<std::uint8_t>('0' + index));
    CHECK(groupM16_reader.read_u8().value() == 0);
  }
  CHECK(groupM16_reader.read_u8().value() == 1);
  CHECK(groupM16_reader.read_u8().value() == 2);
  CHECK(groupM16_reader.read_f32_le().value() == 1.5F);
  CHECK(groupM16_reader.read_varint32().value() == 300);
  for (std::uint32_t index = 0; index < 10; ++index)
    CHECK(groupM16_reader.read_varint32().value() == 400 + index);
  CHECK(groupM16_reader.read_f32_le().value() == 2.5F);
  CHECK(groupM16_reader.read_f32_le().value() == 3.5F);
  CHECK(groupM16_reader.read_u8().value() == 46);
  CHECK(groupM16_reader.read_varint32().value() == 500);
  CHECK(groupM16_reader.eof());

  CHECK(api.set_snapshot_group(second, 152));
  CHECK(api.set_snapshot_byte(second, 2, 2));
  CHECK(api.set_snapshot_byte(second, 26, 26));
  CHECK(api.set_snapshot_byte(second, 31, 31));
  CHECK(api.set_snapshot_varint(second, 58, 58));
  CHECK(api.set_snapshot_float(second, 59, 1.5F));
  std::array<std::uint8_t, 16> live_bytes60{};
  std::array<std::uint16_t, 8> live_shorts61{};
  for (std::uint8_t index = 0; index < 16; ++index) live_bytes60[index] = index;
  for (std::uint16_t index = 0; index < 8; ++index) live_shorts61[index] = 0x100 + index;
  CHECK(api.set_snapshot_byte_array(second, 60, live_bytes60));
  CHECK(api.set_snapshot_short_array(second, 61, live_shorts61));
  CHECK(api.set_snapshot_byte(second, 62, 62));
  CHECK(api.set_snapshot_byte(second, 63, 63));
  const auto group152_live = api.original_snapshot_bytes(75, 0);
  engine::ByteReader group152_reader(group152_live);
  CHECK(group152_reader.read_u8().value() == 1);
  CHECK(group152_reader.read_varint32().value() == 75);
  CHECK(group152_reader.read_varint32().value() == 0);
  CHECK(group152_reader.read_varint32().value() == 0);
  CHECK(group152_reader.read_varint32().value() == 1);
  CHECK(group152_reader.read_varint32().value() == 0);
  CHECK(group152_reader.read_u32_le().value() == second.to_wire());
  CHECK(group152_reader.read_u8().value() == 126);
  CHECK(group152_reader.read_u8().value() == 2);
  CHECK(group152_reader.read_u8().value() == 26);
  CHECK(group152_reader.read_u8().value() == 31);
  CHECK(group152_reader.read_varint32().value() == 58);
  CHECK(group152_reader.read_f32_le().value() == 1.5F);
  for (std::uint8_t index = 0; index < 16; ++index)
    CHECK(group152_reader.read_u8().value() == index);
  for (std::uint16_t index = 0; index < 8; ++index)
    CHECK(group152_reader.read_varint32().value() == 0x100 + index);
  CHECK(group152_reader.read_u8().value() == 62);
  CHECK(group152_reader.read_u8().value() == 63);
  CHECK(group152_reader.eof());

  engine::OriginalSnapshotWriter multi_dense_writer;
  multi_dense_writer.begin(65, 4);
  const std::array<std::uint8_t, 2> group52{{0x11, 0x22}};
  const std::array<std::uint8_t, 1> group56{{0x33}};
  const std::array<std::span<const std::uint8_t>, 2> groups{{group52, group56}};
  multi_dense_writer.write_dense_byte_groups(second, groups);
  const auto multi_dense_bytes = multi_dense_writer.finish();
  engine::ByteReader multi_dense_reader(multi_dense_bytes);
  CHECK(multi_dense_reader.read_u8().value() == 1);
  CHECK(multi_dense_reader.read_varint32().value() == 65);
  CHECK(multi_dense_reader.read_varint32().value() == 4);
  CHECK(multi_dense_reader.read_varint32().value() == 0);
  CHECK(multi_dense_reader.read_varint32().value() == 1);
  CHECK(multi_dense_reader.read_varint32().value() == 0);
  CHECK(multi_dense_reader.read_u32_le().value() == second.to_wire());
  CHECK(multi_dense_reader.read_u8().value() == 62);
  CHECK(multi_dense_reader.read_u8().value() == 0x11);
  CHECK(multi_dense_reader.read_u8().value() == 0x22);
  CHECK(multi_dense_reader.read_u8().value() == 0x33);
  CHECK(multi_dense_reader.eof());

  const auto doomed = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(2500.0F), engine::f32(0.0F)));
  CHECK(doomed.valid());
  CHECK(api.despawn(doomed));
  const auto delete_packet = api.original_snapshot_next(3);
  engine::ByteReader live_delete_reader(delete_packet);
  CHECK(live_delete_reader.read_u8().value() == 1);
  CHECK(live_delete_reader.read_varint32().value() == 2);
  CHECK(live_delete_reader.read_varint32().value() == 3);
  CHECK(live_delete_reader.read_varint32().value() == 1); // deletes
  CHECK(live_delete_reader.read_varint32().value() == 1); // updates
  CHECK(live_delete_reader.read_varint32().value() == 0); // events
  CHECK(live_delete_reader.read_u32_le().value() == doomed.to_wire());
  CHECK(live_delete_reader.read_u32_le().value() == second.to_wire());

  engine::WorkerApi death_api;
  death_api.init();
  const auto dead = death_api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(3000.0F), engine::f32(0.0F)));
  CHECK(dead.valid());
  death_api.world().entities().get(dead)->type_id = 0U; // no loot-table update
  death_api.world().entities().get(dead)->health = engine::f32(0.0F);
  death_api.think();
  // Original 43 leaves a health-0 corpse in the world for one second and only
  // deletes the entity when that timer expires.
  const engine::Entity* dead_entity = death_api.world().entities().get(dead);
  CHECK(dead_entity != nullptr);
  CHECK(dead_entity->death_processed);
  CHECK(dead_entity->death_time_ms >= 1000.0);
  const auto death_packet = death_api.original_snapshot_bytes(0, 0);
  engine::ByteReader death_reader(death_packet);
  CHECK(death_reader.read_u8().value() == 1);
  CHECK(death_reader.read_varint32().value() == 0);
  CHECK(death_reader.read_varint32().value() == 0);
  CHECK(death_reader.read_varint32().value() == 0); // no deletes yet

  engine::WorkerApi reset_api;
  reset_api.init();
  const auto transient = reset_api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(4000.0F), engine::f32(0.0F)));
  CHECK(transient.valid());
  CHECK(reset_api.despawn(transient));
  reset_api.init();
  const auto clean_packet = reset_api.original_snapshot_bytes(0, 0);
  engine::ByteReader clean_reader(clean_packet);
  CHECK(clean_reader.read_u8().value() == 1);
  CHECK(clean_reader.read_varint32().value() == 0);
  CHECK(clean_reader.read_varint32().value() == 0);
  CHECK(clean_reader.read_varint32().value() == 0); // deletes
  CHECK(clean_reader.read_varint32().value() == 0); // updates
  CHECK(clean_reader.read_varint32().value() == 0); // events
  CHECK(clean_reader.eof());

  reset_api.configure_player_spawn(
    engine::PlayerConfig{engine::f32(25.0F), engine::f32(100.0F), engine::f32(100.0F)},
    engine::Vec2(engine::f32(10.0F), engine::f32(20.0F)));
  engine::ByteWriter player_input;
  player_input.write_varint32(1);
  player_input.write_varint32(6);
  for (const char byte : std::string("p")) player_input.write_u8(static_cast<std::uint8_t>(byte));
  player_input.write_u8(0);
  std::vector<std::uint8_t> player_packet = player_input.bytes();
  engine::apply_packet_xor(player_packet, key);
  CHECK(reset_api.send(player_packet, key));
  CHECK(reset_api.world().player().valid());
  CHECK(reset_api.world().player_name() == "p");
  const engine::Entity* player_entity = reset_api.world().entities().get(reset_api.world().player());
  CHECK(player_entity != nullptr);
  CHECK(player_entity->kind == engine::EntityKind::kPlayer);
  CHECK(player_entity->position.x.to_float() == 10.0F);
  CHECK(player_entity->position.y.to_float() == 20.0F);

  CHECK(reset_api.world().loadout().equip(0, 1));
  CHECK(reset_api.world().loadout().equip(1, 2));
  engine::ByteWriter swap_input;
  swap_input.write_varint32(2);
  swap_input.write_varint32(10);
  swap_input.write_u8(0);
  swap_input.write_u8(1);
  swap_input.write_u8(1);
  swap_input.write_u8(2);
  std::vector<std::uint8_t> swap_packet = swap_input.bytes();
  engine::apply_packet_xor(swap_packet, key);
  CHECK(reset_api.send(swap_packet, key));
  CHECK(reset_api.world().loadout().slots()[0].type_id == 2);
  CHECK(reset_api.world().loadout().slots()[1].type_id == 1);

  engine::ByteWriter discard_input;
  discard_input.write_varint32(3);
  discard_input.write_varint32(8);
  discard_input.write_u8(0);
  discard_input.write_u8(2);
  std::vector<std::uint8_t> discard_packet = discard_input.bytes();
  engine::apply_packet_xor(discard_packet, key);
  CHECK(reset_api.send(discard_packet, key));
  CHECK(reset_api.world().loadout().slots()[0].count == 0);
}

void test_rock_construction() {
  engine::ServerRng rng(1383144482U);
  (void)rng.next(); // function 144's three pre-configure draws
  (void)rng.next();
  (void)rng.next();
  const engine::RockBody body = engine::configure_rock(rng, false);
  CHECK(body.radius.value == 39.513580322265625F);
  CHECK(body.health.value == 15.805432319641113F);
  CHECK(rng.state() == 2095254635U);

  engine::World world;
  world.initialize();
  engine::ServerRng spawn_rng(1383144482U);
  (void)spawn_rng.next();
  (void)spawn_rng.next();
  (void)spawn_rng.next();
  const auto handle = engine::spawn_rock(world, engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)), false, spawn_rng);
  CHECK(handle.valid());
  const auto* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  CHECK(entity->type_id == 1);
  CHECK(entity->radius.value == 39.513580322265625F);
  CHECK(entity->health.value == 15.805432319641113F);
  CHECK(entity->contact_damage.value == 10.0F);
  CHECK(entity->world_flags == 75);
  CHECK(entity->entity_flags == 96);
  CHECK(entity->component_flags92 == 4);

  engine::World band_world;
  band_world.initialize();
  band_world.random().seed(787621659U);
  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  const auto band_handle = engine::spawn_from_band_function144(band_world, table, 0,
    [](const engine::SpawnPosition&) { return false; });
  CHECK(band_handle.valid());
  const auto* band_entity = band_world.entities().get(band_handle);
  CHECK(band_entity != nullptr);
  CHECK(band_entity->type_id == 1);
  CHECK(band_entity->radius.value == 39.513580322265625F);
  CHECK(band_world.random().state() == 2095254635U);
}

void test_entity_spawn_defaults() {
  const auto* cactus = engine::Catalog::instance().spawn_defaults(3);
  CHECK(cactus != nullptr);
  CHECK(cactus->radius == 49.99694061279297F);
  CHECK(cactus->contactDamage == 30.0F);
  CHECK(cactus->flags95 == 75);
  CHECK(cactus->flags93 == 96);
  CHECK(cactus->dynamicRadius);

  engine::World world;
  world.initialize();
  CHECK(!engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 3,
    engine::Vec2(engine::f32(10.0F), engine::f32(20.0F))).valid());
  CHECK(!engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 1,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F))).valid());
}

void test_spatial_query() {
  engine::SpatialQuery query;
  engine::CollisionBody body;
  body.position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  body.radius = engine::f32(10.0F);
  body.world_flags = 32;
  query.add(body);
  const engine::SpawnPosition origin{engine::f32(0.0F), engine::f32(0.0F)};
  CHECK(query.occupied(origin));
  CHECK(query.occupied({engine::f32(500.0F), engine::f32(0.0F)}));
  CHECK(!query.occupied({engine::f32(700.0F), engine::f32(0.0F)}));
  query.rebuild();
  CHECK(query.occupied(origin));
  CHECK(query.size() == 1);

  // The index must cover the whole 50000x4000 arena, not just the origin box.
  engine::SpatialQuery far;
  far.add({{engine::f32(20000.0F), engine::f32(1000.0F)}, engine::f32(10.0F), 32, 32});
  CHECK(far.occupied({engine::f32(20000.0F), engine::f32(1000.0F)}));
  CHECK(!far.occupied(origin));
  std::vector<engine::EntityHandle> circle_hits;
  far.query_circle(engine::Vec2(engine::f32(20000.0F), engine::f32(1000.0F)),
                   engine::f32(100.0F), circle_hits);
  CHECK(circle_hits.size() == 1U);

  query.clear();
  body.world_flags = 0;
  body.entity_flags = 0;
  query.add(body);
  CHECK(!query.occupied({engine::f32(50.0F), engine::f32(0.0F)}));
  body.entity_flags = 32;
  query.clear();
  query.add(body);
  CHECK(query.occupied({engine::f32(50.0F), engine::f32(0.0F)}));
  CHECK(!query.occupied({engine::f32(200.0F), engine::f32(0.0F)}));

  engine::World world;
  world.initialize();
  const auto entity = engine::spawn_entity(world, engine::EntityKind::kMob, 1,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::f32(10.0F), 32, 32);
  CHECK(entity.valid());
  const engine::SpatialQuery from_world = engine::SpatialQuery::from_world(world);
  CHECK(from_world.size() == 1);
  CHECK(from_world.occupied({engine::f32(0.0F), engine::f32(0.0F)}));
  CHECK(from_world.occupied({engine::f32(500.0F), engine::f32(0.0F)}));
  CHECK(!from_world.occupied({engine::f32(700.0F), engine::f32(0.0F)}));

  const engine::SpawnTable table = engine::SpawnTable::from_catalog();
  engine::World empty_world;
  empty_world.initialize();
  const engine::SpatialQuery empty_query;
  int spawned_calls = 0;
  const auto live_spawn = engine::spawn_from_band(empty_world, table, 0, empty_query,
    [&](const engine::SpawnBandEntry& entry, const engine::SpawnPosition& position) {
      ++spawned_calls;
      return engine::spawn_entity(empty_world, engine::EntityKind::kMob, entry.entity_type,
        engine::Vec2(position.x, position.y), engine::f32(14.0F), 32, 32);
    });
  CHECK(live_spawn.valid());
  CHECK(spawned_calls == 1);

  engine::SpatialQuery blocked;
  blocked.add({{engine::f32(0.0F), engine::f32(0.0F)}, engine::f32(100000.0F), 32, 32});
  engine::World blocked_world;
  blocked_world.initialize();
  int blocked_calls = 0;
  const auto blocked_spawn = engine::spawn_from_band(blocked_world, table, 0, blocked,
    [&](const engine::SpawnBandEntry& entry, const engine::SpawnPosition& position) {
      ++blocked_calls;
      return engine::spawn_entity(blocked_world, engine::EntityKind::kMob, entry.entity_type,
        engine::Vec2(position.x, position.y), engine::f32(14.0F), 32, 32);
    });
  CHECK(!blocked_spawn.valid());
  CHECK(blocked_calls == 0);
}

void test_component_store() {
  engine::ComponentStore store;
  CHECK(!store.has(4));
  auto& positions = store.pool<engine::Vec2>(4);
  CHECK(store.has(4));
  const auto first = positions.attach(engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)));
  CHECK(first.has_value());
  CHECK(store.has(4));
  CHECK(positions.capacity() == 1);
  CHECK(positions.get(*first)->x.value == 1.0F);
  positions.release(*first);
  CHECK(positions.free_count() == 1);
  const auto reused = positions.attach(engine::Vec2(engine::f32(3.0F), engine::f32(4.0F)));
  CHECK(reused.has_value());
  CHECK(*reused == *first);
  CHECK(positions.get(*reused)->y.value == 4.0F);
}

void test_catalog() {
  const engine::Catalog& catalog = engine::Catalog::instance();
  CHECK(catalog.petals().size() == 39);
  CHECK(catalog.entities().size() == 23);
  CHECK(catalog.spawn_rules().size() == 20);
  const auto* basic = catalog.petal(1);
  CHECK(basic != nullptr);
  CHECK(std::strcmp(basic->name, "Basic") == 0);
  CHECK(basic->rechargeMilliseconds == 2500.0F);
  CHECK(basic->radius == 14.0F);
  CHECK(basic->descriptionCount == 1);
  const auto* rock = catalog.entity(1);
  CHECK(rock != nullptr);
  CHECK(std::strcmp(rock->name, "Rock") == 0);
  CHECK(rock->petalTypeIdCount == 3);
  CHECK(rock->petalTypeIds[0] == 2);
  CHECK(rock->petalTypeIds[2] == 4);
  int rose_count = 0;
  for (const auto& petal : catalog.petals()) if (std::strcmp(petal.name, "Rose") == 0) ++rose_count;
  CHECK(rose_count == 3);
  CHECK(catalog.spawn_rules()[0].weight == 0.5F);
  CHECK(catalog.spawn_rules()[0].entityTypeId == 1);
  CHECK(catalog.petal(39) == nullptr);
  const auto& drops = engine::drop_table();
  CHECK(drops.size() == 23);
  CHECK(drops[3].type_id == 3);
  CHECK(drops[3].petal_type_ids.size() == 5);
  CHECK(drops[3].petal_type_ids[0] == 7);
  CHECK(drops[3].petal_type_ids[4] == 33);
  CHECK(drops[0].petal_type_ids.empty());
  const auto& petals = engine::petal_defaults();
  CHECK(petals.size() == 39);
  CHECK(petals[1].type_id == 1);
  CHECK(petals[1].recharge_milliseconds == 2500U);
  CHECK(petals[1].radius == 14.0F);
  CHECK(petals[3].recharge_milliseconds == 5500U);
}

void test_protocol_constants() {
  CHECK(engine::kMaxInputPacketBytes == 65536);
  CHECK(engine::kOutputQueueCapacity == 16);
  CHECK(engine::kPacketHeaderBytes == 16);
  CHECK(engine::kInlinePayloadBytes == 4096);
  CHECK(engine::kPacketXorKeyBytes == 256);
  engine::OutputQueue queue;
  for (std::size_t index = 0; index < engine::kOutputQueueCapacity; ++index) {
    CHECK(queue.enqueue(engine::OutputPacket{}));
  }
  CHECK(queue.full());
  CHECK(!queue.enqueue(engine::OutputPacket{}));
  CHECK(queue.drain().size() == engine::kOutputQueueCapacity);
  CHECK(queue.empty());
}

} // namespace

void test_quadtree() {
  engine::QuadTree tree(engine::Aabb{engine::f32(-600.0F), engine::f32(-600.0F),
                                     engine::f32(600.0F), engine::f32(600.0F)}, 2, 5);
  std::vector<engine::Aabb> boxes;
  for (int index = 0; index < 100; ++index) {
    const float x = -500.0F + static_cast<float>(index % 10) * 111.0F;
    const float y = -500.0F + static_cast<float>(index / 10) * 111.0F;
    boxes.push_back(engine::Aabb{engine::f32(x - 2.0F), engine::f32(y - 2.0F),
                                 engine::f32(x + 2.0F), engine::f32(y + 2.0F)});
    tree.insert(static_cast<std::size_t>(index), boxes.back());
  }
  CHECK(tree.size() == 100);
  CHECK(tree.node_count() > 1);
  const engine::Aabb area{engine::f32(-100.0F), engine::f32(-100.0F),
                          engine::f32(100.0F), engine::f32(100.0F)};
  std::vector<std::size_t> indexed;
  tree.query(area, indexed);
  std::vector<std::size_t> linear;
  for (std::size_t index = 0; index < boxes.size(); ++index)
    if (boxes[index].intersects(area)) linear.push_back(index);
  std::sort(indexed.begin(), indexed.end());
  CHECK(indexed == linear);
  std::vector<std::size_t> outside;
  tree.query(engine::Aabb{engine::f32(700.0F), engine::f32(700.0F),
                          engine::f32(800.0F), engine::f32(800.0F)}, outside);
  CHECK(outside.empty());

  tree.update(42, engine::Aabb{engine::f32(-3.0F), engine::f32(-3.0F),
                               engine::f32(3.0F), engine::f32(3.0F)});
  CHECK(tree.size() == 100);
  tree.insert(42, engine::Aabb{engine::f32(-3.0F), engine::f32(-3.0F),
                               engine::f32(3.0F), engine::f32(3.0F)});
  CHECK(tree.size() == 100);
  std::vector<std::size_t> updated;
  tree.query(engine::Aabb{engine::f32(-4.0F), engine::f32(-4.0F),
                          engine::f32(4.0F), engine::f32(4.0F)}, updated);
  CHECK(std::find(updated.begin(), updated.end(), 42) != updated.end());

  tree.remove(42);
  CHECK(tree.size() == 99);
  std::vector<std::size_t> all;
  tree.query(engine::Aabb{engine::f32(-600.0F), engine::f32(-600.0F),
                          engine::f32(600.0F), engine::f32(600.0F)}, all);
  CHECK(all.size() == 99);
  CHECK(std::find(all.begin(), all.end(), 42) == all.end());

  std::vector<bool> present(100, true);
  present[0] = false;
  tree.remove_missing(present);
  CHECK(tree.size() == 98);
  tree.query(engine::Aabb{engine::f32(-600.0F), engine::f32(-600.0F),
                          engine::f32(600.0F), engine::f32(600.0F)}, all);
  CHECK(all.size() == 98);
  CHECK(std::find(all.begin(), all.end(), 0) == all.end());

  tree.clear();
  CHECK(tree.size() == 0);
  tree.insert(0, boxes[0]);
  std::vector<std::size_t> after_clear;
  tree.query(engine::Aabb{engine::f32(-501.0F), engine::f32(-501.0F),
                          engine::f32(-499.0F), engine::f32(-499.0F)}, after_clear);
  CHECK(after_clear == std::vector<std::size_t>{0});
}

void test_dense_field_catalog() {
  CHECK(engine::kDenseGroups.size() == 19);
  const auto* group52 = engine::dense_group_for_field(22);
  CHECK(group52 != nullptr);
  CHECK(group52->offset == 52);
  const auto* group152 = engine::dense_group_for_field(59);
  CHECK(group152 != nullptr);
  CHECK(group152->offset == 152);
  const auto* extended = engine::dense_group_for_field(60);
  CHECK(extended == group152);
  CHECK(engine::dense_group_for_field(64) == nullptr);
}


void test_progression() {
  CHECK(engine::growth_factor(0) == 1.0);
  CHECK(std::fabs(engine::growth_factor(1) - 1.06) < 1e-15);
  CHECK(std::fabs(engine::growth_factor(2) - 1.1236) < 1e-12);
  CHECK(std::fabs(engine::growth_factor(-1) - (1.0 / 1.06)) < 1e-15);
  CHECK(engine::experience_threshold(0).to_float() == 3.0F);
  CHECK(engine::experience_threshold(1).to_float() == 4.0F);
  CHECK(engine::experience_threshold(2).to_float() == 5.0F);
  CHECK(engine::rarity_experience(0).to_float() == 2.0F);
  CHECK(engine::rarity_experience(5).to_float() == 2500.0F);
  CHECK(engine::rarity_experience(6).to_float() == 0.0F);
  engine::PlayerProfile profile;
  CHECK(profile.level() == 0);
  profile.add_experience(engine::f32(3.0F));
  CHECK(profile.level() == 1);
  CHECK(profile.experience().to_float() == 0.0F);
  profile.add_experience(engine::f32(100.0F));
  CHECK(profile.level() > 1);
  CHECK(profile.inventory_size() == 13);
  CHECK(profile.active_slots() == 5);
}

void test_reward_health_and_level_cap() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const auto handle = engine::spawn_player_default(world, "progression",
    engine::make_default_profile(), false);
  auto* player = world.entities().get(handle);
  CHECK(player != nullptr);
  // Original func215/145 oracle: multiple levels must retain each intermediate
  // multiply/divide rounding, including the sub-maximum result at level 11.
  const float rewards[] = {3.0F, 3.0F, 10.0F, 100.0F};
  const unsigned levels[] = {1U, 2U, 4U, 11U};
  const float health[] = {100.0F, 101.13636016845703F, 103.40908813476562F, 111.3636245727539F};
  for (unsigned i = 0; i < 4; ++i) {
    engine::award_player_experience(world, engine::f32(rewards[i]));
    CHECK(world.profile().level() == levels[i]);
    CHECK(player->health.value == health[i]);
    CHECK(player->max_health == engine::player_level_max_health(world.profile().level()));
  }
  CHECK(world.loadout().score().value == 116.0F);
  CHECK(world.profile().experience().value == 11.0F);
  world.profile().set_level(98U);
  world.profile().set_experience(engine::f32(0.0F));
  engine::award_player_experience(world, engine::f32(1e8F));
  CHECK(world.profile().level() == 99U);
  CHECK(player->max_health.value == 150.0F);
  engine::World restored;
  restored.initialize();
  auto profile = engine::make_default_profile();
  profile.set_level(2U);
  const auto respawn = engine::spawn_player_default(restored, "restored", profile, false);
  CHECK(restored.entities().get(respawn)->health.value == 101.13636016845703F);
}

void test_player_default_spawn() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "default", engine::make_default_profile());
  CHECK(player.valid());
  CHECK(world.player() == player);
  CHECK(world.player_name() == "default");
  const engine::Entity* entity = world.entities().get(player);
  CHECK(entity != nullptr);
  CHECK(entity->kind == engine::EntityKind::kPlayer);
  CHECK(entity->radius.to_float() == 25.0F);
  CHECK(entity->collision_radius.to_float() == 25.0F);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->max_health.to_float() == 100.0F);
  CHECK(entity->contact_damage.to_float() == 25.0F);
  CHECK(world.profile().level() == 1);
  CHECK(world.profile().inventory_count() == 5);
  CHECK(world.profile().inventory(0) == 1);
  CHECK(world.loadout().slots()[0].type_id == 1);
  CHECK(world.loadout().slots()[4].type_id == 1);
  CHECK(world.loadout().slots()[5].count == 0);
  CHECK(entity->position.x.to_float() >= -25000.0F);
  CHECK(entity->position.x.to_float() <= -25000.0F + 15000.0F);
  CHECK(entity->position.y.to_float() >= -2000.0F);
  CHECK(entity->position.y.to_float() <= 2000.0F);
  const std::size_t petals = engine::spawn_loadout_petals(world);
  CHECK(petals == 5);
  CHECK(world.petals().size() == 5);
  CHECK(world.petals()[0].profile == static_cast<std::uint8_t>(engine::OrbitProfile::kBasic));
}

void test_petal_combat_catalog() {
  const auto* basic = engine::Catalog::instance().petal_combat(1);
  CHECK(basic != nullptr);
  CHECK(basic->collisionRadius == 10.0F);
  CHECK(basic->damage == 10.0F);
  CHECK(basic->health == 10.0F);
  CHECK(basic->instancesPerSlot == 1);
  CHECK(std::string(basic->orbitProfile) == "basic");
  const auto* rock = engine::Catalog::instance().petal_combat(4);
  CHECK(rock != nullptr);
  CHECK(rock->rarityIndex == 2);
  CHECK(rock->collisionRadius == 14.0F);
  CHECK(rock->health == 90.0F);
  const auto* corn = engine::Catalog::instance().petal_combat(38);
  CHECK(corn != nullptr);
  CHECK(corn->health == 2000.0F);
  CHECK(corn->rechargeMilliseconds == 45000.0F);
  const auto* rose = engine::Catalog::instance().petal_combat(6);
  CHECK(rose != nullptr);
  CHECK(rose->orbitFunctionIndex == 665);
  CHECK(engine::Catalog::instance().petal_combat(99) == nullptr);
}

void test_drop_chances() {
  const auto* rock = engine::Catalog::instance().drop_table(1);
  CHECK(rock != nullptr);
  CHECK(rock->dropCount == 3);
  CHECK(rock->drops[0].petalTypeId == 4);
  CHECK(std::fabs(rock->drops[0].chance - 0.00522140646353364) < 1e-12);
  CHECK(rock->drops[2].petalTypeId == 3);
  CHECK(std::fabs(rock->drops[2].chance - 0.10442813485860825) < 1e-12);
  const auto* alias = engine::Catalog::instance().drop_table(16);
  CHECK(alias != nullptr);
  CHECK(alias->aliasOf == 15);
  CHECK(alias->dropCount == 6);
  engine::ServerRng rng(1);
  const auto loot = engine::roll_entity_loot(rng, 1, false);
  for (const auto petal : loot) CHECK(petal == 2 || petal == 3 || petal == 4);
  engine::ServerRng compact_rng(1);
  const auto compact_loot = engine::roll_entity_loot(compact_rng, 1, true);
  CHECK(compact_loot.size() <= loot.size() + 3);
}

void test_loot_retention() {
  engine::PlayerProfile profile;
  profile.set_level(10);
  profile.set_inventory(0, 4);
  profile.set_inventory(1, 1);
  profile.set_inventory(2, 15);
  profile.set_inventory(3, 24);
  profile.set_inventory(4, 2);
  profile.set_inventory_count(5);
  profile.push_backpack(2);
  engine::ServerRng rng(7);
  const engine::LootResult result = engine::retain_player_loot(profile, rng);
  CHECK(result.retained_count <= 3);
  CHECK(result.lost_count <= 10);
  for (std::uint8_t index = 0; index < result.retained_count; ++index) CHECK(result.retained[index] != 1);
  CHECK(profile.lost_count() == result.lost_count);
  CHECK(profile.inventory_count() == result.retained_count);
  CHECK(profile.backpack_count() == 0);
  CHECK(engine::loot_lifetime_ms(1) == 32000.0);
  CHECK(engine::loot_lifetime_ms(4) == 42000.0);
  CHECK(engine::loot_lifetime_ms(15) == 52000.0);
  CHECK(engine::loot_lifetime_ms(24) == 42000.0);
  CHECK(engine::loot_lifetime_ms(35) == 62000.0);
}

void test_healing_clamp() {
  engine::Entity entity;
  entity.health = engine::f32(5.0F);
  entity.max_health = engine::f32(10.0F);
  CHECK(engine::heal_entity(entity, engine::f32(3.0F)).to_float() == 8.0F);
  CHECK(engine::heal_entity(entity, engine::f32(100.0F)).to_float() == 10.0F);
  CHECK(engine::heal_entity(entity, engine::f32(-100.0F)).to_float() == 0.0F);
  entity.health = engine::f32(0.0F);
  CHECK(engine::heal_entity(entity, engine::f32(5.0F)).to_float() == 0.0F);
}

void test_contact_combat_and_loot() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  CHECK(player.valid());
  engine::Entity* player_entity = world.entities().get(player);
  player_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(mob.valid());
  engine::Entity* mob_entity = world.entities().get(mob);
  const engine::f32 player_health = player_entity->health;
  const engine::f32 mob_health = mob_entity->health;
  const std::size_t contacts = engine::resolve_contacts(world);
  CHECK(contacts > 0);
  CHECK(player_entity->health.value < player_health.value);
  CHECK(mob_entity->health.value < mob_health.value);
  engine::damage_entity(world, mob, engine::f32(1000.0F), player);
  const engine::Entity* corpse = world.entities().get(mob);
  CHECK(corpse != nullptr);
  CHECK(corpse->death_processed);
  CHECK(corpse->health.value == 0.0F);
  CHECK(world.profile().experience().value >= 0.0F);
  CHECK(world.destroy(mob));
}

void test_multi_instance_orbit_spacing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "orbit", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 24);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 24));
  CHECK(engine::spawn_loadout_petals(world) == 3);
  CHECK(world.petals().size() == 3);
  CHECK(world.petals()[0].extra_radius.to_float() == 11.0F);
  CHECK(world.petals()[0].instance_count == 3);
  CHECK(std::fabs(world.petals()[0].angle.to_float() - 0.0F) < 1e-6F);
  // R06: Rose has definition+41 set, so original function 85 gives all three
  // instances the same orbit index (petal +18); the ring position is shared and
  // the per-instance separation comes from the extra radius (+44 = 11) added
  // at angle*1.1 + instance*2*pi/3.
  CHECK(std::fabs(world.petals()[1].angle.to_float() - 0.0F) < 1e-6F);
  CHECK(std::fabs(world.petals()[2].angle.to_float() - 0.0F) < 1e-6F);
  CHECK(world.petals()[1].orbit_index == world.petals()[0].orbit_index);
  CHECK(world.petals()[2].orbit_index == world.petals()[0].orbit_index);
}

void test_orbit_reindex_after_removal() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "reindex", engine::make_default_profile()).valid());
  for (std::uint8_t slot = 0; slot < 5; ++slot)
    world.profile().set_inventory(slot, static_cast<std::uint16_t>(slot + 1));
  world.profile().set_inventory_count(5);
  world.loadout().clear();
  for (std::uint8_t slot = 0; slot < 5; ++slot)
    CHECK(world.loadout().equip(slot, static_cast<std::uint16_t>(slot + 1)));
  CHECK(engine::spawn_loadout_petals(world) == 5U);
  CHECK(world.loadout().change_slot_type(world, world.profile(), 2, 0));
  engine::assign_petal_orbit_indices(world);
  CHECK(world.petals().size() == 4U);
  CHECK(world.loadout().orbit_positions() == 4U);
  std::array<std::uint8_t, 4> indices{};
  for (std::size_t index = 0; index < world.petals().size(); ++index)
    indices[index] = world.petals()[index].orbit_index;
  std::sort(indices.begin(), indices.end());
  CHECK(indices[0] == 0U && indices[1] == 1U && indices[2] == 2U && indices[3] == 3U);
}

void test_flag41_slot_without_component_keeps_shared_position() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "rose-slot", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 24);
  world.profile().set_inventory(1, 1);
  world.profile().set_inventory_count(2);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 24));
  CHECK(world.loadout().equip(1, 1));
  CHECK(engine::spawn_loadout_petals(world) == 4U);
  // Replace Rose's third instance with a live entity that has no petal
  // component. Original function 85 adds only the already-used shared
  // position, so Basic remains at orbit 1 instead of jumping to 2.
  const engine::EntityHandle componentless = engine::spawn_entity(
    world, engine::EntityKind::kPetal, 1U, engine::Vec2{engine::f32(20.0F), engine::f32(0.0F)},
    engine::f32(14.0F), 0U, 0U);
  CHECK(componentless.valid());
  world.loadout().set_handle(0, 2, componentless);
  engine::assign_petal_orbit_indices(world);
  const engine::EntityHandle basic = world.loadout().handle(1, 0);
  engine::PetalOrbitState* basic_state = nullptr;
  for (auto& state : world.petals()) if (state.handle == basic) basic_state = &state;
  CHECK(basic_state != nullptr);
  CHECK(basic_state->orbit_index == 1U);
}

void test_peas_attack_consumes_petal() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "peas", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 11);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 11));
  CHECK(engine::spawn_loadout_petals(world) == 1U);
  const engine::EntityHandle pea = world.petals()[0].handle;
  world.advance_tick(600.0);
  world.apply_input(1U, engine::f32(0.0F), engine::f32(0.0F));
  engine::update_petal_orbits(world, 16.0);
  CHECK(world.entities().get(pea) == nullptr);
  std::uint32_t children = 0;
  for (const auto& entity : world.entities().entities())
    if (entity.active && entity.kind == engine::EntityKind::kPetal && entity.type_id == 11)
      ++children;
  CHECK(children == 4U);
  CHECK(world.run_deferred_launches(world.time_ms() + 1.0) >= 1U);
}

void test_twin_widens_orbit_spacing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "twin-space", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 16);
  world.profile().set_inventory(1, 1);
  world.profile().set_inventory_count(2);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 16));
  CHECK(world.loadout().equip(1, 1));
  CHECK(engine::spawn_loadout_petals(world) == 3U);
  // Twin reserves two positions; Basic therefore sits at 4*pi/3 rather than
  // the old five-slot 2*pi/5 that left the Twin pair overlapping it.
  CHECK(world.petals()[0].orbit_index == 0U);
  CHECK(world.petals()[1].orbit_index == 1U);
  CHECK(world.petals()[2].orbit_index == 2U);
  CHECK(std::fabs(world.petals()[0].orbit_angle - 0.0) < 1e-6);
  CHECK(std::fabs(world.petals()[1].orbit_angle - 2.0943951023931953) < 1e-5);
  CHECK(std::fabs(world.petals()[2].orbit_angle - 4.1887902047863905) < 1e-5);
}

void test_rose_healing() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "rose", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 6);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 6));
  CHECK(engine::spawn_loadout_petals(world) == 1);
  engine::Entity* player = world.entities().get(world.player());
  CHECK(player != nullptr);
  player->health = engine::f32(50.0F);
  const engine::EntityHandle petal = world.loadout().slots()[0].instances[0];
  for (int index = 0; index < 200; ++index) engine::tick(world, 50.0);
  CHECK(player->health.to_float() > 50.0F);
  const engine::Entity* petal_entity = world.entities().get(petal);
  CHECK(petal_entity == nullptr);
  CHECK(world.loadout().slots()[0].instances[0] != petal);
}

void test_rose_contracts_orbit_and_heals_promptly() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "rose-orbit", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 6);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 6));
  CHECK(engine::spawn_loadout_petals(world) == 1);
  engine::Entity* player = world.entities().get(world.player());
  CHECK(player != nullptr);
  player->health = engine::f32(50.0F);
  world.apply_input(1, engine::f32(0.0F), engine::f32(1.0F));
  engine::tick(world, 50.0);
  CHECK(world.petals()[0].orbit_radius.to_float() == 65.0F);
  world.apply_input(2, engine::f32(0.0F), engine::f32(1.0F));
  engine::tick(world, 50.0);
  CHECK(world.petals()[0].orbit_radius.to_float() == 40.0F);
  world.apply_input(1, engine::f32(0.0F), engine::f32(1.0F));
  // The native timer arms after one second, then the ten-step behavior state
  // advances one step per tick, so the first heal lands in ~1.45 seconds.
  for (int index = 0; index < 25; ++index) engine::tick(world, 50.0);
  CHECK(player->health.to_float() > 50.0F);
  CHECK(player->health.to_float() < 52.0F);
  engine::tick(world, 50.0);
  CHECK(player->health.to_float() < 52.0F);
  engine::tick(world, 50.0);
  CHECK(player->health.to_float() > 55.0F);
}

void test_rose_timer_arms_at_full_health() {
  engine::World world;
  world.initialize();
  CHECK(engine::spawn_player_default(world, "rose-armed", engine::make_default_profile()).valid());
  world.profile().set_inventory(0, 6);
  world.profile().set_inventory_count(1);
  world.loadout().clear();
  CHECK(world.loadout().equip(0, 6));
  CHECK(engine::spawn_loadout_petals(world) == 1);
  engine::Entity* player = world.entities().get(world.player());
  CHECK(player != nullptr);
  // Hold the Rose while healthy long enough to arm the native 1000 ms timer.
  for (int index = 0; index < 25; ++index) engine::tick(world, 50.0);
  player->health = engine::f32(50.0F);
  for (int index = 0; index < 10; ++index) engine::tick(world, 50.0);
  CHECK(player->health.to_float() > 50.0F);
}

void test_petal_recharge() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  CHECK(player.valid());
  world.loadout().equip(0, 2); // Fast: 500 ms recharge, one instance.
  const std::size_t spawned = engine::spawn_loadout_petals(world);
  CHECK(spawned >= 1);
  const engine::EntityHandle petal = world.loadout().slots()[0].instances[0];
  CHECK(petal.valid());
  CHECK(engine::damage_entity(world, petal, engine::f32(1000.0F)).died);
  const engine::Entity* petal_corpse = world.entities().get(petal);
  CHECK(petal_corpse != nullptr);
  CHECK(petal_corpse->death_processed);
  CHECK(world.loadout().slots()[0].recharge_remaining_ms > 0.0);
  const double remaining = world.loadout().slots()[0].recharge_remaining_ms;
  CHECK(remaining == 500.0);
  engine::refresh_loadout_petals(world, 500.0);
  CHECK(world.loadout().slots()[0].instances[0].valid());
  CHECK(world.entities().get(world.loadout().slots()[0].instances[0]) != nullptr);
}


void test_auto_population() {
  engine::WorkerApi api;
  api.init(true);
  std::size_t mobs = 0;
  for (const auto& entity : api.world().entities().entities()) {
    // Count only band-assigned population; special initializers such as the
    // Centipede chain add unbanded children.
    if (entity.active && entity.kind == engine::EntityKind::kMob && entity.spawn_band < 8U) ++mobs;
  }
  CHECK(mobs >= 700);
  CHECK(mobs <= 900);
}

void test_ant_hole_children() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle hole = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 11,
    engine::Vec2(engine::f32(100.0F), engine::f32(100.0F)));
  CHECK(hole.valid());
  std::array<int, 23> counts{};
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob) continue;
    if (entity.type_id < counts.size()) ++counts[entity.type_id];
  }
  CHECK(counts[7] == 3);
  CHECK(counts[8] == 2);
  CHECK(counts[9] == 1);
  CHECK(counts[11] == 1);
}

void test_population_targets() {
  const auto targets = engine::population_targets(engine::f32(50000.0F), engine::f32(4000.0F));
  CHECK(targets[0] == 120);
  CHECK(targets[1] == 120);
  CHECK(targets[2] == 119);
  CHECK(targets[3] == 120);
  CHECK(targets[4] == 119);
  CHECK(targets[5] == 119);
  CHECK(targets[6] == 40);
  CHECK(targets[7] == 40);
}

void test_worker_api_default_spawn() {
  engine::WorkerApi api;
  api.init();
  engine::ByteWriter writer;
  writer.write_varint32(1);
  writer.write_varint32(6);
  for (const char byte : std::string("default")) writer.write_u8(static_cast<std::uint8_t>(byte));
  writer.write_u8(0);
  std::vector<std::uint8_t> packet = writer.bytes();
  const std::array<std::uint8_t, 4> key{0x11, 0x22, 0x33, 0x44};
  engine::apply_packet_xor(packet, key);
  CHECK(api.send(packet, key));
  CHECK(api.world().player().valid());
  CHECK(api.world().player_name() == "default");
  CHECK(api.world().profile().level() == 1);
  CHECK(api.world().profile().inventory_count() == 5);
  CHECK(api.world().loadout().slots()[0].type_id == 1);
  const engine::Entity* entity = api.world().entities().get(api.world().player());
  CHECK(entity != nullptr);
  CHECK(entity->health.to_float() == 100.0F);
  CHECK(entity->collision_radius.to_float() == 25.0F);
  const engine::EntityHandle first = api.world().player();
  const engine::f32 before_x = entity->position.x;
  engine::ByteWriter input;
  input.write_varint32(2);
  input.write_varint32(12);
  input.write_varint32(0);
  input.write_f32_le(0.0F);
  input.write_f32_le(635.0F);
  std::vector<std::uint8_t> input_packet = input.bytes();
  engine::apply_packet_xor(input_packet, key);
  CHECK(api.send(input_packet, key));
  api.think();
  CHECK(entity->position.x.value > before_x.value);
  (void)engine::damage_entity(api.world(), first, entity->health);
  const engine::Entity* first_corpse = api.world().entities().get(first);
  CHECK(first_corpse != nullptr);
  if (first_corpse == nullptr) return;
  CHECK(first_corpse->death_processed);
  CHECK(first_corpse->health.value == 0.0F);
  CHECK(first_corpse->death_time_ms == api.world().time_ms() + 1000.0);
  CHECK(api.world().player() == first);
  engine::ByteWriter respawn;
  respawn.write_varint32(3);
  respawn.write_varint32(6);
  for (const char byte : std::string("default")) respawn.write_u8(static_cast<std::uint8_t>(byte));
  respawn.write_u8(0);
  std::vector<std::uint8_t> respawn_packet = respawn.bytes();
  engine::apply_packet_xor(respawn_packet, key);
  CHECK(api.send(respawn_packet, key));
  // A live corpse still owns the controlled handle, so an early spawn request
  // cannot replace it. The ordinary sweep releases it exactly 1000ms later.
  CHECK(api.world().player() == first);
  CHECK(api.world().entities().get(first)->health.value == 0.0F);
  for (unsigned step = 0; step < 19U; ++step) api.think();
  CHECK(api.world().entities().get(first) != nullptr);
  CHECK(api.world().player() == first);
  CHECK(api.world().time_ms() == first_corpse->death_time_ms - 50.0);
  api.think();
  CHECK(api.world().entities().get(first) == nullptr);
  CHECK(!api.world().player().valid());
  engine::ByteWriter reopen;
  reopen.write_varint32(4);
  reopen.write_varint32(6);
  for (const char byte : std::string("default")) reopen.write_u8(static_cast<std::uint8_t>(byte));
  reopen.write_u8(0);
  std::vector<std::uint8_t> reopen_packet = reopen.bytes();
  engine::apply_packet_xor(reopen_packet, key);
  CHECK(api.send(reopen_packet, key));
  CHECK(api.world().player().valid());
  CHECK(api.world().player() != first);
  CHECK(api.world().entities().get(api.world().player()) != nullptr);
  const engine::EntityHandle second = api.world().player();
  CHECK(api.world().entities().get(second)->health.value > 0.0F);
  engine::ByteWriter suicide;
  suicide.write_varint32(5);
  suicide.write_varint32(3);
  suicide.write_varint32(0);
  std::vector<std::uint8_t> suicide_packet = suicide.bytes();
  engine::apply_packet_xor(suicide_packet, key);
  CHECK(api.send(suicide_packet, key));
  api.think();
  const engine::Entity* second_corpse = api.world().entities().get(second);
  CHECK(second_corpse != nullptr);
  if (second_corpse == nullptr) return;
  CHECK(second_corpse->death_processed);
  CHECK(second_corpse->health.value == 0.0F);
  CHECK(second_corpse->death_time_ms == api.world().time_ms() + 1000.0);
  CHECK(api.world().player() == second);
  for (unsigned step = 0; step < 19U; ++step) api.think();
  CHECK(api.world().entities().get(second) != nullptr);
  CHECK(api.world().player() == second);
  CHECK(api.world().time_ms() == second_corpse->death_time_ms - 50.0);
  api.think();
  CHECK(api.world().entities().get(second) == nullptr);
  CHECK(!api.world().player().valid());
  engine::ByteWriter restart;
  restart.write_varint32(6);
  restart.write_varint32(4);
  std::vector<std::uint8_t> restart_packet = restart.bytes();
  engine::apply_packet_xor(restart_packet, key);
  CHECK(api.send(restart_packet, key));
  CHECK(api.world().player().valid());
  CHECK(api.world().player() != second);
  const engine::Entity* restarted = api.world().entities().get(api.world().player());
  CHECK(restarted != nullptr);
  if (restarted != nullptr) CHECK(restarted->health.value > 0.0F);
}

void test_ai_target_selection() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  engine::Entity* player_entity = world.entities().get(player);
  CHECK(player_entity != nullptr);
  player_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(300.0F), engine::f32(0.0F)));
  engine::Entity* mob_entity = world.entities().get(mob);
  CHECK(mob_entity != nullptr);
  mob_entity->ai.can_alert = true;
  CHECK(mob_entity->ai.enabled);
  CHECK(engine::target_eligible(world, *mob_entity, *player_entity));
  CHECK(engine::find_target(world, mob) == player);
  const std::size_t alerted = engine::alert_nearby(world, player, engine::f32(600.0F));
  CHECK(alerted >= 1);
  CHECK(mob_entity->ai.target == player);
  const engine::EntityHandle drop = engine::spawn_drop(world, 2,
    engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  CHECK(engine::find_pickup_recipient(world, drop) == player);
  player_entity->position = engine::Vec2(engine::f32(5000.0F), engine::f32(0.0F));
  CHECK(!engine::target_eligible(world, *mob_entity, *player_entity));
  const engine::EntityHandle root = engine::controlling_root(world, player);
  CHECK(root == player);
}

void test_collision_layer_filter() {
  engine::Entity owner;
  owner.layer_flags[0] = 1;
  owner.layer_thresholds[0] = 10;
  owner.layer_sides[0] = 2;
  owner.layer_sides_alt[0] = 8;
  CHECK(engine::count_matching_layers(owner, 5, false, 0) == 1);
  CHECK(engine::count_matching_layers(owner, 10, false, 0) == 0);
  CHECK(engine::count_matching_layers(owner, 1, false, 0) == 0);
  CHECK(engine::count_matching_layers(owner, 1, true, 0) == 1);
  CHECK(engine::count_matching_layers(owner, 5, false, 0x40) == 0); // alternate side 8 > 5
  engine::Entity other;
  CHECK(engine::layers_collide(owner, other));
  other.layer_flags[1] = 2;
  other.layer_thresholds[9] = 100;
  other.layer_probe = 5;
  owner.layer_probe = 50;
  CHECK(engine::layers_collide(owner, other));
  other.layer_thresholds[9] = 1;
  owner.layer_thresholds[0] = 1;
  CHECK(!engine::layers_collide(owner, other));
}

void test_status_effects_and_slow() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(100.0F), engine::f32(0.0F)));
  engine::Entity* player_entity = world.entities().get(player);
  CHECK(player_entity != nullptr);
  CHECK(engine::apply_effect(world, player, engine::EffectType::kPoison, engine::f32(10.0F), 1000.0, mob));
  CHECK(engine::has_effect(*player_entity, engine::EffectType::kPoison));
  CHECK(player_entity->effects[0].source == mob);
  CHECK((engine::effect_flags(*player_entity) & 1U) != 0U);
  const engine::f32 before = player_entity->health;
  CHECK(engine::update_effects(world, 100.0) == 1);
  CHECK(player_entity->health.value < before.value);
  CHECK(engine::apply_effect(world, player, engine::EffectType::kHealBlock, engine::f32(1.0F), 1000.0, mob));
  CHECK(engine::blocks_healing(*player_entity));
  const engine::f32 suppressed = player_entity->health;
  CHECK(engine::heal_entity(world, player, engine::f32(10.0F)).value == suppressed.value);
  CHECK(engine::apply_effect(world, player, engine::EffectType::kSlow, engine::f32(0.5F), 1000.0, mob));
  CHECK(std::fabs(engine::slow_multiplier(*player_entity).value - 0.5F) < 1e-6F);
  CHECK((engine::effect_flags(*player_entity) & 6U) == 6U);
  (void)engine::update_effects(world, 2000.0);
  CHECK(!engine::has_effect(*player_entity, engine::EffectType::kPoison));
  CHECK(!engine::has_effect(*player_entity, engine::EffectType::kSlow));
  CHECK(!engine::blocks_healing(*player_entity));
}

void test_attribution_and_legendary() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(100.0F), engine::f32(0.0F)));
  CHECK(player.valid());
  CHECK(mob.valid());
  world.record_hit(mob, player, engine::f32(2.0F), engine::f32(8.0F));
  world.record_hit(mob, player, engine::f32(1.0F), engine::f32(7.0F));
  CHECK(world.hit_events().size() == 1);
  CHECK(world.hit_events()[0].count == 2);
  CHECK(world.hit_events()[0].amount.value == 3.0F);
  (void)engine::damage_entity(world, mob, engine::f32(1000.0F), player);
  const engine::Entity* attributed_corpse = world.entities().get(mob);
  CHECK(attributed_corpse != nullptr);
  CHECK(attributed_corpse->death_processed);
  // The replicated killer-name field belongs to player deaths only (original
  // updateKillerName); a mob dying to the player must not populate it.
  CHECK(!world.last_killer().valid());
  CHECK(world.last_killer_name().empty());
  CHECK(world.profile().level() > 0U || world.profile().experience().value > 0.0F);

  // Legendary (rarity 5) duplicate suppression: another active loadout or an
  // existing pickup of the same type blocks a new drop.
  engine::World legendary_world;
  legendary_world.initialize();
  (void)engine::spawn_player_default(legendary_world, "q", engine::make_default_profile());
  CHECK(legendary_world.loadout().equip(0, 35));
  CHECK(engine::legendary_exists(legendary_world, engine::EntityHandle{}, 35));
  const auto spawned = engine::spawn_loot_drops(legendary_world, {35}, engine::Vec2{},
                                                engine::EntityHandle{});
  CHECK(spawned.empty());
  CHECK(!engine::legendary_exists(legendary_world, legendary_world.player(), 35));
}

void test_loadout_restore_and_backpack() {
  engine::PlayerProfile profile;
  profile.set_level(20);
  profile.set_inventory(0, 1);
  profile.set_inventory(1, 2);
  profile.set_inventory(5, 3);
  profile.set_inventory_count(6);
  engine::PlayerLoadout loadout;
  loadout.restore_from_profile(profile);
  CHECK(loadout.slots()[0].type_id == 1);
  CHECK(loadout.slots()[1].type_id == 2);
  CHECK(loadout.slots()[5].type_id == 3);
  CHECK(loadout.slots()[6].count == 0);
  CHECK(loadout.set_slot_type(profile, 0, 4));
  CHECK(loadout.slots()[0].type_id == 4);
  CHECK(profile.inventory(0) == 4);
  CHECK(!loadout.set_slot_type(profile, 0, 4));

  engine::World world;
  world.initialize();
  (void)engine::spawn_player_default(world, "p", engine::make_default_profile());
  engine::Entity* player = world.entities().get(world.player());
  CHECK(player != nullptr);
  player->position = engine::Vec2{};
  // Original pickup fills a carried slot; full inventory never falls through
  // to the backpack. Keep grace, capacity and strict range failures isolated.
  for (std::uint8_t slot = 0; slot < world.profile().inventory_size(); ++slot) {
    CHECK(world.loadout().equip(slot, 1));
    world.profile().set_inventory(slot, 1);
  }
  world.profile().set_inventory_count(world.profile().inventory_size());
  const auto drop = engine::spawn_drop(world, 2,
    engine::Vec2(engine::f32(65.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  if (!drop.valid()) return;
  const auto free_slot = static_cast<std::uint8_t>(world.profile().inventory_size() - 1U);
  CHECK(world.loadout().discard(free_slot, 1));
  world.profile().set_inventory(free_slot, 0);
  world.set_time_ms(499.0);
  CHECK(engine::collect_drops(world) == 0U);
  CHECK(!world.entities().get(drop)->pickup_collected);
  CHECK(world.loadout().pickup_transfers().empty());

  CHECK(world.loadout().equip(free_slot, 1));
  world.profile().set_inventory(free_slot, 1);
  world.set_time_ms(500.0);
  CHECK(engine::collect_drops(world) == 0U);
  CHECK(!world.entities().get(drop)->pickup_collected);
  CHECK(world.profile().backpack_count() == 0U);
  CHECK(world.loadout().pickup_transfers().empty());

  CHECK(world.loadout().discard(free_slot, 1));
  world.profile().set_inventory(free_slot, 0);
  world.entities().get(drop)->position.x = engine::f32(70.0F);
  CHECK(engine::collect_drops(world) == 0U);
  CHECK(!world.entities().get(drop)->pickup_collected);
  CHECK(world.loadout().pickup_transfers().empty());
  world.entities().get(drop)->position.x = engine::f32(65.0F);
  CHECK(engine::collect_drops(world) == 1U);
  CHECK(world.entities().get(drop)->pickup_collected);
  CHECK(world.loadout().slots()[free_slot].type_id == 2U);
  CHECK(world.profile().inventory(free_slot) == 2U);
  CHECK(world.profile().backpack_count() == 0U);
  CHECK(world.loadout().pickup_transfers().size() == 1U);
  if (world.loadout().pickup_transfers().size() != 1U) return;
  CHECK(world.loadout().pickup_transfers()[0].drop == drop);
  CHECK(world.loadout().pickup_transfers()[0].slot == free_slot);
  CHECK(engine::collect_drops(world) == 0U);
  CHECK(world.loadout().pickup_transfers().size() == 1U);
}

void test_petal_special_effects() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player_default(world, "p", engine::make_default_profile());
  CHECK(player.valid());
  const engine::EntityHandle mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(50.0F), engine::f32(0.0F)));
  engine::Entity* mob_entity = world.entities().get(mob);
  CHECK(mob_entity != nullptr);

  const engine::EntityHandle iris = engine::spawn_petal(world, 8, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(iris.valid());
  if (engine::Entity* petal = world.entities().get(iris)) petal->owner = player.raw;
  engine::on_petal_hit(world, iris, mob, player);
  CHECK(engine::has_effect(*mob_entity, engine::EffectType::kPoison));

  const engine::EntityHandle honey = engine::spawn_petal(world, 31, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(honey.valid());
  if (engine::Entity* petal = world.entities().get(honey)) petal->owner = player.raw;
  engine::on_petal_hit(world, honey, mob, player);
  CHECK(engine::has_effect(*mob_entity, engine::EffectType::kSlow));

  const engine::EntityHandle web = engine::spawn_petal(world, 29, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(web.valid());
  if (engine::Entity* petal = world.entities().get(web)) petal->owner = player.raw;
  engine::on_petal_hit(world, web, mob, player);
  CHECK(engine::has_effect(*mob_entity, engine::EffectType::kSlow));
  bool web_tag = false;
  for (const auto& entity : world.entities().entities())
    if (entity.active && entity.kind == engine::EntityKind::kProjectile && entity.type_id == 29)
      web_tag = true;
  CHECK(web_tag);

  const engine::EntityHandle cactus = engine::spawn_petal(world, 21, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(cactus.valid());
  if (engine::Entity* petal = world.entities().get(cactus)) petal->owner = player.raw;
  engine::on_petal_incoming_hit(world, cactus, mob);
  CHECK(engine::has_effect(*mob_entity, engine::EffectType::kPoison));

  const engine::EntityHandle peas = engine::spawn_petal(world, 11, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(peas.valid());
  if (engine::Entity* petal = world.entities().get(peas)) petal->owner = player.raw;
  const std::size_t before = world.entities().active_count();
  engine::on_petal_hit(world, peas, mob, player);
  CHECK(world.entities().get(peas) == nullptr);
  CHECK(world.entities().active_count() >= before + 3); // four children minus the consumed petal

  const engine::EntityHandle egg = engine::spawn_petal(world, 22, engine::Vec2{},
    engine::f32(65.0F), engine::f32(0.0F), 0, 0, 1);
  CHECK(egg.valid());
  if (engine::Entity* petal = world.entities().get(egg)) {
    petal->owner = player.raw;
    petal->behavior_cooldown_ms = 0.0;
  }
  engine::update_petal_behaviors(world, 16.0);
  CHECK(world.entities().get(egg) == nullptr);
  bool hatched = false;
  for (const auto& entity : world.entities().entities())
    if (entity.active && entity.kind == engine::EntityKind::kMob && entity.type_id == 9) hatched = true;
  CHECK(hatched);
}

void test_domain_profile_snapshot() {
  engine::WorkerApi api;
  api.init(false);
  api.set_default_dense_groups(false);
  CHECK(engine::spawn_player_default(api.world(), "profile", engine::make_default_profile(), false).valid());
  CHECK(api.world().profile().level() == 1U);
  api.world().profile().set_experience(engine::f32(3.0F));
  api.world().loadout().set_score(engine::f32(3.0F));
  const auto bytes = api.domain_snapshot_bytes(42, 0);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1U);
  (void)reader.read_varint32(); // sequence
  (void)reader.read_varint32(); // ack
  CHECK(reader.read_varint32().value() == 0U);
  CHECK(reader.read_varint32().value() == 5U); // base + XP + score + level + loadout
  CHECK(reader.read_varint32().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  (void)reader.read_varint32(); (void)reader.read_u8();
  (void)reader.read_varint32(); (void)reader.read_f32_le();
  (void)reader.read_varint32(); (void)reader.read_f32_le(); // radius 7
  (void)reader.read_varint32(); (void)reader.read_u16_le();
  (void)reader.read_varint32(); (void)reader.read_f32_le();
  (void)reader.read_varint32(); (void)reader.read_u8();
  (void)reader.read_varint32(); (void)reader.read_f32_le(); // visual y 28
  (void)reader.read_varint32(); (void)reader.read_u8();
  (void)reader.read_varint32(); (void)reader.read_u8(); // lifecycle 38
  (void)reader.read_varint32(); (void)reader.read_f32_le(); // visual x 49
  (void)reader.read_varint32(); (void)reader.read_f32_le();
  (void)reader.read_varint32(); (void)reader.read_f32_le();
  CHECK(reader.read_u8().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  CHECK(reader.read_varint32().value() == 58U);
  CHECK(reader.read_varint32().value() == 49151U); // trunc(3*65535/4)
  CHECK(reader.read_u8().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  CHECK(reader.read_varint32().value() == 59U);
  CHECK(reader.read_f32_le().value() == 3.0F);
  CHECK(reader.read_u8().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  CHECK(reader.read_varint32().value() == 62U);
  CHECK(reader.read_u8().value() == 1U);
  CHECK(reader.read_u8().value() == 0U);
  (void)reader.read_u32_le(); (void)reader.read_u8(); (void)reader.read_u32_le();
  CHECK(reader.read_varint32().value() == 60U);
  for (unsigned slot = 0; slot < 16; ++slot) {
    CHECK(reader.read_varint32().value() == 1U);
    CHECK(reader.read_u8().value() == (slot < 5 ? 1U : 0U));
  }
  CHECK(reader.read_varint32().value() == 0U);
  CHECK(reader.read_varint32().value() == 1U); // field 61
  for (unsigned slot = 0; slot < 8; ++slot) {
    CHECK(reader.read_varint32().value() == 1U);
    CHECK(reader.read_varint32().value() == 0U); // before first loadout tick
  }
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.eof());
}

void test_player_loadout_replication() {
  engine::WorkerApi api;
  api.init(false);
  api.set_default_dense_groups(false);
  auto profile = engine::make_default_profile();
  profile.set_inventory(9U, 3U); // reserve type survives profile restoration
  const auto player = engine::spawn_player_default(api.world(), "inventory", profile, false);
  CHECK(player.valid());
  CHECK(api.world().loadout().slots()[9].type_id == 3U);
  (void)engine::refresh_loadout_petals(api.world(), 0.0);
  const auto basic = api.world().loadout().handle(0U, 0U);
  CHECK(basic.valid());
  CHECK(api.world().entities().get(basic)->radius.value == 14.0F);
  CHECK(api.world().entities().get(basic)->collision_radius.value == 10.0F);
  struct Values {
    unsigned score_count = 0, inventory_count = 0, recharge_count = 0;
    float score = -1.0F;
    std::array<std::uint8_t, 16> inventory{};
    std::array<std::uint16_t, 8> recharge{};
  };
  const auto decode = [&api, player, basic](std::uint32_t sequence) {
    Values values;
    const auto bytes = api.domain_snapshot_bytes(sequence, 0U);
    engine::ByteReader reader(bytes);
    (void)reader.read_u8(); (void)reader.read_varint32(); (void)reader.read_varint32();
    CHECK(reader.read_varint32().value() == 0U);
    const auto records = reader.read_varint32().value();
    CHECK(reader.read_varint32().value() == 0U);
    for (unsigned record = 0; record < records; ++record) {
      const auto handle = engine::EntityHandle::from_wire(reader.read_u32_le().value());
      CHECK(reader.read_u8().value() == 55U);
      (void)reader.read_u32_le();
      unsigned field = 0;
      for (auto delta = reader.read_varint32().value(); delta != 0U; delta = reader.read_varint32().value()) {
        field += delta;
        if (field == 60U || field == 61U) {
          CHECK(handle == player);
          unsigned slot = 0;
          for (auto index_delta = reader.read_varint32().value(); index_delta != 0U;
               index_delta = reader.read_varint32().value()) {
            slot += index_delta;
            if (field == 60U) {
              CHECK(slot <= 16U);
              values.inventory[slot - 1U] = reader.read_u8().value();
              ++values.inventory_count;
            } else {
              CHECK(slot <= 8U);
              values.recharge[slot - 1U] = reader.read_varint32().value();
              ++values.recharge_count;
            }
          }
        } else if (field == 8U) (void)reader.read_u16_le();
        else if (field == 58U) (void)reader.read_varint32();
        else if (field == 2U || field == 11U || field == 12U || field == 26U || field == 31U || field == 36U || field == 38U || field == 62U)
          (void)reader.read_u8();
        else {
          const auto value = reader.read_f32_le().value();
          if (field == 59U) { CHECK(handle == player); values.score = value; ++values.score_count; }
          if (field == 7U && handle == basic) CHECK(value == 10.0F);
        }
      }
    }
    CHECK(reader.error() == engine::ParseError::kNone);
    CHECK(reader.eof());
    return values;
  };
  auto values = decode(1U);
  CHECK(values.inventory_count == 16U && values.inventory[9] == 3U);
  CHECK(values.recharge_count == 8U && values.recharge[0] == 65535U);
  CHECK(values.score_count == 1U && values.score == 0.0F);
  values = decode(2U);
  CHECK(values.inventory_count == 0U && values.recharge_count == 0U && values.score_count == 0U);
  api.world().loadout().set_score(engine::f32(3.0F));
  values = decode(3U);
  CHECK(values.score_count == 1U && values.score == 3.0F);
  for (unsigned i = 4U; i <= 10U; ++i) CHECK(decode(i).score_count == 0U);
  CHECK(engine::on_petal_destroyed(api.world(), basic));
  CHECK(api.world().destroy(basic));
  (void)engine::refresh_loadout_petals(api.world(), 50.0);
  values = decode(11U);
  CHECK(values.inventory_count == 0U); // inventory remains authoritative during cooldown
  CHECK(values.recharge_count == 8U && values.recharge[0] == 1310U);
  CHECK(!api.world().loadout().handle(0U, 0U).valid());
  (void)engine::refresh_loadout_petals(api.world(), 1200.0);
  CHECK(decode(12U).recharge[0] == 32767U);
  (void)engine::refresh_loadout_petals(api.world(), 1250.0);
  CHECK(decode(13U).recharge[0] == 65535U);
  CHECK(api.world().loadout().handle(0U, 0U).valid());
  for (std::uint8_t slot = 0; slot < 16U; ++slot) {
    const auto type = api.world().loadout().slots()[slot].type_id;
    if (type != 0U) CHECK(api.world().loadout().discard(api.world().profile(), slot, type));
  }
  api.world().loadout().set_score(engine::f32(0.0F));
  values = decode(14U);
  CHECK(values.inventory_count == 16U);
  for (const auto type : values.inventory) CHECK(type == 0U);
  CHECK(values.score_count == 1U && values.score == 0.0F);
  // Original aggregation takes the least ready missing instance, rather than
  // hiding recharge behind any one surviving petal in a multi-instance slot.
  CHECK(api.world().loadout().equip(0U, 17U));
  api.world().loadout().slots()[0].recharge_remaining_ms = 250.0;
  api.world().loadout().set_pending(0U, 1U, true);
  api.world().loadout().set_pending_timer(0U, 1U, 2000U);
  api.world().loadout().refresh_recharge_progress(api.world());
  values = decode(15U);
  CHECK(values.inventory[0] == 17U);
  CHECK(values.recharge[0] == 13107U);
}

void test_snapshot_angle_quantization() {
  // Values captured from original func94's new-angle packet (8555152).
  CHECK(engine::pack_snapshot_angle(1.0) == 10430U);
  CHECK(engine::pack_snapshot_angle(0.0) == 0U);
  CHECK(engine::pack_snapshot_angle(0.00005) == 0U);
  CHECK(engine::pack_snapshot_angle(-1.0) == 55104U);
  CHECK(engine::pack_snapshot_angle(3.141592653589793) == 32767U);
  CHECK(engine::pack_snapshot_angle(-3.141592653589793) == 32767U);
  CHECK(engine::pack_snapshot_angle(6.283185307179586) == 0U);
  CHECK(engine::pack_snapshot_angle(-0.00005) == 65534U);
}

void test_camera_snapshot_deltas() {
  engine::WorkerApi api;
  api.init(false);
  const auto handle = api.spawn(engine::EntityKind::kMob, 4U,
    engine::Vec2(engine::f32(7.0F), engine::f32(8.0F)));
  const auto check = [&api](unsigned sequence, bool camera_x, bool camera_y, bool dense_expected, bool angle_expected = false) {
    const auto bytes = api.domain_snapshot_bytes(sequence, 0U);
    engine::ByteReader reader(bytes);
    (void)reader.read_u8(); (void)reader.read_varint32(); (void)reader.read_varint32();
    CHECK(reader.read_varint32().value() == 0U);
    CHECK(reader.read_varint32().value() == (dense_expected ? 2U : 1U));
    CHECK(reader.read_varint32().value() == 0U);
    (void)reader.read_u32_le(); CHECK(reader.read_u8().value() == 55U); (void)reader.read_u32_le();
    unsigned field = 0;
    bool seen_x = false, seen_y = false, visual_x = false, visual_y = false, seen_angle = false;
    for (auto delta = reader.read_varint32().value(); delta != 0U; delta = reader.read_varint32().value()) {
      field += delta;
      if (field == 8U) { (void)reader.read_u16_le(); seen_angle = true; }
      else if (field == 2U || field == 26U || field == 31U || field == 36U || field == 38U) (void)reader.read_u8();
      else {
        (void)reader.read_f32_le();
        if (field == 5U) seen_x = true;
        if (field == 24U) seen_y = true;
        if (field == 28U) visual_y = true;
        if (field == 49U) visual_x = true;
      }
    }
    CHECK(seen_x == camera_x && seen_y == camera_y);
    CHECK(visual_x == camera_x && visual_y == camera_y);
    CHECK(seen_angle == angle_expected);
    if (dense_expected) {
      (void)reader.read_u32_le(); CHECK(reader.read_u8().value() == 62U);
      for (unsigned i = 0; i < 63U; ++i) (void)reader.read_u8();
    }
    CHECK(reader.error() == engine::ParseError::kNone);
    CHECK(reader.eof());
  };
  check(1U, true, true, true, true);
  check(2U, false, false, false);
  api.world().entities().get(handle)->position.y = engine::f32(9.0F);
  check(3U, false, true, false);
  api.world().entities().get(handle)->position.x = engine::f32(6.0F);
  check(4U, true, false, false);
  api.world().entities().get(handle)->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  check(5U, true, true, false);
  api.world().entities().get(handle)->position.x = engine::f32(-0.0F);
  check(6U, true, false, false);
  api.world().entities().get(handle)->angle = engine::f32(1.0F);
  check(7U, false, false, false, true);
  api.world().entities().get(handle)->angle = engine::f32(1.000001F);
  check(8U, false, false, false); // different scalar, same encoded u16
  api.world().entities().get(handle)->angle = engine::f32(2.0F);
  api.world().entities().get(handle)->position = engine::Vec2(engine::f32(3.0F), engine::f32(4.0F));
  check(9U, true, true, true, true);
}

void test_pickup_transfer_snapshot() {
  engine::WorkerApi api;
  api.init(false);
  CHECK(engine::spawn_player(api.world(), "pickup", engine::Vec2{}, engine::PlayerConfig{}).valid());
  const auto drop = engine::spawn_drop(api.world(), 2U, engine::Vec2{});
  CHECK(drop.valid());
  (void)api.domain_snapshot_bytes(1U, 0U);
  // simulation-tick.mjs:925 gates collection at spawn+500ms. The first
  // nine snapshots must retain the drop without publishing a transfer.
  for (std::uint32_t sequence = 2U; sequence <= 10U; ++sequence) {
    api.think();
    const auto waiting = api.domain_snapshot_bytes(sequence, 0U);
    engine::ByteReader waiting_header(waiting);
    (void)waiting_header.read_u8(); (void)waiting_header.read_varint32();
    (void)waiting_header.read_varint32();
    CHECK(waiting_header.read_varint32().value() == 0U);
    CHECK(waiting_header.read_varint32().value() > 0U);
    CHECK(waiting_header.read_varint32().value() == 0U);
    CHECK(!api.world().entities().get(drop)->pickup_collected);
  }
  api.think();
  const auto bytes = api.domain_snapshot_bytes(11U, 0U);
  engine::ByteReader header(bytes);
  (void)header.read_u8(); (void)header.read_varint32(); (void)header.read_varint32();
  CHECK(header.read_varint32().value() == 0U);
  (void)header.read_varint32();
  CHECK(header.read_varint32().value() == 1U);
  engine::ByteReader event(std::span<const std::uint8_t>(bytes).last(6U));
  CHECK(event.read_u8().value() == 14U);
  CHECK(event.read_u32_le().value() == drop.to_wire());
  CHECK(event.read_u8().value() == 0U);
  CHECK(event.eof());
  CHECK(api.world().entities().get(drop)->pickup_collected);
  CHECK(api.world().loadout().slots()[0].type_id == 2U);
  CHECK(api.world().loadout().pickup_transfers().empty());
  const auto next = api.domain_snapshot_bytes(12U, 0U);
  engine::ByteReader next_header(next);
  (void)next_header.read_u8(); (void)next_header.read_varint32(); (void)next_header.read_varint32();
  (void)next_header.read_varint32(); (void)next_header.read_varint32();
  CHECK(next_header.read_varint32().value() == 0U);
}

void test_domain_boot_visibility() {
  engine::WorkerApi api;
  api.init(true);
  const auto population = api.world().entities().active_count();
  CHECK(population > 800U);
  for (std::uint32_t sequence = 1; sequence <= 3; ++sequence) {
    api.think();
    const auto bytes = api.domain_snapshot_bytes(sequence, 0U);
    engine::ByteReader reader(bytes);
    CHECK(reader.read_u8().value() == 1U);
    CHECK(reader.read_varint32().value() == sequence);
    CHECK(reader.read_varint32().value() == 0U);
    CHECK(reader.read_varint32().value() == 0U); // deletes
    CHECK(reader.read_varint32().value() == 0U); // spatial updates
    CHECK(reader.read_varint32().value() == 0U); // spatial events
    CHECK(api.world().entities().active_count() == population);
  }
  const std::array<std::uint8_t, 3> spawn_packet{{1U, 6U, 0U}};
  CHECK(api.send(spawn_packet, {}));
  api.think();
  const auto player = api.world().player();
  const auto* controlled = api.world().entities().get(player);
  CHECK(controlled != nullptr);
  if (controlled == nullptr) return;
  CHECK(controlled->health.value > 0.0F);
  // Original beginSnapshot uses the live viewer's f32 rectangle, not every
  // simulated body. Compare exact membership, independently of wire count:
  // one handle may have base, dense, profile and loadout records.
  const engine::f32 width = engine::f32(1920.0F) / engine::f32(0.9F) + engine::f32(200.0F);
  const engine::f32 height = engine::f32(1080.0F) / engine::f32(0.9F) + engine::f32(200.0F);
  const engine::f32 left = width * engine::f32(-0.5F) + controlled->position.x;
  const engine::f32 top = height * engine::f32(-0.5F) + controlled->position.y;
  const engine::Aabb query{left, top, left + width, top + height};
  std::set<std::uint32_t> expected{player.raw};
  unsigned nearby_mobs = 0U, remote_mobs = 0U;
  for (const auto& entity : api.world().entities().entities()) {
    if (!entity.active) continue;
    const auto bounds = engine::collision_bounds(api.world(), entity.handle);
    const bool intersects = engine::Aabb{bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y}.intersects(query);
    if (intersects) expected.insert(entity.handle.raw);
    if (entity.kind == engine::EntityKind::kMob) {
      if (intersects) ++nearby_mobs;
      else ++remote_mobs;
    }
  }
  CHECK(nearby_mobs > 0U && remote_mobs > 0U);
  CHECK(expected.size() < api.world().entities().active_count());
  const auto bytes = api.domain_snapshot_bytes(4U, 0U);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1U);
  CHECK(reader.read_varint32().value() == 4U);
  CHECK(reader.read_varint32().value() == 0U);
  CHECK(reader.read_varint32().value() == 0U);
  const auto records = reader.read_varint32().value();
  CHECK(reader.read_varint32().value() == 0U);
  std::set<std::uint32_t> introduced;
  unsigned dense_records = 0U, base_records = 0U;
  for (std::uint32_t index = 0; index < records; ++index) {
    const auto handle = engine::EntityHandle::from_wire(reader.read_u32_le().value());
    CHECK(expected.contains(handle.raw));
    introduced.insert(handle.raw);
    const auto flags = reader.read_u8().value() ^ 54U;
    if (flags == 8U) {
      CHECK(reader.read_bytes(63U).size() == 63U);
      ++dense_records;
      continue;
    }
    CHECK(flags == 1U);
    if (flags != 1U) return;
    CHECK(reader.read_u32_le().value() == engine::OriginalSnapshotWriter::kDefaultDenseComponentMask);
    std::uint32_t field = 0U;
    for (auto delta = reader.read_varint32().value(); delta != 0U;
         delta = reader.read_varint32().value()) {
      field += delta;
      switch (field) {
        case 2: ++base_records; [[fallthrough]];
        case 11: case 12: case 22: case 26: case 31: case 36: case 38: case 54: case 62:
          (void)reader.read_u8().value(); break;
        case 5: case 7: case 24: case 28: case 49: case 53: case 55: case 59:
          (void)reader.read_f32_le().value(); break;
        case 8: (void)reader.read_u16_le().value(); break;
        case 58: (void)reader.read_varint32().value(); break;
        case 60: case 61:
          for (auto step = reader.read_varint32().value(); step != 0U;
               step = reader.read_varint32().value()) {
            if (field == 60U) (void)reader.read_u8().value();
            else (void)reader.read_varint32().value();
          }
          break;
        default: CHECK(false); return;
      }
    }
  }
  CHECK(introduced == expected);
  CHECK(base_records == expected.size());
  CHECK(dense_records == expected.size());
  CHECK(reader.error() == engine::ParseError::kNone && reader.eof());
}

void test_domain_snapshot() {
  engine::WorkerApi api;
  api.init();
  api.set_default_dense_groups(false);
  const engine::EntityHandle mob = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(123.0F), engine::f32(-45.0F)));
  CHECK(mob.valid());
  engine::Entity* entity = api.world().entities().get(mob);
  entity->health = engine::f32(17.0F);
  entity->max_health = engine::f32(25.0F);
  api.world().record_hit(mob, mob, engine::f32(3.0F), engine::f32(17.0F));
  const auto bytes = api.domain_snapshot_bytes(42, 7);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 42);
  CHECK(reader.read_varint32().value() == 7);
  CHECK(reader.read_varint32().value() == 0); // deletes
  CHECK(reader.read_varint32().value() == 1); // updates
  CHECK(reader.read_varint32().value() == 1); // hit clock only; event 14 is a slot transfer
  CHECK(reader.read_u32_le().value() == mob.to_wire());
  CHECK(reader.read_u8().value() == 55); // mask
  constexpr std::uint32_t kMask = (1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29);
  CHECK(reader.read_u32_le().value() == kMask);
  CHECK(reader.read_varint32().value() == 2);
  CHECK(reader.read_u8().value() == 4); // species id
  CHECK(reader.read_varint32().value() == 3);
  CHECK(reader.read_f32_le().value() == 123.0F);
  CHECK(reader.read_varint32().value() == 2); // field 7: radius
  CHECK(reader.read_f32_le().value() == entity->radius.value);
  CHECK(reader.read_varint32().value() == 1);
  (void)reader.read_u16_le(); // angle raw
  CHECK(reader.read_varint32().value() == 16);
  CHECK(reader.read_f32_le().value() == -45.0F);
  CHECK(reader.read_varint32().value() == 2);
  CHECK(reader.read_u8().value() == 2); // domain kind = mob
  CHECK(reader.read_varint32().value() == 2); // field 28: visual y
  CHECK(reader.read_f32_le().value() == -45.0F);
  CHECK(reader.read_varint32().value() == 3);
  (void)reader.read_u8(); // variant
  CHECK(reader.read_varint32().value() == 5); // field 36: activity
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.read_varint32().value() == 2); // field 38: lifecycle
  CHECK(reader.read_u8().value() == 0U);
  CHECK(reader.read_varint32().value() == 11); // field 49: visual x
  CHECK(reader.read_f32_le().value() == 123.0F);
  CHECK(reader.read_varint32().value() == 4);
  CHECK(reader.read_f32_le().value() == 17.0F);
  CHECK(reader.read_varint32().value() == 2);
  CHECK(reader.read_f32_le().value() == 25.0F);
  CHECK(reader.read_u8().value() == 0);
  CHECK(reader.read_u8().value() == 11); // hit event opcode
  CHECK(reader.read_u32_le().value() == mob.to_wire());
  CHECK(reader.eof());
}


void test_ai_family_profiles() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle lady = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(lady.valid());
  engine::Entity* lady_entity = world.entities().get(lady);
  CHECK(lady_entity != nullptr);
  CHECK(lady_entity->ai.family == engine::AiFamily::kLadybug);
  CHECK(lady_entity->health.value == 25.0F);
  CHECK(lady_entity->radius.value == 30.0F);
  CHECK(lady_entity->contact_damage.value == 10.0F);
  CHECK(lady_entity->ai.wave_frequency.value == 0.002F);
  CHECK(lady_entity->ai.radius.value == 1000.0F);
  CHECK(std::fabs(static_cast<float>(lady_entity->ai.timer_interval_ms) - 3141.5927F) < 0.01F);

  const engine::EntityHandle massive = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 5, engine::Vec2(engine::f32(10.0F), engine::f32(0.0F)));
  engine::Entity* massive_entity = world.entities().get(massive);
  CHECK(massive_entity != nullptr);
  CHECK(massive_entity->health.value == 1000.0F);
  CHECK(massive_entity->radius.value == 120.0F);
  CHECK(massive_entity->ai.wave_frequency.value == 0.001F);
  CHECK(massive_entity->ai.idle_speed.value == 0.2F);

  const engine::EntityHandle dark = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 20, engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)));
  engine::Entity* dark_entity = world.entities().get(dark);
  CHECK(dark_entity != nullptr);
  CHECK(dark_entity->health.value == 35.0F);
  CHECK(dark_entity->ai.variant == 1U);
  CHECK(dark_entity->ai.worker);

  const engine::EntityHandle baby = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 7, engine::Vec2(engine::f32(30.0F), engine::f32(0.0F)));
  engine::Entity* baby_entity = world.entities().get(baby);
  CHECK(baby_entity != nullptr);
  CHECK(baby_entity->health.value == 10.0F);
  CHECK(baby_entity->radius.value == 14.0F);
  CHECK(baby_entity->ai.variant == 0U);
  CHECK(baby_entity->ai.wave_frequency.value >= 0.0018F && baby_entity->ai.wave_frequency.value <= 0.00221F);

  const engine::EntityHandle soldier = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 9, engine::Vec2(engine::f32(40.0F), engine::f32(0.0F)));
  engine::Entity* soldier_entity = world.entities().get(soldier);
  CHECK(soldier_entity != nullptr);
  CHECK(soldier_entity->health.value == 40.0F);
  CHECK(soldier_entity->radius.value == 20.0F);
  CHECK(soldier_entity->ai.soldier);
  CHECK(soldier_entity->ai.radius.value == 300.0F);
  CHECK(soldier_entity->ai.territory.value == 0.3F);

  const engine::EntityHandle queen = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 10, engine::Vec2(engine::f32(50.0F), engine::f32(0.0F)));
  engine::Entity* queen_entity = world.entities().get(queen);
  CHECK(queen_entity != nullptr);
  CHECK(queen_entity->health.value == 200.0F);
  CHECK(queen_entity->radius.value == 40.0F);
  CHECK(queen_entity->ai.radius.value == 400.0F);

  const engine::EntityHandle beetle = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 12, engine::Vec2(engine::f32(60.0F), engine::f32(0.0F)));
  engine::Entity* beetle_entity = world.entities().get(beetle);
  CHECK(beetle_entity != nullptr);
  CHECK(beetle_entity->health.value == 40.0F);
  CHECK(beetle_entity->radius.value == 40.0F);
  CHECK(beetle_entity->contact_damage.value == 30.0F);
  CHECK(beetle_entity->ai.radius.value == 600.0F);

  const engine::EntityHandle massive_beetle = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 13, engine::Vec2(engine::f32(70.0F), engine::f32(0.0F)));
  engine::Entity* massive_beetle_entity = world.entities().get(massive_beetle);
  CHECK(massive_beetle_entity != nullptr);
  CHECK(massive_beetle_entity->health.value == 300.0F);
  CHECK(massive_beetle_entity->radius.value == 80.0F);
  CHECK(massive_beetle_entity->contact_damage.value == 20.0F);
  CHECK(massive_beetle_entity->ai.idle_speed.value == 1.1F);

  const engine::EntityHandle centipede = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 15, engine::Vec2(engine::f32(80.0F), engine::f32(0.0F)));
  engine::Entity* centipede_entity = world.entities().get(centipede);
  CHECK(centipede_entity != nullptr);
  CHECK(centipede_entity->health.value == 50.0F);
  CHECK(centipede_entity->radius.value == 35.0F);
  CHECK(centipede_entity->ai.family == engine::AiFamily::kCentipede);
  CHECK(centipede_entity->ai.head);
  CHECK(centipede_entity->ai.evil == false);
  // The recovered initializer links a chain, so each segment owns the next.
  std::size_t chain = 0;
  engine::EntityHandle cursor = centipede;
  while (true) {
    engine::Entity* node = world.entities().get(cursor);
    if (node == nullptr || node->children.empty()) break;
    cursor = node->children.front();
    ++chain;
    if (chain > 64U) break;
  }
  CHECK(chain == 9U || chain == 49U);
  if (chain > 0U) {
    const engine::EntityHandle first_segment = world.entities().get(centipede)->children.front();
    engine::Entity* segment = world.entities().get(first_segment);
    CHECK(segment != nullptr);
    CHECK(segment->type_id == 16U);
    CHECK(segment->owner == centipede.raw);
  }

  const engine::EntityHandle evil = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 17, engine::Vec2(engine::f32(3000.0F), engine::f32(0.0F)));
  engine::Entity* evil_entity = world.entities().get(evil);
  CHECK(evil_entity != nullptr);
  CHECK(evil_entity->ai.evil);
  CHECK(evil_entity->ai.radius.value == 600.0F);
}

void test_quadtree_compaction_order() {
  const engine::Aabb arena{engine::f32(0.0F), engine::f32(0.0F), engine::f32(100.0F), engine::f32(100.0F)};
  engine::QuadTree tree(arena, 4, 9);
  const auto box = [](float x, float y) {
    return engine::Aabb{engine::f32(x), engine::f32(y), engine::f32(x + 1.0F), engine::f32(y + 1.0F)};
  };
  tree.insert(0, box(10.0F, 10.0F));
  tree.insert(1, box(60.0F, 10.0F));
  tree.insert(2, box(10.0F, 60.0F));
  tree.insert(3, box(60.0F, 60.0F));
  tree.insert(4, box(49.5F, 49.5F)); // stays at parent across both split planes
  CHECK(tree.node_count() == 5U);
  tree.compact();
  CHECK(tree.node_count() == 5U); // five cannot merge
  tree.remove(4);
  tree.compact();
  CHECK(tree.node_count() == 1U);
  std::vector<std::size_t> order;
  tree.query(arena, order);
  CHECK((order == std::vector<std::size_t>{0U, 1U, 2U, 3U}));
  // A later split can reuse the released nodes without stale locations/items.
  tree.insert(4, box(49.5F, 49.5F));
  CHECK(tree.node_count() == 5U);
  tree.query(arena, order);
  CHECK((order == std::vector<std::size_t>{4U, 0U, 2U, 1U, 3U}));
  tree.update(1, box(11.0F, 11.0F));
  tree.remove(4);
  tree.compact();
  tree.query(arena, order);
  std::sort(order.begin(), order.end());
  CHECK((order == std::vector<std::size_t>{0U, 1U, 2U, 3U}));
  CHECK(tree.size() == 4U);
}

void test_quadtree_order_and_collision_bounds() {
  engine::QuadTree tree(engine::Aabb{engine::f32(0.0F), engine::f32(0.0F),
                                     engine::f32(100.0F), engine::f32(100.0F)}, 1, 4);
  tree.insert(0, engine::Aabb{engine::f32(10.0F), engine::f32(10.0F),
                              engine::f32(20.0F), engine::f32(20.0F)});
  tree.insert(1, engine::Aabb{engine::f32(60.0F), engine::f32(10.0F),
                              engine::f32(70.0F), engine::f32(20.0F)});
  tree.insert(2, engine::Aabb{engine::f32(10.0F), engine::f32(60.0F),
                              engine::f32(20.0F), engine::f32(70.0F)});
  tree.insert(3, engine::Aabb{engine::f32(60.0F), engine::f32(60.0F),
                              engine::f32(70.0F), engine::f32(70.0F)});
  std::vector<std::size_t> order;
  tree.query(engine::Aabb{engine::f32(0.0F), engine::f32(0.0F),
                          engine::f32(100.0F), engine::f32(100.0F)}, order);
  CHECK(order.size() == 4U);
  const std::vector<std::size_t> expected{0U, 2U, 1U, 3U};
  CHECK(order == expected);

  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player(
    world, "bounds", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  const engine::EntityHandle child = engine::spawn_entity(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(30.0F), engine::f32(0.0F)),
    engine::f32(10.0F));
  engine::Entity* child_entity = world.entities().get(child);
  CHECK(child_entity != nullptr);
  child_entity->owner = player.raw;
  engine::attach_child(world, player, child);
  engine::invalidate_bounds(world, player);
  const engine::EntityBounds bounds = engine::collision_bounds(world, player);
  CHECK(bounds.valid);
  CHECK(bounds.min_x.value == -25.0F);
  CHECK(bounds.max_x.value == 40.0F);
  CHECK(bounds.min_y.value == -25.0F);
  CHECK(bounds.max_y.value == 25.0F);

  child_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(30.0F));
  engine::invalidate_bounds(world, child);
  const engine::EntityBounds moved = engine::collision_bounds(world, player);
  CHECK(moved.max_y.value == 40.0F);
  engine::detach_child(world, player, child);
  const engine::EntityBounds detached = engine::collision_bounds(world, player);
  CHECK(detached.max_y.value == 25.0F);
}

void test_area_effects_and_deferred_launch() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player(
    world, "area", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  CHECK(player.valid());
  const engine::EntityHandle inside = engine::spawn_entity(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(10.0F), engine::f32(0.0F)),
    engine::f32(10.0F));
  const engine::EntityHandle outside = engine::spawn_entity(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(200.0F), engine::f32(0.0F)),
    engine::f32(10.0F));
  world.entities().get(inside)->health = engine::f32(100.0F);
  world.entities().get(inside)->max_health = engine::f32(100.0F);
  const auto payload = engine::add_area_effect(world, player, engine::f32(50.0F),
                                               engine::EffectType::kPoison, engine::f32(10.0F),
                                               1000.0);
  CHECK(payload != nullptr);
  CHECK(world.area_effects().size() == 1U);
  (void)world.update_area_effects();
  CHECK(engine::has_effect(*world.entities().get(inside), engine::EffectType::kPoison));
  CHECK(!engine::has_effect(*world.entities().get(outside), engine::EffectType::kPoison));
  CHECK(payload->refcount >= 2U);

  const float health_before = world.entities().get(inside)->health.value;
  (void)engine::update_effects(world, 100.0);
  CHECK(world.entities().get(inside)->health.value < health_before);
  (void)engine::update_effects(world, 1000.0);
  CHECK(!engine::has_effect(*world.entities().get(inside), engine::EffectType::kPoison));

  // Re-create the area and move the target outside; the next target pass must
  // detach the shared payload.
  const auto second = engine::add_area_effect(world, player, engine::f32(50.0F),
                                              engine::EffectType::kSlow, engine::f32(0.5F),
                                              4000.0);
  CHECK(second != nullptr);
  (void)world.update_area_effects();
  CHECK(engine::has_effect(*world.entities().get(inside), engine::EffectType::kSlow));
  world.entities().get(inside)->position = engine::Vec2(engine::f32(300.0F), engine::f32(0.0F));
  (void)world.update_area_effects();
  CHECK(!engine::has_effect(*world.entities().get(inside), engine::EffectType::kSlow));

  std::vector<engine::EntityHandle> children;
  for (std::uint32_t index = 0; index < 4U; ++index) {
    const engine::EntityHandle child = engine::spawn_entity(
      world, engine::EntityKind::kPetal, 11, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)),
      engine::f32(5.0F));
    CHECK(child.valid());
    children.push_back(child);
  }
  world.schedule_deferred_launch(0.0, engine::f32(0.0F), children);
  CHECK(world.deferred_launches().size() == 1U);
  CHECK(world.run_deferred_launches(0.0) == 1U);
  CHECK(world.deferred_launches().empty());
  CHECK(std::fabs(world.entities().get(children[0])->position.y.value - 1.4F) < 0.01F);
}

void test_attribution_death_and_pickups() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "hero", engine::make_default_profile(), false);
  CHECK(player.valid());
  (void)engine::spawn_loadout_petals(world);
  CHECK(!world.petals().empty());
  world.loadout().set_score(engine::f32(123.0F));
  world.profile().set_level(7);

  const engine::EntityHandle attacker = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(50.0F), engine::f32(0.0F)));
  CHECK(attacker.valid());
  const std::size_t petal_count = world.petals().size();
  std::vector<engine::EntityHandle> owned_petals;
  for (const auto& petal : world.petals()) owned_petals.push_back(petal.handle);
  (void)engine::damage_entity(world, player, world.entities().get(player)->health, attacker);
  const engine::Entity* player_corpse = world.entities().get(player);
  CHECK(player_corpse != nullptr);
  if (player_corpse == nullptr) return;
  CHECK(player_corpse->death_processed);
  CHECK(player_corpse->health.value == 0.0F);
  CHECK(player_corpse->death_time_ms == world.time_ms() + 1000.0);
  CHECK(world.player() == player);
  CHECK(world.petals().empty());
  CHECK(petal_count > 0U);
  CHECK(world.last_death_score().value == 123.0F);
  CHECK(world.last_death_level() == 7U);
  CHECK(world.last_killer_name() == "Ladybug");
  // Mobs keep dying after the player. Their killer names are per-entity; the
  // local death payload must retain the entity that actually killed the
  // player instead of being overwritten by later unattributed mob deaths.
  (void)engine::damage_entity(world, attacker, world.entities().get(attacker)->health);
  CHECK(world.last_killer_name() == "Ladybug");
  for (const auto petal : owned_petals) {
    const engine::Entity* child_corpse = world.entities().get(petal);
    CHECK(child_corpse != nullptr);
    if (child_corpse == nullptr) continue;
    CHECK(child_corpse->death_processed);
    CHECK(child_corpse->health.value == 0.0F);
    CHECK(child_corpse->death_time_ms == player_corpse->death_time_ms);
  }
  engine::tick(world, 999.0);
  CHECK(world.entities().get(player) != nullptr);
  CHECK(world.player() == player);
  CHECK(world.petals().empty());
  for (const auto petal : owned_petals) CHECK(world.entities().get(petal) != nullptr);
  engine::tick(world, 1.0);
  CHECK(world.entities().get(player) == nullptr);
  CHECK(!world.player().valid());
  CHECK(world.petals().empty());
  for (const auto petal : owned_petals) CHECK(world.entities().get(petal) == nullptr);
  world.clear_hit_events();

  // Coalesced hit messages carry an epoch and a reference count.
  const engine::EntityHandle target = engine::spawn_entity(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)),
    engine::f32(10.0F));
  world.record_hit(target, attacker, engine::f32(3.0F), engine::f32(10.0F));
  world.record_hit(target, attacker, engine::f32(4.0F), engine::f32(6.0F));
  CHECK(world.hit_events().size() == 1U);
  CHECK(world.hit_events().front().count == 2U);
  CHECK(world.hit_events().front().refcount == 2U);
  CHECK(world.hit_events().front().amount.value == 7.0F);

  // A target allocated outside spawn_entity is not in the known list yet.
  engine::EntityPool& pool = world.entities();
  const auto hidden = pool.allocate();
  CHECK(hidden.has_value());
  world.record_hit(*hidden, attacker, engine::f32(1.0F), engine::f32(1.0F));
  CHECK(world.hit_events().size() == 1U);
  CHECK(world.pending_hit_events().size() == 1U);
  world.mark_known(*hidden);
  CHECK(world.flush_pending_hits() == 1U);
  CHECK(world.hit_events().size() == 2U);

  // Pickup intrusive registry.
  const engine::EntityHandle drop = engine::spawn_loot_drop(
    world, 1, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(drop.valid());
  CHECK(world.entities().get(drop)->radius.value == 35.0F);
  CHECK(world.pickups().size() == 1U);
  CHECK(world.entities().get(drop)->pickup_listed);
  CHECK(world.destroy(drop));
  CHECK(world.pickups().empty());
}

void test_loadout_exact_layout() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle player = engine::spawn_player(
    world, "layout", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  CHECK(player.valid());
  world.profile().set_level(30);
  for (std::uint8_t slot = 0; slot < 6; ++slot) world.profile().set_inventory(slot, 1);
  world.profile().set_inventory(2, 3); // Heavy, so the final swap is a real type change.
  world.profile().set_inventory_count(6);
  world.loadout().restore_from_profile(world.profile());
  CHECK(world.loadout().slots()[0].type_id == 1U);
  CHECK(!world.loadout().handle(0, 0).valid());

  const std::size_t spawned = engine::spawn_loadout_petals(world);
  CHECK(spawned == 6U);
  for (std::uint8_t slot = 0; slot < 6; ++slot) {
    CHECK(world.loadout().handle(slot, 0).valid());
    CHECK(world.loadout().slots()[slot].instances[0] == world.loadout().handle(slot, 0));
    CHECK(!world.loadout().pending(slot, 0));
  }

  // Recharge gates respawn: destroying a petal starts the catalog timer and
  // spawn_loadout_petals must not recreate it until the timer expires.
  const engine::EntityHandle lost = world.loadout().handle(1, 0);
  CHECK(engine::on_petal_destroyed(world, lost));
  CHECK(world.destroy(lost));
  CHECK(engine::spawn_loadout_petals(world) == 0U);
  CHECK(engine::refresh_loadout_petals(world, 2500.0) == 1U);
  CHECK(world.loadout().handle(1, 0).valid());

  const engine::EntityHandle old = world.loadout().handle(0, 0);
  CHECK(world.loadout().change_slot_type(world, world.profile(), 0, 3));
  const engine::Entity* old_corpse = world.entities().get(old);
  CHECK(old_corpse != nullptr);
  CHECK(old_corpse->death_processed);
  CHECK(!world.loadout().handle(0, 0).valid());
  CHECK(world.loadout().slots()[0].type_id == 3U);
  CHECK(world.profile().inventory(0) == 3U);
  CHECK(world.loadout().pending(0, 0));
  CHECK(world.loadout().pending(0, 1));
  CHECK(world.loadout().pending(0, 2));
  CHECK(world.loadout().replication_epoch() > 0U);
  CHECK(world.loadout().slot_epoch(0) > 0U);

  world.loadout().set_pending_timer(0, 0, 100U);
  world.loadout().advance(50.0);
  CHECK(world.loadout().pending(0, 0));
  CHECK(world.loadout().pending_timer(0, 0) == 50U);
  world.loadout().advance(60.0);
  CHECK(!world.loadout().pending(0, 0));
  CHECK(world.loadout().pending_timer(0, 0) == 0U);

  CHECK(world.loadout().create_equipped_petal(world, 0, 0));
  const engine::EntityHandle created = world.loadout().handle(0, 0);
  CHECK(created.valid());
  CHECK(world.entities().get(created)->type_id == 3U);
  CHECK(world.entities().get(created)->owner == player.raw);
  CHECK(!world.loadout().pending(0, 0));

  CHECK(world.loadout().handle(1, 0).valid() && world.loadout().handle(2, 0).valid());
  CHECK(world.loadout().swap(world, world.profile(), 1, 1, 2, 3));
  // Both slots re-enter their catalog recharge; no entity is exchanged.
  CHECK(!world.loadout().handle(1, 0).valid());
  CHECK(!world.loadout().handle(2, 0).valid());
  CHECK(world.loadout().pending(1, 0) && world.loadout().pending(2, 0));
  CHECK(engine::spawn_loadout_petals(world) == 0U);
  // Slot 2 receives the Basic petal and returns after 2.5 s; slot 1 receives
  // Heavy and stays in recharge until its 5.5 s catalog timer expires.
  CHECK(engine::refresh_loadout_petals(world, 3000.0) == 1U);
  CHECK(!world.loadout().handle(1, 0).valid());
  CHECK(world.loadout().handle(2, 0).valid());
  CHECK(engine::refresh_loadout_petals(world, 3000.0) == 1U);
  CHECK(world.loadout().handle(1, 0).valid());

  world.loadout().set_score(engine::f32(55.0F));
  CHECK(world.loadout().score().value == 55.0F);
}

void test_alert_to_attacker_is_local() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player(
    world, "local", engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  CHECK(player.valid());
  const engine::EntityHandle first = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(20.0F), engine::f32(0.0F)));
  const engine::EntityHandle second = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(30.0F), engine::f32(0.0F)));
  CHECK(first.valid() && second.valid());
  world.entities().get(first)->ai.can_alert = true;
  (void)engine::damage_entity(world, first, engine::f32(1.0F), player);
  CHECK(world.entities().get(first)->ai.target == player);
  CHECK(!world.entities().get(second)->ai.target.valid());
}



void test_domain_dense_live_values() {
  engine::WorkerApi api;
  api.init();
  api.set_default_dense_groups(false);
  const engine::EntityHandle mob = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(1.0F), engine::f32(2.0F)));
  CHECK(mob.valid());
  const auto compact = api.domain_snapshot_bytes(60, 0);
  engine::ByteReader compact_reader(compact);
  CHECK(compact_reader.read_u8().value() == 1);
  (void)compact_reader.read_varint32();
  (void)compact_reader.read_varint32();
  CHECK(compact_reader.read_varint32().value() == 0);
  CHECK(compact_reader.read_varint32().value() == 1);

  // A configured byte group is appended after the compact domain record.
  CHECK(api.set_snapshot_groups(mob, 1U << 1)); // group 56
  CHECK(api.set_snapshot_byte(mob, 1U, 7U));
  const auto dense = api.domain_snapshot_bytes(61, 0);
  CHECK(!dense.empty()); // unchanged camera targets are now omitted
  engine::ByteReader reader(dense);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 61);
  (void)reader.read_varint32();
  CHECK(reader.read_varint32().value() == 0);
  CHECK(reader.read_varint32().value() == 2);
}
void test_default_dense_groups() {
  engine::WorkerApi api;
  api.init();
  const engine::EntityHandle mob = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(7.0F), engine::f32(8.0F)));
  CHECK(mob.valid());
  CHECK(api.default_dense_groups());
  const auto bytes = api.domain_snapshot_bytes(62, 0);
  engine::ByteReader reader(bytes);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 62);
  (void)reader.read_varint32();
  CHECK(reader.read_varint32().value() == 0);
  // Compact declaration plus a complete mask-selected dense payload.
  CHECK(reader.read_varint32().value() == 2);
  api.set_default_dense_groups(false);
  const auto compact = api.domain_snapshot_bytes(63, 0);
  CHECK(compact.size() < bytes.size());
}

void test_domain_dense_player_wire_boundaries() {
  engine::WorkerApi api;
  api.init(false);
  // Put another entity after the player: the old writer consumed the next
  // handle's first three bytes as the player's missing group-152 payload.
  const auto player = engine::spawn_player_default(api.world(), "wire",
    engine::make_default_profile(), false);
  CHECK(player.valid());
  const auto mob = api.spawn(engine::EntityKind::kMob, 14,
    engine::Vec2(engine::f32(12345.0F), engine::f32(-321.0F)));
  CHECK(mob.valid());
  CHECK(api.world().loadout().equip(2U, 3U));
  CHECK(api.world().loadout().create_equipped_petal(api.world(), 2U, 0U));
  const auto petal = api.world().loadout().handle(2U, 0U);
  CHECK(petal.valid());
  api.world().profile().set_experience(engine::f32(3.0F));
  api.world().loadout().set_score(engine::f32(9.0F));
  api.world().apply_input(3U, engine::f32(1.0F), engine::f32(0.0F));
  for (std::uint32_t sequence : {127U, 128U, 256U}) {
    if (sequence == 127U) {
      // Health alone is not the visual lifecycle flag.
      api.world().entities().get(petal)->health = engine::f32(0.0F);
      CHECK(!api.world().entities().get(petal)->death_processed);
    } else if (sequence == 128U) {
      engine::kill_entity(api.world(), petal);
      CHECK(api.world().entities().get(petal)->death_processed);
    }
    const auto bytes = api.domain_snapshot_bytes(sequence, 7U);
    engine::ByteReader reader(bytes);
    CHECK(reader.read_u8().value() == 1U);
    CHECK(reader.read_varint32().value() == sequence);
    CHECK(reader.read_varint32().value() == 7U);
    CHECK(reader.read_varint32().value() == 0U); // deletes
    const unsigned expected_records = sequence == 127U ? 12U : 7U;
    CHECK(reader.read_varint32().value() == expected_records);
    CHECK(reader.read_varint32().value() == 0U); // events
    unsigned dense_count = 0;
    unsigned profile_count = 0;
    unsigned loadout_count = 0;
    unsigned lifecycle_count = 0;
    unsigned inventory_count = 0, recharge_count = 0;
    for (unsigned record = 0; record < expected_records; ++record) {
      const auto handle = engine::EntityHandle::from_wire(reader.read_u32_le().value());
      const auto* entity = api.world().entities().get(handle);
      CHECK(entity != nullptr);
      if (entity == nullptr) return;
      const auto flags = reader.read_u8().value() ^ 54U;
      if ((flags & 8U) != 0U) {
        CHECK(flags == 8U); // group 152 base, no profile extension
        const auto start = reader.cursor();
        // Decode by component order, independently of the writer, through EOF.
        CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(entity->entity_flags));
        CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(entity->world_flags));
        CHECK(reader.read_u8().value() == entity->ai.activity_flags);
        CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(entity->world_flags));
        CHECK(reader.read_f32_le().value() == entity->position.x.value);
        CHECK(reader.read_cstring().value().empty());
        for (unsigned index = 0; index < 10; ++index) CHECK(reader.read_u8().value() == 0U);
        CHECK(reader.read_u8().value() == 0U);
        CHECK(reader.read_f32_le().value() == 0.0F);
        CHECK(reader.read_f32_le().value() == entity->position.y.value);
        CHECK(reader.read_f32_le().value() == 0.0F);
        CHECK(reader.read_u8().value() == 0U);
        CHECK(reader.read_u8().value() == 0U);
        CHECK(reader.read_u32_le().value() == 0U);
        CHECK(reader.read_f32_le().value() == entity->health.value);
        CHECK(reader.read_f32_le().value() == entity->max_health.value);
        (void)reader.read_u16_le();
        CHECK(reader.read_f32_le().value() == entity->position.y.value); // field 28
        CHECK(reader.read_f32_le().value() == entity->position.x.value); // field 49
        CHECK(reader.read_f32_le().value() == entity->collision_radius.value); // field 7, group 140
        CHECK(reader.read_u8().value() == (handle == player ? 40U : entity->type_id));
        CHECK(reader.read_u8().value() == static_cast<std::uint8_t>(entity->kind));
        CHECK(reader.read_u8().value() == (handle == player ? 3U : entity->loadout_instance));
        CHECK(reader.cursor() - start == 63U);
        ++dense_count;
      } else {
        CHECK(flags == 1U);
        // All profile records preserve the entire dense declaration, not just
        // bit 29. The last declaration determines the following dense length.
        CHECK(reader.read_u32_le().value() == engine::OriginalSnapshotWriter::kDefaultDenseComponentMask);
        std::uint32_t field = 0;
        for (auto delta = reader.read_varint32().value(); delta != 0U;
             delta = reader.read_varint32().value()) {
          field += delta;
          if (field == 2U || field == 11U || field == 12U || field == 26U || field == 31U || field == 36U || field == 38U || field == 62U) {
            const auto value = reader.read_u8().value();
            if (field == 2U) CHECK(value == (handle == player ? 40U : entity->type_id));
            if (field == 11U) { CHECK(handle == petal); CHECK(value == 2U); ++loadout_count; }
            if (field == 12U) { CHECK(handle == petal); CHECK(value == 0U); ++loadout_count; }
            if (field == 26U) CHECK(value == static_cast<std::uint8_t>(entity->kind));
            if (field == 31U) CHECK(value == (handle == player ? 3U : entity->loadout_instance));
            if (field == 38U) {
              CHECK(value == (entity->death_processed ? 1U : 0U));
              if (handle == petal) CHECK(value == (sequence == 127U ? 0U : 1U));
              ++lifecycle_count;
            }
            if (field == 62U) { CHECK(handle == player); CHECK(value == 1U); ++profile_count; }
          } else if (field == 5U || field == 7U || field == 24U || field == 28U || field == 49U
                     || field == 53U || field == 55U || field == 59U) {
            const auto value = reader.read_f32_le().value();
            if (field == 7U) CHECK(value == entity->collision_radius.value);
            if (field == 28U) CHECK(value == entity->position.y.value);
            if (field == 49U) CHECK(value == entity->position.x.value);
            if (field == 59U) { CHECK(handle == player); CHECK(value == 9.0F); ++profile_count; }
          } else if (field == 8U) {
            (void)reader.read_u16_le();
          } else if (field == 58U) {
            CHECK(handle == player);
            CHECK(reader.read_varint32().value() == 49151U);
            ++profile_count;
          } else if (field == 60U || field == 61U) {
            CHECK(handle == player);
            unsigned slot = 0;
            for (auto index_delta = reader.read_varint32().value(); index_delta != 0U;
                 index_delta = reader.read_varint32().value()) {
              CHECK(index_delta == 1U);
              const auto value = field == 60U ? reader.read_u8().value() : reader.read_varint32().value();
              if (field == 60U) {
                CHECK(value == api.world().loadout().slots()[slot].type_id);
                ++inventory_count;
              } else { CHECK(value == 0U); ++recharge_count; }
              ++slot;
            }
          } else { CHECK(false); return; }
        }
      }
    }
    CHECK(dense_count == (sequence == 127U ? 3U : 0U));
    CHECK(profile_count == (sequence == 127U ? 3U : 2U));
    CHECK(inventory_count == (sequence == 127U ? 16U : 0U));
    CHECK(recharge_count == (sequence == 127U ? 8U : 0U));
    CHECK(loadout_count == 2U);
    CHECK(lifecycle_count == 3U);
    CHECK(reader.error() == engine::ParseError::kNone);
    CHECK(reader.eof());
  }
}

void test_full_field_framing() {
  engine::WorkerApi api;
  api.init();
  const engine::EntityHandle mob = api.spawn(engine::EntityKind::kMob, 4,
    engine::Vec2(engine::f32(5.0F), engine::f32(6.0F)));
  CHECK(mob.valid());
  const auto compact = api.domain_snapshot_bytes(70, 0);
  api.set_full_field_framing(true);
  const auto full = api.domain_snapshot_bytes(71, 0);
  CHECK(full.size() > compact.size());
  engine::ByteReader reader(full);
  CHECK(reader.read_u8().value() == 1);
  CHECK(reader.read_varint32().value() == 71);
  CHECK(reader.read_varint32().value() == 0);
  CHECK(reader.read_varint32().value() == 0); // deletes
  const auto updates = reader.read_varint32();
  CHECK(updates.has_value());
  CHECK(updates.value() > 75); // full nonplayer fields; player arrays are not fabricated
  CHECK(reader.read_varint32().value() == 0); // events
}

void test_full_field_effect_flags() {
  engine::WorkerApi api;
  api.init(false);
  api.set_full_field_framing(true);
  api.set_default_dense_groups(false);
  const auto mob = api.spawn(engine::EntityKind::kMob, 4U, {});
  auto* entity = api.world().entities().get(mob);
  entity->spawn_band = 7U;
  for (const std::uint8_t flags : {0U, 1U, 4U}) {
    entity->effect_flags = flags;
    const auto packet = api.domain_snapshot_bytes(1U);
    // Every full sparse field is a self-contained mask record. Match the exact
    // field14 record including handle/mask, rather than an unrelated byte.
    engine::ByteWriter expected;
    expected.write_u32_le(mob.to_wire()); expected.write_u8(55U);
    expected.write_u32_le((1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29));
    expected.write_varint32(14U); expected.write_u8(flags); expected.write_u8(0U);
    CHECK(std::search(packet.begin(), packet.end(), expected.bytes().begin(), expected.bytes().end()) != packet.end());
  }
}

void test_input_discard_deletion_then_swap() {
  engine::WorkerApi api;
  api.init(false);
  const std::array<std::uint8_t, 4> key{0x11, 0x22, 0x33, 0x44};
  const auto send = [&api, &key](engine::ByteWriter& writer) {
    auto packet = writer.bytes(); engine::apply_packet_xor(packet, key);
    CHECK(api.send(packet, key));
  };
  engine::ByteWriter spawn;
  spawn.write_varint32(1U); spawn.write_varint32(6U);
  for (const char byte : std::string("deletion")) spawn.write_u8(static_cast<std::uint8_t>(byte));
  spawn.write_u8(0U); send(spawn);
  (void)api.domain_snapshot_bytes(1U);
  const auto discarded = api.world().loadout().handle(2U, 0U);
  CHECK(discarded.valid());
  engine::ByteWriter discard;
  discard.write_varint32(2U); discard.write_varint32(8U);
  discard.write_varint32(2U); discard.write_varint32(1U); send(discard);
  CHECK(api.world().entities().get(discarded) == nullptr);
  api.think();
  api.enqueue_domain_snapshot(2U);
  const auto output = api.flush();
  CHECK(output.size() == 1U);
  engine::ByteReader reader(output.front().payload);
  CHECK(reader.read_u8().value() == 1U);
  (void)reader.read_varint32(); (void)reader.read_varint32();
  CHECK(reader.read_varint32().value() == 1U);
  (void)reader.read_varint32(); (void)reader.read_varint32(); // update/event counts precede delete payload
  CHECK(reader.read_u32_le().value() == discarded.to_wire());
  const auto moved = api.world().loadout().handle(0U, 0U);
  engine::ByteWriter swap;
  swap.write_varint32(3U); swap.write_varint32(10U);
  for (const unsigned value : {0U, 1U, 2U, 0U}) swap.write_varint32(value);
  send(swap);
  api.think();
  // Original swap is two changeSlotType calls: the old slot-0 petal is retired
  // and the incoming slot-2 petal waits out a full recharge before spawning.
  CHECK(!api.world().loadout().handle(2U, 0U).valid());
  CHECK(api.world().loadout().pending(2U, 0U));
  CHECK(api.world().loadout().slots()[2].type_id == 1U);
  unsigned count = 0U, slot2 = 0U;
  for (const auto& entity : api.world().entities().entities()) {
    if (!entity.active || entity.health.value <= 0.0F || entity.kind != engine::EntityKind::kPetal) continue;
    ++count; if (entity.loadout_slot == 2U) ++slot2;
    CHECK(entity.handle != discarded);
    CHECK(entity.handle != moved);
  }
  CHECK(count == 3U && slot2 == 0U);
  CHECK(engine::refresh_loadout_petals(api.world(), 3000.0) == 1U);
  CHECK(api.world().loadout().handle(2U, 0U).valid());
  count = 0U; slot2 = 0U;
  for (const auto& entity : api.world().entities().entities()) {
    if (!entity.active || entity.health.value <= 0.0F || entity.kind != engine::EntityKind::kPetal) continue;
    ++count; if (entity.loadout_slot == 2U) ++slot2;
  }
  CHECK(count == 4U && slot2 == 1U);
  const auto next = api.domain_snapshot_bytes(3U);
  engine::ByteReader next_reader(next);
  (void)next_reader.read_u8(); (void)next_reader.read_varint32(); (void)next_reader.read_varint32();
  CHECK(next_reader.read_varint32().value() == 0U);
}

void test_ai_recovered_species_profiles() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const auto bee = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 6,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  const engine::Entity* bee_entity = world.entities().get(bee);
  CHECK(bee_entity != nullptr);
  CHECK(bee_entity->ai.wave_frequency.bits() == 993803864U);
  CHECK(bee_entity->ai.wave_power.value == 0.5F);
  CHECK(bee_entity->ai.sine_enabled);
  CHECK(bee_entity->ai.sine_frequency.value == 0.002F);
  CHECK(bee_entity->ai.timer_interval_ms >= 5000.0 && bee_entity->ai.timer_interval_ms <= 10000.0);
  CHECK(bee_entity->ai.radius.value == 1000.0F);
  CHECK(bee_entity->max_health.value == 15.0F);

  const auto hornet = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 14,
    engine::Vec2(engine::f32(500.0F), engine::f32(0.0F)));
  const engine::Entity* hornet_entity = world.entities().get(hornet);
  CHECK(hornet_entity != nullptr);
  CHECK(hornet_entity->ai.aggressive);
  CHECK(hornet_entity->ai.attack_range.value == 500.0F);
  CHECK(std::fabs(hornet_entity->ai.attack_speed.value) == 0.4F);
  CHECK(hornet_entity->ai.attack_callback == 74U);
  CHECK(hornet_entity->ai.attack_cooldown_gain.value == 2000.0F);
  CHECK(hornet_entity->ai.territory.value == 0.6F);
  CHECK(hornet_entity->ai.radius.value == 600.0F);

  const auto spider = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 22,
    engine::Vec2(engine::f32(-500.0F), engine::f32(0.0F)));
  const engine::Entity* spider_entity = world.entities().get(spider);
  CHECK(spider_entity != nullptr);
  CHECK(spider_entity->ai.aggressive);
  CHECK(spider_entity->ai.territory.value == 0.45F);
  CHECK(spider_entity->ai.chase_speed.value == 2.88F);
  CHECK(spider_entity->ai.radius.value == 600.0F);

  const auto square = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 19,
    engine::Vec2(engine::f32(0.0F), engine::f32(500.0F)));
  const engine::Entity* square_entity = world.entities().get(square);
  CHECK(square_entity != nullptr);
  CHECK(!square_entity->ai.angle_locked);
  CHECK(std::fabs(square_entity->ai.turn_rate.value - 0.12321318F) < 1e-6F);
  CHECK(square_entity->ai.idle_speed.value == 0.2F);
  CHECK(square_entity->ai.radius.value == 1000.0F);
}

void test_ai_behavior_modifiers() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "p",
    engine::make_default_profile(), false);
  world.entities().get(player)->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle spider = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 22, engine::Vec2(engine::f32(300.0F), engine::f32(0.0F)));
  engine::Entity* spider_entity = world.entities().get(spider);
  CHECK(spider_entity != nullptr);
  engine::update_ai(world, 50.0);
  const double base_vx = spider_entity->velocity.x;
  CHECK(base_vx < 0.0);
  spider_entity->velocity = engine::Vec2d(0.0, 0.0);
  spider_entity->ai.modifiers.speed = engine::f32(2.0F);
  engine::update_ai(world, 50.0);
  CHECK(std::fabs(spider_entity->velocity.x) > std::fabs(base_vx) * 1.5);

  engine::World hornet_world;
  hornet_world.initialize();
  hornet_world.set_auto_populate(false);
  const engine::EntityHandle hornet_player = engine::spawn_player_default(hornet_world, "p",
    engine::make_default_profile(), false);
  hornet_world.entities().get(hornet_player)->position = engine::Vec2(engine::f32(10000.0F), engine::f32(0.0F));
  const engine::EntityHandle hornet = engine::spawn_entity_from_defaults(
    hornet_world, engine::EntityKind::kMob, 14, engine::Vec2(engine::f32(10300.0F), engine::f32(0.0F)));
  engine::Entity* hornet_entity = hornet_world.entities().get(hornet);
  CHECK(hornet_entity != nullptr);
  hornet_entity->ai.target = hornet_player;
  hornet_entity->ai.attack_callback = 74U;
  hornet_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  hornet_entity->ai.attack_cooldown_gain = engine::f32(2000.0F);
  hornet_entity->ai.modifiers.attack = engine::f32(2.0F);
  engine::update_ai(hornet_world, 50.0);
  CHECK(hornet_entity->ai.attack_cooldown_ms.value == 4000.0F);
}

void test_hornet_stinger_callback() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "p",
    engine::make_default_profile(), false);
  // The hornet's territory gate (0.6 - 0.5) needs the player beyond x=5000.
  world.entities().get(player)->position = engine::Vec2(engine::f32(10000.0F), engine::f32(0.0F));
  world.entities().get(player)->bounds_dirty = true;
  const engine::EntityHandle hornet = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 14, engine::Vec2(engine::f32(10300.0F), engine::f32(0.0F)));
  engine::Entity* hornet_entity = world.entities().get(hornet);
  CHECK(hornet_entity != nullptr);
  // First pass acquires the player and arms the 500 ms acquire cooldown.
  engine::update_ai(world, 50.0);
  CHECK(hornet_entity->ai.target == player);
  CHECK(hornet_entity->ai.attack_cooldown_ms.value == 500.0F);
  const std::size_t before = world.entities().active_count();
  hornet_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  engine::update_ai(world, 50.0);
  // Callback 74 spawns one stinger and re-arms the recovered 2000 ms cooldown.
  CHECK(world.entities().active_count() == before + 1U);
  CHECK(hornet_entity->ai.attack_cooldown_ms.value == 2000.0F);
  engine::EntityHandle stinger{};
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kProjectile) continue;
    stinger = entity.handle;
    CHECK(entity.type_id == 14U);
    CHECK(entity.owner == hornet.raw);
    CHECK(entity.contact_damage.value == 10.0F);
    CHECK(entity.lifetime_remaining_ms == 2000.0);
    CHECK(entity.health.value == 10.0F);
    CHECK(entity.max_health.value == 10.0F);
    CHECK(entity.collision_radius.value == 11.0F);
    CHECK(std::fabs(entity.acceleration.x + 0.6) < 1e-6);
    CHECK(std::fabs(entity.position.x.value - 10320.0F) < 0.01F);
    CHECK(std::fabs(entity.position.y.value) < 0.01F);
    CHECK(std::fabs(entity.velocity.x + 1.4) < 1e-6);
    CHECK(std::fabs(entity.velocity.y) < 1e-6);
  }
  CHECK(stinger.valid());
  // The next tick must not fire again while the cooldown is armed.
  engine::update_ai(world, 50.0);
  CHECK(world.entities().active_count() == before + 1U);

  // Outside acquisition radius a new target is not acquired. A retained live
  // target still fires outside attack_range (the oracle fixture covers this).
  engine::World far;
  far.initialize();
  far.set_auto_populate(false);
  const engine::EntityHandle far_player = engine::spawn_player_default(far, "p",
    engine::make_default_profile(), false);
  far.entities().get(far_player)->position = engine::Vec2(engine::f32(10000.0F), engine::f32(0.0F));
  far.entities().get(far_player)->bounds_dirty = true;
  const engine::EntityHandle far_hornet = engine::spawn_entity_from_defaults(
    far, engine::EntityKind::kMob, 14, engine::Vec2(engine::f32(10800.0F), engine::f32(0.0F)));
  engine::Entity* far_entity = far.entities().get(far_hornet);
  CHECK(far_entity != nullptr);
  engine::update_ai(far, 50.0);
  far_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  const std::size_t far_before = far.entities().active_count();
  engine::update_ai(far, 50.0);
  CHECK(far.entities().active_count() == far_before);
  far_entity->ai.target = far_player;
  far_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  engine::update_ai(far, 50.0);
  CHECK(far.entities().active_count() == far_before + 1U);

  // An unknown callback id inside range is counted, not guessed into an attack.
  const std::uint32_t unknown_before = engine::species_debug::unknown_callbacks;
  const std::size_t world_before = world.entities().active_count();
  hornet_entity->ai.attack_callback = 999U;
  hornet_entity->ai.attack_cooldown_ms = engine::f32(0.0F);
  engine::update_ai(world, 50.0);
  CHECK(engine::species_debug::unknown_callbacks == unknown_before + 1U);
  CHECK(world.entities().active_count() == world_before);
}

void test_hornet_stinger_lifecycle() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const auto player = engine::spawn_player_default(world, "p", engine::make_default_profile(), false);
  const auto hornet = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 14,
    engine::Vec2(engine::f32(10000.0F), engine::f32(50000.0F)));
  auto* body = world.entities().get(hornet);
  body->angle = engine::f32(1.5707963705062866F);
  const auto stinger = engine::spawn_hornet_stinger(world, hornet, player);
  CHECK(stinger.valid());
  CHECK(std::fabs(body->velocity.y + 0.4) < 1e-6);
  for (int step = 0; step < 39; ++step) engine::tick(world, 50.0);
  auto* projectile = world.entities().get(stinger);
  CHECK(projectile != nullptr && projectile->health.value == 10.0F);
  CHECK(projectile->lifetime_remaining_ms == 50.0);
  engine::tick(world, 50.0);
  projectile = world.entities().get(stinger);
  CHECK(projectile != nullptr && projectile->health.value == 0.0F);
  CHECK(projectile->death_processed);
  CHECK(projectile->death_time_ms == 3000.0);
  for (int step = 0; step < 19; ++step) engine::tick(world, 50.0);
  CHECK(world.entities().get(stinger) != nullptr);
  engine::tick(world, 50.0);
  CHECK(world.entities().get(stinger) == nullptr);
}

void test_ai_target_motion_and_guard() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "p",
    engine::make_default_profile(), false);
  engine::Entity* player_entity = world.entities().get(player);
  CHECK(player_entity != nullptr);
  player_entity->position = engine::Vec2(engine::f32(0.0F), engine::f32(0.0F));
  const engine::EntityHandle spider = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 22, engine::Vec2(engine::f32(300.0F), engine::f32(0.0F)));
  engine::Entity* spider_entity = world.entities().get(spider);
  CHECK(spider_entity != nullptr);
  engine::update_ai(world, 50.0);
  CHECK(spider_entity->ai.target == player);
  CHECK(spider_entity->velocity.x < 0.0);
  const float before = spider_entity->position.x.value;
  engine::integrate_movement(world, 50.0);
  CHECK(spider_entity->position.x.value < before);
  CHECK(std::fabs(std::fabs(spider_entity->angle.value) - 3.1415927F) < 0.01F);

  // An owned ant far from its hole draws two RNG values and heads to a guard
  // point inside 0.9 * guard_radius of the owner.
  engine::World guarded;
  guarded.initialize();
  guarded.set_auto_populate(false);
  const engine::EntityHandle hole = engine::spawn_entity_from_defaults(
    guarded, engine::EntityKind::kMob, 11, engine::Vec2(engine::f32(1000.0F), engine::f32(0.0F)));
  CHECK(hole.valid());
  engine::EntityHandle ant{};
  for (const auto& entity : guarded.entities().entities()) {
    if (entity.active && entity.kind == engine::EntityKind::kMob && entity.type_id == 7U) {
      ant = entity.handle;
      break;
    }
  }
  CHECK(ant.valid());
  engine::Entity* ant_entity = guarded.entities().get(ant);
  CHECK(ant_entity != nullptr);
  ant_entity->position = engine::Vec2(engine::f32(2000.0F), engine::f32(0.0F));
  const std::uint32_t rng_before = guarded.random().state();
  engine::update_ai(guarded, 50.0);
  CHECK(ant_entity->ai.guard_active);
  CHECK(guarded.random().state() != rng_before);
  const engine::f32 dx(ant_entity->ai.guard_point.x.value - 1000.0F);
  const engine::f32 dy(ant_entity->ai.guard_point.y.value);
  CHECK(dx.value * dx.value + dy.value * dy.value <= 450.0F * 450.0F);
}

void test_centipede_exact_chain_and_rare() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const std::uint32_t seed = 787621659U;
  world.random().seed(seed);
  std::uint32_t after_components = seed;
  for (int index = 0; index < 6; ++index) after_components = engine::ServerRng::successor(after_components);
  const std::uint32_t after_rare = engine::ServerRng::successor(after_components);
  std::uint32_t after_behavior = after_rare;
  for (int index = 0; index < 2; ++index) after_behavior = engine::ServerRng::successor(after_behavior);
  const std::uint32_t after_angle = engine::ServerRng::successor(after_behavior);
  const engine::f32 angle_sample(
    static_cast<float>(static_cast<std::uint32_t>(after_angle - 1U)));
  const engine::f32 angle(angle_sample.value * 2.925836239953128e-09F);
  const engine::EntityHandle head = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 15, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(head.valid());
  const engine::Entity* head_entity = world.entities().get(head);
  CHECK(head_entity != nullptr);
  CHECK(!head_entity->ai.rare);
  CHECK(head_entity->children.size() == 1U);
  const engine::Entity* first = world.entities().get(head_entity->children.front());
  CHECK(first != nullptr);
  const double expected_x = std::cos(static_cast<double>(angle.value)) * 70.0;
  const double expected_y = std::sin(static_cast<double>(angle.value)) * 70.0;
  CHECK(std::fabs(static_cast<double>(first->position.x.value) - expected_x) < 0.01);
  CHECK(std::fabs(static_cast<double>(first->position.y.value) - expected_y) < 0.01);
  CHECK(first->owner == head.raw);
  CHECK(first->ai.owner == head);
  CHECK(first->ai.predecessor == head);
  std::uint32_t after_chain = after_angle;
  for (int index = 0; index < 9 * 8; ++index) after_chain = engine::ServerRng::successor(after_chain);
  CHECK(world.random().state() == after_chain);
  std::size_t chain = 1;
  const engine::Entity* cursor = head_entity;
  while (!cursor->children.empty()) {
    cursor = world.entities().get(cursor->children.front());
    CHECK(cursor != nullptr);
    if (cursor == nullptr) break;
    ++chain;
  }
  CHECK(chain == 10U);

  // Find a seed whose first draw makes the rare (< 1%) roll true.
  std::uint32_t rare_seed = 0;
  for (std::uint32_t candidate = 1; candidate < 100000U; ++candidate) {
    std::uint32_t draw = candidate;
    for (int index = 0; index < 7; ++index) draw = engine::ServerRng::successor(draw);
    const float fraction = static_cast<float>(draw - 1U) / 2147483648.0F;
    if (fraction < 0.01F) { rare_seed = candidate; break; }
  }
  CHECK(rare_seed != 0U);
  engine::World rare_world;
  rare_world.initialize();
  rare_world.set_auto_populate(false);
  rare_world.set_dimensions(engine::f32(50000.0F), engine::f32(50000.0F));
  rare_world.random().seed(rare_seed);
  const engine::EntityHandle rare_head = engine::spawn_entity_from_defaults(
    rare_world, engine::EntityKind::kMob, 15, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(rare_head.valid());
  const engine::Entity* rare_entity = rare_world.entities().get(rare_head);
  CHECK(rare_entity != nullptr);
  CHECK(rare_entity->ai.rare);
  std::size_t rare_chain = 1;
  const engine::Entity* rare_cursor = rare_entity;
  while (!rare_cursor->children.empty()) {
    rare_cursor = rare_world.entities().get(rare_cursor->children.front());
    CHECK(rare_cursor != nullptr);
    if (rare_cursor == nullptr) break;
    ++rare_chain;
  }
  CHECK(rare_chain == 50U);
}

void test_ai_round_before_remainder() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const auto handle = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 15U, {});
  auto* entity = world.entities().get(handle);
  entity->ai.current_angle = engine::f32(5.961493492126465F);
  entity->ai.behavior_choice = 1U;
  entity->ai.timer_active = false;
  entity->velocity = {};
  engine::update_ai(world, 50.0);
  // Shipped original func654, garden head3572024024 first tick.
  CHECK(entity->ai.current_angle.value == -0.32139188051223755F);
  CHECK(entity->velocity.x == static_cast<double>(
    engine::f32(std::cos(entity->angle.value) * 0.01F).value));
  CHECK(entity->velocity.y == static_cast<double>(
    engine::f32(std::sin(entity->angle.value) * 0.01F).value));
}

void test_ai_activity_branch_and_wire() {
  engine::WorkerApi api;
  api.init(false);
  auto& world = api.world();
  const auto player = engine::spawn_player_default(world, "activity", engine::make_default_profile(), false);
  world.entities().get(player)->position = {};
  const auto mob = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 22U,
    engine::Vec2(engine::f32(100.0F), engine::f32(0.0F)));
  auto* entity = world.entities().get(mob);
  entity->ai.activity_flags = 0x80U; // preserve the other original byte bits
  engine::update_ai(world, 50.0);
  CHECK(entity->ai.target == player);
  CHECK(entity->ai.activity_flags == 0x81U);
  CHECK(world.destroy(player));
  CHECK(entity->ai.activity_flags == 0x81U); // target destruction is not the AI branch
  for (const bool full : {false, true}) {
    api.set_full_field_framing(full);
    api.set_default_dense_groups(false);
    const auto packet = api.domain_snapshot_bytes(1U);
    engine::ByteWriter expected;
    expected.write_u32_le(mob.to_wire()); expected.write_u8(55U);
    expected.write_u32_le((1U << 5) | (1U << 19) | (1U << 20) | (1U << 25) | (1U << 29));
    expected.write_varint32(36U); expected.write_u8(0x81U); expected.write_u8(0U);
    if (full) CHECK(std::search(packet.begin(), packet.end(), expected.bytes().begin(), expected.bytes().end()) != packet.end());
    else {
      engine::ByteReader sparse(packet);
      (void)sparse.read_u8(); for (unsigned i = 0; i < 5; ++i) (void)sparse.read_varint32();
      (void)sparse.read_u32_le(); (void)sparse.read_u8(); (void)sparse.read_u32_le();
      unsigned field = 0; bool saw_activity = false;
      for (auto delta = sparse.read_varint32().value(); delta != 0; delta = sparse.read_varint32().value()) {
        field += delta;
        if (field == 8U) (void)sparse.read_u16_le();
        else if (field == 2U || field == 26U || field == 31U || field == 36U || field == 38U) {
          const auto value = sparse.read_u8().value();
          if (field == 36U) { CHECK(value == 0x81U); saw_activity = true; }
        } else (void)sparse.read_f32_le();
      }
      CHECK(saw_activity && sparse.eof());
    }
  }
  engine::OriginalSnapshotWriter dense;
  dense.begin(1U); dense.write_dense_default_groups(*entity);
  const auto packet = dense.finish(); engine::ByteReader reader(packet);
  (void)reader.read_u8(); for (unsigned i = 0; i < 5; ++i) (void)reader.read_varint32();
  (void)reader.read_u32_le(); (void)reader.read_u8();
  (void)reader.read_u8(); (void)reader.read_u8();
  CHECK(reader.read_u8().value() == 0x81U);
  engine::update_ai(world, 50.0);
  CHECK(entity->ai.activity_flags == 0x80U);
  entity->ai.activity_flags = 1U; entity->health = engine::f32(0.0F);
  engine::update_ai(world, 50.0);
  CHECK(entity->ai.activity_flags == 1U); // corpse keeps its last flags
}

void test_ant_hole_exact_children() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const std::uint32_t before = world.random().state();
  const engine::EntityHandle hole = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 11, engine::Vec2(engine::f32(100.0F), engine::f32(100.0F)));
  CHECK(hole.valid());
  std::uint32_t expected = before;
  // 3 definition-component draws for the hole, then each of six children draws
  // 5 definition components, one ant turn value, two configureBehavior values
  // and one scatter angle.
  for (int index = 0; index < 3 + 6 * 9; ++index) expected = engine::ServerRng::successor(expected);
  CHECK(world.random().state() == expected);
  std::array<int, 23> counts{};
  for (const auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != engine::EntityKind::kMob) continue;
    if (entity.type_id < counts.size()) ++counts[entity.type_id];
    if (entity.type_id >= 7U && entity.type_id <= 9U) {
      CHECK(entity.owner == hole.raw);
      CHECK(entity.ai.owner == hole);
      CHECK(entity.position.x.value == 100.0F);
      CHECK(entity.position.y.value == 100.0F);
      const double speed = std::sqrt(entity.velocity.x * entity.velocity.x
                                   + entity.velocity.y * entity.velocity.y);
      CHECK(std::fabs(speed - 0.25F) < 1e-6F);
    }
  }
  CHECK(counts[7] == 3);
  CHECK(counts[8] == 2);
  CHECK(counts[9] == 1);
  CHECK(counts[11] == 1);
}

void test_web_tag_domain_side_effects() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  const engine::EntityHandle player = engine::spawn_player_default(world, "p",
    engine::make_default_profile(), false);
  CHECK(player.valid());
  const engine::EntityHandle target = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 4, engine::Vec2(engine::f32(40.0F), engine::f32(0.0F)));
  CHECK(target.valid());
  const engine::EntityHandle petal = engine::spawn_entity(
    world, engine::EntityKind::kPetal, 29, engine::Vec2(engine::f32(30.0F), engine::f32(0.0F)),
    engine::f32(20.0F));
  CHECK(petal.valid());
  engine::Entity* petal_entity = world.entities().get(petal);
  CHECK(petal_entity != nullptr);
  petal_entity->owner = player.raw;
  engine::on_petal_hit(world, petal, target, player);
  engine::EntityHandle tag{};
  for (const auto& entity : world.entities().entities()) {
    if (entity.active && entity.kind == engine::EntityKind::kProjectile && entity.type_id == 29U) {
      tag = entity.handle;
      break;
    }
  }
  CHECK(tag.valid());
  const engine::Entity* tag_entity = world.entities().get(tag);
  CHECK(tag_entity != nullptr);
  CHECK(tag_entity->collision_radius.value == 50.0F);
  CHECK(tag_entity->health.value == 5.0F);
  CHECK(tag_entity->max_health.value == 5.0F);
  CHECK(tag_entity->physics_flag50);
  CHECK(tag_entity->has_score_component);
  CHECK(tag_entity->has_tag_component);
  CHECK(tag_entity->has_effect_area);
  CHECK((tag_entity->entity_flags & 8U) != 0U);
  CHECK((tag_entity->world_flags & 128U) != 0U);
  CHECK(tag_entity->packet_epoch_a != 0U);
  CHECK(engine::has_effect(*world.entities().get(target), engine::EffectType::kSlow));
  const auto& areas = world.area_effects();
  bool found = false;
  for (const auto& area : areas) {
    if (area.owner == tag && area.scale.value == 50.0F) found = true;
  }
  CHECK(found);
}

void test_world_frame_tracks_tick() {
  engine::World world;
  world.initialize();
  CHECK(world.frame().tick() == 0U);
  engine::tick(world, 50.0);
  CHECK(world.frame().tick() == world.tick());
  CHECK(world.frame().time_ms() == 50.0);
}

void test_simulation_frame_layout() {
  engine::SimulationFrame frame;
  CHECK(sizeof(frame) == 1152U);
  frame.set_tick(42U);
  frame.set_time_ms(2100.0);
  frame.set_scratch(1151U, 0xA5U);
  CHECK(frame.tick() == 42U);
  CHECK(frame.time_ms() == 2100.0);
  CHECK(frame.scratch(1151U) == 0xA5U);
  CHECK(frame.scratch(1152U) == 0U);
}

void test_hit_message_layout() {
  engine::HitMessage message;
  message.set_epoch(0x11223344U);
  message.set_refcount(3U);
  message.set_target(0x55667788U);
  message.set_attacker(0x99AABBCCU);
  CHECK(message.epoch() == 0x11223344U);
  CHECK(message.refcount() == 3U);
  CHECK(message.target() == 0x55667788U);
  CHECK(message.attacker() == 0x99AABBCCU);
  CHECK(sizeof(engine::HitMessage) == 4124U);
}

void test_loadout_reserve_cycle_and_packet_cache() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  engine::PlayerProfile profile;
  profile.set_level(20);
  for (std::uint8_t slot = 0; slot < 6; ++slot) profile.set_inventory(slot, 1);
  profile.set_inventory_count(6);
  const engine::EntityHandle player = engine::spawn_player(world, "p",
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)), engine::PlayerConfig{});
  CHECK(player.valid());
  world.profile() = profile;
  world.loadout().restore_from_profile(world.profile());
  const std::uint32_t epoch_before = world.loadout().packet_cache_epoch();
  CHECK(world.loadout().cycle_reserve_slots(world, world.profile()));
  CHECK(world.loadout().packet_cache_epoch() > epoch_before);
  CHECK(world.loadout().slots()[6].type_id == 1U);
  CHECK(world.loadout().slots()[7].type_id == 1U);
  CHECK(world.loadout().slots()[8].type_id == 2U);
  CHECK(world.loadout().slots()[13].type_id == 7U);
  const engine::Entity* player_entity = world.entities().get(player);
  CHECK(player_entity != nullptr);
  CHECK(player_entity->packet_epoch_a == world.loadout().packet_cache_epoch());
  CHECK(player_entity->packet_epoch_b == world.loadout().packet_cache_epoch());
  // A full backpack shifts its oldest entry before appending the discarded petal.
  for (std::uint16_t item = 1; item <= 16; ++item) world.profile().push_backpack(item);
  CHECK(world.profile().backpack_count() == 16U);
  CHECK(world.profile().backpack()[0] == 1U);
  world.profile().push_backpack(30U);
  CHECK(world.profile().backpack_count() == 16U);
  CHECK(world.profile().backpack()[0] == 2U);
  CHECK(world.profile().backpack()[15] == 30U);
}

void test_contact_nearest_candidate_first() {
  engine::World world;
  world.initialize();
  const auto spawn = [&world](float x) {
    return engine::spawn_entity(world, engine::EntityKind::kMob, 1,
      engine::Vec2(engine::f32(x), engine::f32(0.0F)), engine::f32(10.0F));
  };
  const engine::EntityHandle left = spawn(-15.0F);
  const engine::EntityHandle center = spawn(0.0F);
  const engine::EntityHandle right = spawn(15.0F);
  CHECK(left.valid() && center.valid() && right.valid());
  for (const auto handle : {left, center, right}) {
    engine::Entity* entity = world.entities().get(handle);
    CHECK(entity != nullptr);
    entity->health = engine::f32(10.0F);
    entity->max_health = engine::f32(10.0F);
  }
  (void)engine::resolve_contacts(world);
  // Slot order is left/center/right. The original broad phase visits the
  // nearest candidate first, so center is pushed right by left and then left
  // again by right: the net position stays on the left side of the origin.
  const engine::Entity* moved = world.entities().get(center);
  CHECK(moved != nullptr);
  CHECK(moved->position.x.value < 0.0F);
  CHECK(world.entities().get(left)->position.x.value < -15.0F);
  CHECK(world.entities().get(right)->position.x.value > 15.0F);
}

void test_chain_constraint_clamps_segments() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle head = engine::spawn_entity_from_defaults(
    world, engine::EntityKind::kMob, 15,
    engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)));
  CHECK(head.valid());
  engine::Entity* head_entity = world.entities().get(head);
  CHECK(head_entity != nullptr);
  CHECK(head_entity->children.size() == 1U);
  // Move the head far enough that every link is stretched, then run the
  // original 401 constraint pass.
  head_entity->position.x = engine::f32(500.0F);
  engine::constrain_linked_entities(world);
  std::size_t links = 0;
  engine::EntityHandle current = head;
  for (std::uint32_t guard = 0; guard < 64U; ++guard) {
    const engine::Entity* parent = world.entities().get(current);
    if (parent == nullptr || parent->children.empty()) break;
    current = parent->children.front();
    const engine::Entity* child = world.entities().get(current);
    CHECK(child != nullptr);
    if (child == nullptr) break;
    const double dx = static_cast<double>(parent->position.x.value)
                    - static_cast<double>(child->position.x.value);
    const double dy = static_cast<double>(parent->position.y.value)
                    - static_cast<double>(child->position.y.value);
    const double limit = static_cast<double>(parent->collision_radius.value)
                       + 0.0001 + static_cast<double>(child->collision_radius.value);
    CHECK(std::sqrt(dx * dx + dy * dy) <= limit + 1e-3);
    ++links;
  }
  CHECK(links == 9U);
}


void test_collision_bounds_cache_rebuild_counter() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle handle = engine::spawn_entity(
    world, engine::EntityKind::kMob, 1, engine::Vec2(engine::f32(12.0F), engine::f32(-4.0F)),
    engine::f32(18.0F));
  CHECK(handle.valid());
  const std::uint64_t before = world.bounds_rebuilds();
  const engine::EntityBounds first = engine::collision_bounds(world, handle);
  CHECK(first.valid);
  CHECK(world.bounds_rebuilds() == before + 1U);
  const engine::EntityBounds cached = engine::collision_bounds(world, handle);
  CHECK(world.bounds_rebuilds() == before + 1U); // same tick, same dirty state
  CHECK(cached.min_x.value == first.min_x.value);
  engine::Entity* entity = world.entities().get(handle);
  CHECK(entity != nullptr);
  entity->position.x = engine::f32(40.0F);
  engine::invalidate_bounds(world, handle);
  const engine::EntityBounds moved = engine::collision_bounds(world, handle);
  CHECK(world.bounds_rebuilds() == before + 2U);
  CHECK(moved.min_x.value > first.min_x.value);
}

void test_loadout_flag41_pending_cache() {
  engine::PlayerLoadout loadout;
  // Rose (24) has flag41 and three instances: the special branch gives every
  // live instance the same cache index and advances once for the slot.
  CHECK(loadout.equip(0, 24));
  CHECK(loadout.pending_cache_count() == 1U);
  CHECK(loadout.pending_cache(0, 0) == 0U);
  CHECK(loadout.pending_cache(0, 1) == 0U);
  CHECK(loadout.pending_cache(0, 2) == 0U);
  loadout.set_handle(0, 0, engine::EntityHandle::from_parts(7, 1));
  CHECK(loadout.equip(1, 1));
  CHECK(loadout.pending_cache(0, 0) == 0U);
  CHECK(loadout.pending_cache(0, 1) == 0U);
  CHECK(loadout.pending_cache(0, 2) == 0U);
  CHECK(loadout.pending_cache(1, 0) == 1U);
  CHECK(loadout.pending_cache_count() == 2U);
  // The function-85 total is captured at the active-slot band, not at slot 8.
  loadout.set_active_slots(5);
  CHECK(loadout.equip(2, 1));
  CHECK(loadout.equip(3, 1));
  CHECK(loadout.equip(4, 1));
  CHECK(loadout.equip(5, 1));
  CHECK(loadout.pending_cache(5, 0) == 5U); // still gets an order
  CHECK(loadout.pending_cache_count() == 5U); // captured after slot 4
}

void test_loadout_slot_epochs_bump_on_change() {
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, 1));
  const std::uint32_t first = loadout.slot_epoch(0);
  CHECK(first > 0U);
  CHECK(loadout.equip(1, 6));
  const std::uint32_t second = loadout.slot_epoch(1);
  CHECK(second > first);
  CHECK(loadout.slot_epoch(0) == first); // untouched slot keeps its epoch
  CHECK(loadout.discard(0, 1));
  CHECK(loadout.slot_epoch(0) > first);
  CHECK(loadout.equip(2, 1));
  const std::uint32_t third = loadout.slot_epoch(2);
  CHECK(loadout.swap(1, 6, 2, 1));
  CHECK(loadout.slot_epoch(1) > second);
  CHECK(loadout.slot_epoch(2) > third);
}

void test_loadout_pending_cache_order() {
  engine::PlayerLoadout loadout;
  CHECK(loadout.equip(0, 17)); // Triplet: three instances per slot
  CHECK(loadout.pending_cache_count() == 3U);
  CHECK(loadout.pending_cache(0, 0) == 0U);
  CHECK(loadout.pending_cache(0, 1) == 1U);
  CHECK(loadout.pending_cache(0, 2) == 2U);
  loadout.set_handle(0, 0, engine::EntityHandle::from_parts(5, 1));
  CHECK(loadout.equip(1, 1)); // Basic: one instance per slot
  CHECK(loadout.pending_cache_count() == 4U);
  CHECK(loadout.pending_cache(1, 0) == 3U);
  CHECK(loadout.pending_cache(1, 1) == 0U);
  CHECK(loadout.pending_cache(1, 2) == 0U);
  CHECK(loadout.equip(2, 1));
  CHECK(loadout.pending_cache(2, 0) == 4U);
  loadout.clear();
  CHECK(loadout.pending_cache_count() == 0U);
  CHECK(loadout.pending_cache(0, 0) == 0U);
}

void test_effect_payload_released_on_destroy() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle target = engine::spawn_entity(
    world, engine::EntityKind::kMob, 1, engine::Vec2(engine::f32(10.0F), engine::f32(0.0F)),
    engine::f32(20.0F));
  CHECK(target.valid());
  engine::Entity* entity = world.entities().get(target);
  CHECK(entity != nullptr);
  const auto payload = engine::make_effect_payload(engine::EffectType::kPoison,
    engine::f32(2.0F), 1000.0, engine::EntityHandle{});
  CHECK(payload->refcount == 1U);
  CHECK(std::has_virtual_destructor_v<engine::EffectPayload>);
  CHECK(engine::attach_effect_payload(*entity, payload));
  CHECK(payload->refcount == 2U);
  const auto second_payload = engine::make_effect_payload(
    engine::EffectType::kPoison, engine::f32(1.0F), 1000.0, engine::EntityHandle{});
  CHECK(second_payload->id == payload->id + 1U);
  CHECK(entity->effect_count == 1U);
  CHECK(world.destroy(target));
  CHECK(payload->refcount == 1U);
  CHECK(payload->active);
}

void test_tick_phase_trace() {
  engine::World world;
  world.initialize();
  engine::tick(world, 50.0);
  static const char* expected[] = {
    "regenerate-players", "drops", "petal-behaviors", "linked-constraints", "population", "ai",
    "deferred-launches", "effects", "area-effects", "petal-phase", "loadout-petals",
    "petal-orbits", "player-controls", "movement", "broadphase", "contacts",
    "reap-dead", "expire-drops", "corpse-sweep", "hit-flush",
  };
  CHECK(world.phase_trace().size() == std::size(expected));
  for (std::size_t index = 0; index < world.phase_trace().size() && index < std::size(expected); ++index)
    CHECK(std::strcmp(world.phase_trace()[index], expected[index]) == 0);

  // A player crossing the pickup radius during movement must be evaluated at
  // the pre-movement position: reject entry this tick, accept departure.
  for (const bool entering : {true, false}) {
    engine::World pickup_world;
    pickup_world.initialize();
    pickup_world.set_auto_populate(false);
    const auto player = engine::spawn_player(pickup_world, "phase", engine::Vec2{}, {});
    const float drop_x = entering ? 74.0F : 69.0F;
    const auto drop = engine::spawn_drop(pickup_world, 2,
      engine::Vec2(engine::f32(drop_x), engine::f32(0.0F)));
    CHECK(player.valid() && drop.valid());
    if (!player.valid() || !drop.valid()) return;
    pickup_world.entities().get(player)->velocity.x = entering ? 0.125 : -0.125;
    pickup_world.set_time_ms(450.0);
    engine::tick(pickup_world, 50.0);
    const auto* moved_player = pickup_world.entities().get(player);
    const auto* pickup = pickup_world.entities().get(drop);
    CHECK(moved_player != nullptr && pickup != nullptr);
    if (moved_player == nullptr || pickup == nullptr) return;
    const float distance_after_movement = drop_x - moved_player->position.x.value;
    CHECK(entering ? distance_after_movement < 70.0F : distance_after_movement > 70.0F);
    CHECK(pickup->pickup_collected == !entering);
    CHECK(pickup_world.loadout().pickup_transfers().size() == (entering ? 0U : 1U));
    CHECK(pickup_world.profile().inventory(0) == (entering ? 0U : 2U));
  }
}

void test_quadtree_update_counter() {
  engine::World world;
  world.initialize();
  world.set_auto_populate(false);
  CHECK(world.quadtree_updates() == 0U);
  engine::tick(world, 50.0);
  CHECK(world.quadtree_updates() == 1U);
  engine::tick(world, 50.0);
  CHECK(world.quadtree_updates() == 2U);
}

void test_deferred_launch_due_order() {
  engine::World world;
  world.initialize();
  const engine::EntityHandle child = engine::spawn_entity(
    world, engine::EntityKind::kPetal, 11, engine::Vec2(engine::f32(0.0F), engine::f32(0.0F)),
    engine::f32(5.0F));
  CHECK(child.valid());
  world.schedule_deferred_launch(100.0, engine::f32(0.0F), {child});
  world.schedule_deferred_launch(50.0, engine::f32(0.0F), {child});
  CHECK(world.deferred_launches().size() == 2U);
  CHECK(world.run_deferred_launches(40.0) == 0U);
  CHECK(world.last_launch_order().empty());
  CHECK(world.run_deferred_launches(100.0) == 2U);
  CHECK(world.last_launch_order().size() == 2U);
  CHECK(world.last_launch_order()[0] == 2U);
  CHECK(world.last_launch_order()[1] == 1U);
  CHECK(world.deferred_launches().empty());
}

int main(int argc, char** argv) {
  tapOutput = argc > 1 && std::strcmp(argv[1], "--tap") == 0;
  if (tapOutput) std::printf("TAP version 13\n");
  runTest("test_f32", test_f32);
  runTest("test_vec2", test_vec2);
  runTest("test_rng", test_rng);
  runTest("test_varint_roundtrip", test_varint_roundtrip);
  runTest("test_byte_reader_bounds", test_byte_reader_bounds);
  runTest("test_xor", test_xor);
  runTest("test_fixed_step", test_fixed_step);
  runTest("test_entity_handle", test_entity_handle);
  runTest("test_entity_pool", test_entity_pool);
  runTest("test_world_tick", test_world_tick);
  runTest("test_spawn_table", test_spawn_table);
  runTest("test_drop_pickup", test_drop_pickup);
  runTest("test_profile_discard_and_swap", test_profile_discard_and_swap);
  runTest("test_discard_removes_petals", test_discard_removes_petals);
  runTest("test_cactus_construction", test_cactus_construction);
  runTest("test_player_spawn", test_player_spawn);
  runTest("test_player_loadout", test_player_loadout);
  runTest("test_populate_world", test_populate_world);
  runTest("test_petals", test_petals);
  runTest("test_petal_orbit", test_petal_orbit);
  runTest("test_spawn_and_movement", test_spawn_and_movement);
  runTest("test_collision", test_collision);
  runTest("test_damage_and_effects", test_damage_and_effects);
  runTest("test_petal_orbit_profiles", test_petal_orbit_profiles);
  runTest("test_input_decoder", test_input_decoder);
  runTest("test_snapshot_writer", test_snapshot_writer);
  runTest("test_original_client_component_mask", test_original_client_component_mask);
  runTest("test_archived_metadata_and_fields", archived_adapter_tests::metadata_and_fields);
  runTest("test_archived_sequence_boundaries", archived_adapter_tests::sequence_boundaries);
  runTest("test_archived_removals_and_events", archived_adapter_tests::removals_and_events);
  runTest("test_archived_corpse_and_restart", archived_adapter_tests::corpse_and_restart);
  runTest("test_snapshot_header", test_snapshot_header);
  runTest("test_original_snapshot_writer", test_original_snapshot_writer);
  runTest("test_dense_field_catalog", test_dense_field_catalog);
  runTest("test_progression", test_progression);
  runTest("test_reward_health_and_level_cap", test_reward_health_and_level_cap);
  runTest("test_player_default_spawn", test_player_default_spawn);
  runTest("test_petal_combat_catalog", test_petal_combat_catalog);
  runTest("test_drop_chances", test_drop_chances);
  runTest("test_loot_retention", test_loot_retention);
  runTest("test_healing_clamp", test_healing_clamp);
  runTest("test_contact_combat_and_loot", test_contact_combat_and_loot);
  runTest("test_multi_instance_orbit_spacing", test_multi_instance_orbit_spacing);
  runTest("test_twin_widens_orbit_spacing", test_twin_widens_orbit_spacing);
  runTest("test_orbit_reindex_after_removal", test_orbit_reindex_after_removal);
  runTest("test_flag41_slot_without_component_keeps_shared_position", test_flag41_slot_without_component_keeps_shared_position);
  runTest("test_peas_attack_consumes_petal", test_peas_attack_consumes_petal);
  runTest("test_rose_healing", test_rose_healing);
  runTest("test_rose_contracts_orbit_and_heals_promptly", test_rose_contracts_orbit_and_heals_promptly);
  runTest("test_rose_timer_arms_at_full_health", test_rose_timer_arms_at_full_health);
  runTest("test_petal_recharge", test_petal_recharge);
  runTest("test_auto_population", test_auto_population);
  runTest("test_ant_hole_children", test_ant_hole_children);
  runTest("test_population_targets", test_population_targets);
  runTest("test_worker_api_default_spawn", test_worker_api_default_spawn);
  runTest("test_ai_target_selection", test_ai_target_selection);
  runTest("test_collision_layer_filter", test_collision_layer_filter);
  runTest("test_status_effects_and_slow", test_status_effects_and_slow);
  runTest("test_attribution_and_legendary", test_attribution_and_legendary);
  runTest("test_loadout_restore_and_backpack", test_loadout_restore_and_backpack);
  runTest("test_petal_special_effects", test_petal_special_effects);
  runTest("test_domain_profile_snapshot", test_domain_profile_snapshot);
  runTest("test_player_loadout_replication", test_player_loadout_replication);
  runTest("test_snapshot_angle_quantization", test_snapshot_angle_quantization);
  runTest("test_camera_snapshot_deltas", test_camera_snapshot_deltas);
  runTest("test_pickup_transfer_snapshot", test_pickup_transfer_snapshot);
  runTest("test_domain_snapshot", test_domain_snapshot);
  runTest("test_domain_boot_visibility", test_domain_boot_visibility);
  runTest("test_full_field_framing", test_full_field_framing);
  runTest("test_full_field_effect_flags", test_full_field_effect_flags);
  runTest("test_input_discard_deletion_then_swap", test_input_discard_deletion_then_swap);
  runTest("test_domain_dense_live_values", test_domain_dense_live_values);
  runTest("test_default_dense_groups", test_default_dense_groups);
  runTest("test_domain_dense_player_wire_boundaries", test_domain_dense_player_wire_boundaries);
  runTest("test_player_input_appearance", test_player_input_appearance);
  runTest("test_ai_family_profiles", test_ai_family_profiles);
  runTest("test_quadtree_order_and_collision_bounds", test_quadtree_order_and_collision_bounds);
  runTest("test_area_effects_and_deferred_launch", test_area_effects_and_deferred_launch);
  runTest("test_attribution_death_and_pickups", test_attribution_death_and_pickups);
  runTest("test_loadout_exact_layout", test_loadout_exact_layout);
  runTest("test_alert_to_attacker_is_local", test_alert_to_attacker_is_local);
  runTest("test_ai_recovered_species_profiles", test_ai_recovered_species_profiles);
  runTest("test_ai_behavior_modifiers", test_ai_behavior_modifiers);
  runTest("test_hornet_stinger_callback", test_hornet_stinger_callback);
  runTest("test_hornet_stinger_lifecycle", test_hornet_stinger_lifecycle);
  runTest("test_ai_target_motion_and_guard", test_ai_target_motion_and_guard);
  runTest("test_centipede_exact_chain_and_rare", test_centipede_exact_chain_and_rare);
  runTest("test_ai_round_before_remainder", test_ai_round_before_remainder);
  runTest("test_ai_activity_branch_and_wire", test_ai_activity_branch_and_wire);
  runTest("test_ant_hole_exact_children", test_ant_hole_exact_children);
  runTest("test_web_tag_domain_side_effects", test_web_tag_domain_side_effects);
  runTest("test_world_frame_tracks_tick", test_world_frame_tracks_tick);
  runTest("test_simulation_frame_layout", test_simulation_frame_layout);
  runTest("test_hit_message_layout", test_hit_message_layout);
  runTest("test_loadout_reserve_cycle_and_packet_cache", test_loadout_reserve_cycle_and_packet_cache);
  runTest("test_quadtree", test_quadtree);
  runTest("test_quadtree_compaction_order", test_quadtree_compaction_order);
  runTest("test_catalog", test_catalog);
  runTest("test_entity_spawn_defaults", test_entity_spawn_defaults);
  runTest("test_rock_construction", test_rock_construction);
  runTest("test_spatial_query", test_spatial_query);
  runTest("test_component_store", test_component_store);

  runTest("test_state_dump", test_state_dump);
  runTest("test_contact_nearest_candidate_first", test_contact_nearest_candidate_first);
  runTest("test_chain_constraint_clamps_segments", test_chain_constraint_clamps_segments);
  runTest("test_worker_api", test_worker_api);
  runTest("test_world_initialize", test_world_initialize);
  runTest("test_protocol_constants", test_protocol_constants);
  runTest("test_collision_bounds_cache_rebuild_counter", test_collision_bounds_cache_rebuild_counter);
  runTest("test_loadout_flag41_pending_cache", test_loadout_flag41_pending_cache);
  runTest("test_loadout_slot_epochs_bump_on_change", test_loadout_slot_epochs_bump_on_change);
  runTest("test_loadout_pending_cache_order", test_loadout_pending_cache_order);
  runTest("test_effect_payload_released_on_destroy", test_effect_payload_released_on_destroy);
  runTest("test_tick_phase_trace", test_tick_phase_trace);
  runTest("test_quadtree_update_counter", test_quadtree_update_counter);
  runTest("test_deferred_launch_due_order", test_deferred_launch_due_order);
  if (tapOutput) {
    std::printf("1..%d\n", testsRun);
    std::printf("# pass %d\n", testsRun - testsFailed);
    std::printf("# fail %d\n", testsFailed);
  }
  if (failures != 0) {
    std::fprintf(stderr, "%d test(s) failed\n", failures);
    return 1;
  }
  if (!tapOutput) std::printf("all engine unit tests passed\n");
  return 0;
}
