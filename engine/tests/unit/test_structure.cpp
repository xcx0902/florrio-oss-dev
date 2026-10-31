#include "engine/model/entity_relations.hpp"
#include "engine/net/snapshot_codec.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/spawn.hpp"
#include <array>
#include <cstdio>
#include <vector>
namespace {
int failures = 0;
void check(bool value, const char* name) { if (!value) { ++failures; std::fprintf(stderr, "FAIL %s\n", name); } }
void seed(engine::World& world, float offset) {
  world.initialize();
  for (unsigned index = 0; index < 5U; ++index) {
    const auto h = engine::spawn_entity_from_defaults(world, engine::EntityKind::kMob, 4U,
      {engine::f32(offset + static_cast<float>(index) * 9.0F), engine::f32(0.0F)});
    check(h.valid(), "seed mob");
  }
}
std::vector<double> state(const engine::World& world) {
  std::vector<double> values;
  for (const auto& e : world.entities().entities()) if (e.active) {
    values.insert(values.end(), {e.position.x.value, e.position.y.value, e.velocity.x, e.velocity.y, e.health.value});
  }
  return values;
}
void step(engine::World& world) { world.advance_tick(50.0); engine::update_contact_tree(world); (void)engine::resolve_contacts(world); }
}
int main() {
  engine::World first, second, isolated_first, isolated_second;
  seed(first, 0); seed(second, 600); seed(isolated_first, 0); seed(isolated_second, 600);
  for (unsigned i = 0; i < 12; ++i) { step(first); step(second); }
  for (unsigned i = 0; i < 12; ++i) step(isolated_first);
  for (unsigned i = 0; i < 12; ++i) step(isolated_second);
  check(state(first) == state(isolated_first), "interleaved first collision world equals isolated");
  check(state(second) == state(isolated_second), "interleaved second collision world equals isolated");
  check(&first.collision().tree != &second.collision().tree, "world owns tree");
  first.apply_input(3U, engine::f32(1.0F), engine::f32(20.0F));
  first.initialize();
  check(first.input().buttons == 0U && first.input().strength.value == 0.0F, "initialize clears input");
  check(first.destroyed().empty() && first.collision().tick == std::numeric_limits<std::uint64_t>::max(), "initialize clears destruction and tree epoch");
  check(first.bounds_rebuilds() == 0U && first.quadtree_updates() == 0U && first.phase_draws().empty(), "initialize clears scratch counters and phase records");
  const auto a = engine::spawn_entity_from_defaults(first, engine::EntityKind::kMob, 4U, {});
  const auto b = engine::spawn_entity_from_defaults(first, engine::EntityKind::kMob, 4U, {});
  first.entities().get(a)->owner = b.raw; first.entities().get(b)->owner = a.raw;
  check(!engine::owning_player(first, a).valid(), "ownership cycle terminates");
  check(engine::controlling_root(first, a) == a, "bounded root keeps established 16-link semantics");
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
  engine::WorkerApi api; api.init();
  const std::array<std::uint8_t, 4> chat{{1U, 5U, 'x', 0U}};
  check(api.send(chat, {}), "typed chat accepted");
  api.enqueue_domain_snapshot(1U);
  const auto output = api.flush();
  check(output.size() == 1U && api.flush().empty(), "flush drains once");
  engine::ByteReader reader(output.front().payload);
  (void)engine::read_snapshot_header(reader);
  check(reader.read_varint32().value() == 0U && reader.read_varint32().value() == 0U && reader.read_varint32().value() == 1U, "one typed chat event");
  check(reader.read_u8().value() == 9U && reader.read_cstring().value() == "x" && reader.eof(), "chat encoding is codec-owned");
  const auto next = api.domain_snapshot_bytes(2U);
  engine::ByteReader next_reader(next); (void)engine::read_snapshot_header(next_reader);
  (void)next_reader.read_varint32(); (void)next_reader.read_varint32();
  check(next_reader.read_varint32().value() == 0U, "published events consumed once");
  return failures ? 1 : 0;
}
