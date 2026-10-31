#include "engine/model/entity_relations.hpp"
#include "engine/net/snapshot_codec.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/spatial.hpp"
#include "engine/sim/spawn.hpp"
#include <algorithm>
#include <array>
#include <cstdio>
#include <vector>
#include <utility>
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
  {
    // One-view publication culling must retain the tree's inclusive edges,
    // arena-root rejection and treatment of boxes outside the arena.
    const engine::Aabb arena{engine::f32(-100),engine::f32(-100),engine::f32(100),engine::f32(100)};
    engine::QuadTree tree(arena,4,6);
    std::vector<engine::Aabb> boxes;
    for(int y=-150;y<=150;y+=15)for(int x=-150;x<=150;x+=15) {
      const float radius=static_cast<float>(boxes.size()%20);
      boxes.push_back({engine::f32(x-radius),engine::f32(y-radius),engine::f32(x+radius),engine::f32(y+radius)});
      tree.insert(boxes.size()-1,boxes.back());
    }
    for(int y=-200;y<=200;y+=20)for(int x=-200;x<=200;x+=20) {
      const engine::Aabb view{engine::f32(x),engine::f32(y),engine::f32(x+50),engine::f32(y+50)};
      std::vector<std::size_t> actual,expected;tree.query(view,actual);
      if(arena.intersects(view))for(std::size_t i=0;i<boxes.size();++i)if(boxes[i].intersects(view))expected.push_back(i);
      std::sort(actual.begin(),actual.end());
      check(actual==expected,"single-view publication culling equals tree including arena edges");
    }
  }
  {
    engine::EntityPool pool; pool.reserve_front(3);
    const auto first=pool.allocate().value(), future=pool.allocate().value();
    std::vector<unsigned> visited;
    for(auto& e:pool.active_entities()) {
      visited.push_back(e.handle.index());
      if(e.handle==first) { check(pool.release(future),"release future active slot"); (void)pool.allocate(); }
    }
    check(visited==std::vector<unsigned>{3,5},"live active iterator sees higher births, skips released slots");
    pool.reset(); check(pool.active_count()==0&&pool.active_entities().begin().slot==engine::kEntitySlotCount,"reset clears bitset and count");
    std::vector<engine::EntityHandle> handles;
    for(unsigned i=0;i<engine::kEntitySlotCount;++i)handles.push_back(pool.allocate().value());
    check(!pool.allocate(),"full indexed pool fails allocation");
    check(pool.release(handles[0]),"release low slot");
    const auto recycled=pool.allocate().value();
    check(recycled.index()==0&&recycled.generation()!=handles[0].generation()&&!pool.owns(handles[0]),"recycled generation rejects stale handle");
    std::size_t count=0;for(auto& e:pool.active_entities()){(void)e;++count;}
    check(count==pool.active_count(),"dense bitset count agrees with full pool");
    std::size_t candidates=0,live=0;
    pool.with_ordered_slots([&](auto&& slots){for(auto& e:slots){++candidates;if(e.active)++live;}});
    check(candidates==engine::kEntitySlotCount&&live==pool.active_count(),"dense candidate scan retains original active filtering");
    count=0;
    for(auto& e:pool.active_entities()) {
      if(e.handle.index()==0)check(pool.release(handles[10]),"dense iteration releases future slot");
      ++count;
    }
    check(count==engine::kEntitySlotCount-1,"dense lazy bitmap observes mutation during live ordered iteration");
    const auto next=pool.allocate().value();
    check(next.index()==10&&next.generation()!=handles[10].generation(),"dense churn preserves FIFO generation reuse");
    count=0;for(const auto& e:std::as_const(pool).active_entities()){(void)e;++count;}
    check(count==engine::kEntitySlotCount,"const ordered reads synchronize dense bitmap changes");
  }
  {
    engine::World batch,reference;batch.initialize();reference.initialize();
    const auto table=engine::SpawnTable::from_catalog();
    const std::array<std::uint8_t,8> counts{{8,8,8,8,8,8,8,8}};
    const auto actual=engine::populate_world(batch,table,counts);
    std::vector<engine::EntityHandle> expected;
    for(std::uint8_t band=0;band<8;++band)for(unsigned i=0;i<counts[band];++i){
      const auto query=engine::SpatialQuery::from_world(reference);
      const auto h=engine::spawn_from_band_with_component_draws(reference,table,band,[&](const auto& p){return query.occupied(p);});
      if(h.valid()){reference.entities().get(h)->spawn_band=band;expected.push_back(h);}
    }
    check(actual==expected&&state(batch)==state(reference),"incremental population preserves roots, children and f32 state");
    check(batch.random().state()==reference.random().state()&&batch.random().draws()==reference.random().draws(),"population preserves RNG trial order");
    check(batch.entities().active_count()==reference.entities().active_count(),"population indexes attached births");
  }

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
  // A stamp rollover and world reset cannot resurrect a prior contact slot.
  first.collision().stamp=std::numeric_limits<std::uint32_t>::max();step(first);
  check(first.collision().stamp==1U,"contact generation stamp wraps safely");
  const auto poolCapacity=first.collision().candidate_pool.capacity();step(first);
  check(first.collision().candidate_pool.capacity()==poolCapacity,"steady contact candidate storage is retained");
  const auto next = api.domain_snapshot_bytes(2U);
  engine::ByteReader next_reader(next); (void)engine::read_snapshot_header(next_reader);
  (void)next_reader.read_varint32(); (void)next_reader.read_varint32();
  check(next_reader.read_varint32().value() == 0U, "published events consumed once");
  return failures ? 1 : 0;
}
