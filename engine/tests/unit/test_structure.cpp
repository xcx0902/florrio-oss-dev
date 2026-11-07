#include "../support/single_player.hpp"
#include "engine/model/entity_relations.hpp"
#include "engine/net/snapshot_codec.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/net/catalog_id.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/spatial.hpp"
#include "engine/sim/spawn.hpp"
#include <algorithm>
#include <array>
#include <cstdio>
#include <vector>
#include <utility>
#include <type_traits>

static_assert(std::is_invocable_v<decltype(&engine::Catalog::petal), const engine::Catalog&,
                                  engine::catalog::PetalId>);
static_assert(!std::is_invocable_v<decltype(&engine::Catalog::petal), const engine::Catalog&,
                                   engine::catalog::SpeciesId>);
static_assert(
    !std::is_invocable_v<decltype(&engine::Catalog::petal), const engine::Catalog&, std::uint16_t>);
static_assert(!std::is_invocable_v<decltype(&engine::Catalog::entity), const engine::Catalog&,
                                   engine::catalog::PetalId>);
static_assert(
    !std::is_invocable_v<decltype(&engine::PlayerProfile::set_inventory), engine::PlayerProfile&,
                         std::uint8_t, engine::catalog::SpeciesId>);
static_assert(!std::is_invocable_v<decltype(&engine::PlayerLoadout::equip), engine::PlayerLoadout&,
                                   std::uint8_t, std::uint16_t>);

namespace {
int failures = 0;
void check(bool value, const char* name) {
  if (!value) {
    ++failures;
    std::fprintf(stderr, "FAIL %s\n", name);
  }
}
void seed(engine::World& world, float offset) {
  world.initialize();
  for (unsigned index = 0; index < 5U; ++index) {
    const auto h = engine::spawn_entity_from_defaults(
        world, engine::EntityKind::kMob, engine::catalog::SpeciesId::kLadybug,
        {engine::f32(offset + static_cast<float>(index) * 9.0F), engine::f32(0.0F)});
    check(h.valid(), "seed mob");
  }
}
std::vector<double> state(const engine::World& world) {
  std::vector<double> values;
  for (const auto& e : world.entities().entities()) {
    if (e.active) {
      values.insert(values.end(), {e.position.x.value, e.position.y.value, e.velocity.x,
                                   e.velocity.y, e.health.value});
    }
  }
  return values;
}
void step(engine::World& world) {
  world.advance_tick(50.0);
  engine::update_contact_tree(world);
  (void)engine::resolve_contacts(world);
}
}
int main() {
  {
    engine::World world;
    world.initialize();
    const auto hole = engine::spawn_entity(
        world, engine::EntityKind::kMob, engine::catalog::SpeciesId::kAntHole, {}, engine::f32(1));
    const auto peas = engine::spawn_entity(world, engine::EntityKind::kPetal,
                                           engine::catalog::PetalId::kPeasRare, {}, engine::f32(1));
    const auto& mob = *world.entities().get(hole);
    const auto& petal = *world.entities().get(peas);
    check(mob.species_id == engine::catalog::SpeciesId::kAntHole &&
              mob.petal_id == engine::catalog::PetalId::kNone &&
              petal.petal_id == engine::catalog::PetalId::kPeasRare &&
              petal.species_id == engine::catalog::SpeciesId::kNone,
          "overlapping catalog numbers retain distinct identities");
    check(!mob.uses_mass_weighted_response && petal.uses_mass_weighted_response,
          "ant-hole initialization cannot affect a petal with the same number");
    check(engine::net::catalog_type_id(mob) == 11U && engine::net::catalog_type_id(petal) == 11U,
          "typed identities preserve the legacy wire number");
    const auto source = engine::damage_source(world, peas);
    world.record_death(mob, source);
    const auto& death = world.deaths().back();
    check(source.petal_id == engine::catalog::PetalId::kPeasRare &&
              source.species_id == engine::catalog::SpeciesId::kNone &&
              death.species_id == engine::catalog::SpeciesId::kAntHole &&
              death.attacker_petal == engine::catalog::PetalId::kPeasRare &&
              death.attacker_species == engine::catalog::SpeciesId::kNone,
          "damage attribution and death records preserve both catalog namespaces");
    check(engine::Catalog::instance().petal(static_cast<engine::catalog::PetalId>(65535)) ==
                  nullptr &&
              engine::Catalog::instance().entity(static_cast<engine::catalog::SpeciesId>(65535)) ==
                  nullptr,
          "unknown enum values remain missing catalog entries");
  }
  {
    // One-view publication culling must retain the tree's inclusive edges,
    // arena-root rejection and treatment of boxes outside the arena.
    const engine::Aabb arena{engine::f32(-100), engine::f32(-100), engine::f32(100),
                             engine::f32(100)};
    engine::QuadTree tree(arena, 4, 6);
    std::vector<engine::Aabb> boxes;
    for (int y = -150; y <= 150; y += 15) {
      for (int x = -150; x <= 150; x += 15) {
        const float radius = static_cast<float>(boxes.size() % 20);
        boxes.push_back({engine::f32(x - radius), engine::f32(y - radius), engine::f32(x + radius),
                         engine::f32(y + radius)});
        tree.insert(boxes.size() - 1, boxes.back());
      }
    }
    for (int y = -200; y <= 200; y += 20) {
      for (int x = -200; x <= 200; x += 20) {
        const engine::Aabb view{engine::f32(x), engine::f32(y), engine::f32(x + 50),
                                engine::f32(y + 50)};
        std::vector<std::size_t> actual, expected;
        tree.query(view, actual);
        if (arena.intersects(view)) {
          for (std::size_t i = 0; i < boxes.size(); ++i) {
            if (boxes[i].intersects(view)) {
              expected.push_back(i);
            }
          }
        }
        std::sort(actual.begin(), actual.end());
        check(actual == expected,
              "single-view publication culling equals tree including arena edges");
      }
    }
  }
  {
    engine::EntityPool pool;
    pool.reserve_front(3);
    const auto first = pool.allocate().value(), future = pool.allocate().value();
    std::vector<unsigned> visited;
    for (auto& e : pool.active_entities()) {
      visited.push_back(e.handle.index());
      if (e.handle == first) {
        check(pool.release(future), "release future active slot");
        (void)pool.allocate();
      }
    }
    check(visited == std::vector<unsigned>{3, 5},
          "live active iterator sees higher births, skips released slots");
    pool.reset();
    check(pool.active_count() == 0 &&
              pool.active_entities().begin().slot == engine::kEntitySlotCount,
          "reset clears bitset and count");
    std::vector<engine::EntityHandle> handles;
    for (unsigned i = 0; i < engine::kEntitySlotCount; ++i) {
      handles.push_back(pool.allocate().value());
    }
    check(!pool.allocate(), "full indexed pool fails allocation");
    check(pool.release(handles[0]), "release low slot");
    const auto recycled = pool.allocate().value();
    check(recycled.index() == 0 && recycled.generation() != handles[0].generation() &&
              !pool.owns(handles[0]),
          "recycled generation rejects stale handle");
    std::size_t count = 0;
    for (auto& e : pool.active_entities()) {
      (void)e;
      ++count;
    }
    check(count == pool.active_count(), "dense bitset count agrees with full pool");
    std::size_t candidates = 0, live = 0;
    pool.with_ordered_slots([&](auto&& slots) {
      for (auto& e : slots) {
        ++candidates;
        if (e.active) {
          ++live;
        }
      }
    });
    check(candidates == engine::kEntitySlotCount && live == pool.active_count(),
          "dense candidate scan keeps active-only filtering");
    count = 0;
    for (auto& e : pool.active_entities()) {
      if (e.handle.index() == 0) {
        check(pool.release(handles[10]), "dense iteration releases future slot");
      }
      ++count;
    }
    check(count == engine::kEntitySlotCount - 1,
          "dense lazy bitmap observes mutation during live ordered iteration");
    const auto next = pool.allocate().value();
    check(next.index() == 10 && next.generation() != handles[10].generation(),
          "dense churn preserves FIFO generation reuse");
    count = 0;
    for (const auto& e : std::as_const(pool).active_entities()) {
      (void)e;
      ++count;
    }
    check(count == engine::kEntitySlotCount,
          "const ordered reads synchronize dense bitmap changes");
  }
  {
    engine::World batch, reference;
    batch.initialize();
    reference.initialize();
    const auto table = engine::SpawnTable::from_catalog();
    const std::array<std::uint8_t, 8> counts{{8, 8, 8, 8, 8, 8, 8, 8}};
    const auto actual = engine::populate_world(batch, table, counts);
    // Independent band-entry reference: each spawn rebuilds the broad-phase
    // query from the live world, and the species initializers are spelled out
    // here so the population comparison cannot hide a factory regression.
    const auto reference_factory = [&reference](const engine::SpawnBandEntry& entry,
                                                const engine::SpawnPosition& position) {
      const engine::Vec2 point(position.x, position.y);
      switch (entry.entity_type) {
        case engine::catalog::SpeciesId::kRock:
          return engine::spawn_rock_with_drop_draws(reference, point, false, reference.random());
        case engine::catalog::SpeciesId::kBoulder:
          return engine::spawn_rock_with_drop_draws(reference, point, true, reference.random());
        case engine::catalog::SpeciesId::kCactus:
          return engine::spawn_cactus_with_drop_draws(reference, point, reference.random());
        default:
          return engine::spawn_entity_from_defaults(reference, engine::EntityKind::kMob,
                                                    entry.entity_type, point);
      }
    };
    std::vector<engine::EntityHandle> expected;
    for (std::uint8_t band = 0; band < 8; ++band) {
      for (unsigned i = 0; i < counts[band]; ++i) {
        const auto query = engine::SpatialQuery::from_world(reference);
        const auto h = table.spawn_from_band(
            reference, band, [&](const auto& p) { return query.occupied(p); }, reference_factory);
        if (h.valid()) {
          reference.entities().get(h)->spawn_band = band;
          expected.push_back(h);
        }
      }
    }
    check(actual == expected && state(batch) == state(reference),
          "incremental population preserves roots, children and f32 state");
    check(batch.random().state() == reference.random().state() &&
              batch.random().draws() == reference.random().draws(),
          "population preserves RNG trial order");
    check(batch.entities().active_count() == reference.entities().active_count(),
          "population indexes attached births");
  }

  engine::World first, second, isolated_first, isolated_second;
  seed(first, 0);
  seed(second, 600);
  seed(isolated_first, 0);
  seed(isolated_second, 600);
  for (unsigned i = 0; i < 12; ++i) {
    step(first);
    step(second);
  }
  for (unsigned i = 0; i < 12; ++i) {
    step(isolated_first);
  }
  for (unsigned i = 0; i < 12; ++i) {
    step(isolated_second);
  }
  check(state(first) == state(isolated_first), "interleaved first collision world equals isolated");
  check(state(second) == state(isolated_second),
        "interleaved second collision world equals isolated");
  check(&first.collision().tree != &second.collision().tree, "world owns tree");
  engine::test::input(first, 3U, engine::f32(1.0F), engine::f32(20.0F));
  first.initialize();
  check(engine::test::player(first).input().buttons == 0U &&
            engine::test::player(first).input().strength.value == 0.0F,
        "initialize clears input");
  check(first.destroyed().empty() &&
            first.collision().tick == std::numeric_limits<std::uint64_t>::max(),
        "initialize clears destruction and tree epoch");
  check(first.bounds_rebuilds() == 0U && first.quadtree_updates() == 0U &&
            first.phase_draws().empty(),
        "initialize clears scratch counters and phase records");
  const auto a = engine::spawn_entity_from_defaults(first, engine::EntityKind::kMob,
                                                    engine::catalog::SpeciesId::kLadybug, {});
  const auto b = engine::spawn_entity_from_defaults(first, engine::EntityKind::kMob,
                                                    engine::catalog::SpeciesId::kLadybug, {});
  first.entities().get(a)->owner = b.raw;
  first.entities().get(b)->owner = a.raw;
  check(!engine::owning_player(first, a).valid(), "ownership cycle terminates");
  check(engine::controlling_root(first, a) == a,
        "bounded root keeps established 16-link semantics");
  first.entities().get(a)->owner = std::numeric_limits<std::uint32_t>::max();
  check(first.destroy(a), "destroy accepted");
  check(!engine::owning_player(first, a).valid(), "stale generation has no player");
  check(first.destroyed().size() == 1U && !first.destroy(a), "one notification per destruction");
  engine::SnapshotEncoder encoder;
  encoder.begin(1U);
  const auto empty = encoder.finish();
  encoder.write_mask_float_field(b, 1U, 2U, 4.0F);
  encoder.write_mask_byte_field(b, 1U, 53U, 4U);
  encoder.write_mask_double_field(b, 1U, 59U, 1.0);
  check(encoder.finish() == empty, "wrong generated field types rejected without partial writes");
  const std::array<engine::SnapshotEncoder::FloatField, 2> reversed{{{55U, 1.0F}, {53U, 2.0F}}};
  encoder.write_mask_float_fields(b, 1U, reversed);
  check(encoder.finish() == empty, "nonascending fields rejected atomically");
  engine::WorkerApi api;
  api.init();
  const std::array<std::uint8_t, 4> chat{{1U, 5U, 'x', 0U}};
  check(api.send(chat, {}), "typed chat accepted");
  api.enqueue_domain_snapshot(1U);
  const auto output = api.flush();
  check(output.size() == 1U && api.flush().empty(), "flush drains once");
  engine::ByteReader reader(output.front().payload);
  (void)engine::read_snapshot_header(reader);
  check(reader.read_varint32().value() == 0U && reader.read_varint32().value() == 0U &&
            reader.read_varint32().value() == 1U,
        "one typed chat event");
  check(reader.read_u8().value() == 9U && reader.read_cstring().value() == "x" && reader.eof(),
        "chat encoding is codec-owned");
  // A stamp rollover and world reset cannot resurrect a prior contact slot.
  first.collision().stamp = std::numeric_limits<std::uint32_t>::max();
  step(first);
  check(first.collision().stamp == 1U, "contact generation stamp wraps safely");
  const auto poolCapacity = first.collision().candidate_pool.capacity();
  step(first);
  check(first.collision().candidate_pool.capacity() == poolCapacity,
        "steady contact candidate storage is retained");
  const auto next = api.domain_snapshot_bytes(2U);
  engine::ByteReader next_reader(next);
  (void)engine::read_snapshot_header(next_reader);
  (void)next_reader.read_varint32();
  (void)next_reader.read_varint32();
  check(next_reader.read_varint32().value() == 0U, "published events consumed once");
  return failures ? 1 : 0;
}
