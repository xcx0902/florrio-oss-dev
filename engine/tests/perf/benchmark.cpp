#include "engine/core/perf.hpp"
#include "engine/net/worker_api.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/spawn.hpp"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstddef>
#include <new>
#include <string>
#include <vector>
// Track allocator calls and retained bytes, including the entity pool. The
// header preserves malloc's alignment; no telemetry allocations occur here.
struct alignas(std::max_align_t) Allocation { std::size_t size; };
static std::uint64_t live_bytes=0;
void* operator new(std::size_t size) {
  auto* p=static_cast<Allocation*>(std::malloc(sizeof(Allocation)+size));
  if(!p) std::abort(); p->size=size; live_bytes+=size;
  if(engine::perf::current) { auto& m=*engine::perf::current; ++m.allocations; m.live=live_bytes; m.peak=std::max(m.peak,live_bytes); }
  return p+1;
}
void operator delete(void* p) noexcept { if(p) { auto* a=static_cast<Allocation*>(p)-1; live_bytes-=a->size; std::free(a); } }
void* operator new[](std::size_t s) { return ::operator new(s); }
void operator delete[](void* p) noexcept { ::operator delete(p); }
void operator delete(void* p,std::size_t) noexcept { ::operator delete(p); }
void operator delete[](void* p,std::size_t) noexcept { ::operator delete(p); }
using Clock=std::chrono::steady_clock;
static double ms(Clock::time_point start) { return std::chrono::duration<double,std::milli>(Clock::now()-start).count(); }
static std::uint64_t digest=1469598103934665603ULL;
static void hash(std::uint64_t n) { for(int i=0;i<8;++i) { digest^=(n>>(8*i))&255U; digest*=1099511628211ULL; } }
static void state(const engine::World& w) {
  hash(w.tick()); hash(w.random().state()); hash(w.random().draws()); hash(w.rng().state());
  for(const auto& e:w.entities().entities()) if(e.active) {
    hash(e.handle.raw); hash(static_cast<unsigned>(e.kind)); hash(e.type_id); hash(e.owner);
    hash(e.position.x.bits()); hash(e.position.y.bits()); hash(e.angle.bits()); hash(e.radius.bits());
    hash(e.health.bits()); hash(e.max_health.bits()); hash(e.ai.target.raw); hash(e.death_processed); hash(e.spawn_band);
    for(auto child:e.children) hash(child.raw);
    for(const auto& effect:e.effects) if(effect.active) { hash(static_cast<unsigned>(effect.type)); hash(effect.source.raw); hash(effect.intensity.bits()); }
  }
  for(const auto& e:w.hit_events()) { hash(e.target.raw); }
}
static void send(engine::WorkerApi& api,std::uint32_t seq,std::uint32_t op) {
  engine::ByteWriter w; w.write_varint32(seq); w.write_varint32(op);
  if(op==6) { w.write_u8('M'); w.write_u8('4'); w.write_u8(0); }
  if(op==12) { w.write_varint32(1); w.write_f32_le(static_cast<float>(seq%100)*0.0625F); w.write_f32_le(200); }
  if(!api.send(w.bytes(),{})) std::abort();
}
int main(int argc,char** argv) {
  const std::string name=argc>1?argv[1]:"idle-world";
  engine::perf::Metrics metrics; engine::perf::current=&metrics;
  std::vector<double> samples; samples.reserve(10000);
  std::array<std::vector<double>,32> phase_samples;
  for (auto& values : phase_samples) values.reserve(10000);
  std::uint64_t bytes=0,packets=0; std::uint32_t seq=1, cycles=0;
  std::size_t entities=0, areas=0, queued=0;
  auto api=std::make_unique<engine::WorkerApi>();
  auto start=Clock::now();
  const bool area=name.rfind("many-area-effects-",0)==0;
  api->init(!area && name!="clustered-contacts" && name!="lifecycle-soak");
  if(name=="lifecycle-soak") for(int i=0;i<24;++i) (void)api->spawn(engine::EntityKind::kMob,i%2?4:6,{engine::f32(float(i%6)*60-180),engine::f32(float(i/6)*60-120)});
  if(name=="boot-population") { samples.push_back(ms(start)); state(api->world()); }
  else if(area) {
    areas=std::strtoul(name.c_str()+18,nullptr,10);
    for(int i=0;i<300;++i) (void)api->spawn(engine::EntityKind::kMob,1,{engine::f32(float(i%20)*30),engine::f32(float(i/20)*30)});
    std::size_t added=0;
    for(const auto& e:api->world().entities().entities()) if(e.active && added++<areas)
      (void)engine::add_area_effect(api->world(),e.handle,engine::f32(250),engine::EffectType::kSlow,engine::f32(0.5F),1e9);
    metrics={};
    for(int i=0;i<500;++i) { start=Clock::now(); (void)api->world().update_area_effects(); samples.push_back(ms(start)); }
    state(api->world());
  } else if(name=="spawn-refill") {
    std::vector<engine::EntityHandle> remove;
    for(const auto& e:api->world().entities().entities()) if(e.active && e.spawn_band<8 && e.handle.index()%3==0) remove.push_back(e.handle);
    for(auto h:remove) (void)api->world().destroy(h);
    metrics={}; start=Clock::now();
    (void)engine::replenish_population(api->world(),engine::SpawnTable::from_catalog());
    samples.push_back(ms(start)); state(api->world());
  } else {
    if(name=="clustered-contacts") {
      for(int i=0;i<300;++i) (void)api->spawn(engine::EntityKind::kMob,4,{engine::f32(float(i%20)*10),engine::f32(float(i/20)*10)});
    }
    const bool combat=name=="moving-combat" || name=="lifecycle-soak";
    if(combat) send(*api,seq++,6);
    // Full default population, same 200-tick warmup for all time-series cases.
    for(int i=0;i<200;++i) { api->think(); api->enqueue_domain_snapshot(i+1); (void)api->flush(); }
    metrics={};
    const int count=name=="lifecycle-soak"?10000:2000;
    for(int i=0;i<count;++i) {
      if(combat) {
        if(!api->world().entities().get(api->world().player())) { send(*api,seq++,6); ++cycles; }
        else { send(*api,seq++,12); if(name=="lifecycle-soak" && i%200==150) send(*api,seq++,3); }
      }
      const auto phase_before=metrics.phase_ms;
      start=Clock::now(); api->think();
      engine::perf::phase_start(); api->enqueue_domain_snapshot(i+201); engine::perf::phase("publish");
      auto output=api->flush();
      samples.push_back(ms(start));
      for(std::size_t phase=0;phase<metrics.phases;++phase)
        phase_samples[phase].push_back(metrics.phase_ms[phase]-phase_before[phase]);
      for(const auto& packet:output) { bytes+=packet.payload.size(); ++packets; for(auto b:packet.payload) hash(b); }
      if(i%10==0) state(api->world());
    }
    state(api->world()); queued=api->flush().size();
  }
  entities=api->world().entities().active_count();
  const auto rng=api->world().random().state(), draws=api->world().random().draws();
  const auto retained=live_bytes, peak=metrics.peak;
  api.reset(); const auto released=live_bytes;
  engine::perf::current=nullptr;
  std::printf("{\"scenario\":\"%s\",\"seed\":285456437,\"entities\":%zu,\"areas\":%zu,\"cycles\":%u,\"queueEnd\":%zu,\"snapshotBytes\":%llu,\"packets\":%llu,\"rng\":%u,\"rngDraws\":%u,\"digest\":\"%016llx\",",name.c_str(),entities,areas,cycles,queued,(unsigned long long)bytes,(unsigned long long)packets,rng,draws,(unsigned long long)digest);
  std::printf("\"counters\":{\"visitedSlots\":%llu,\"spatialBuilds\":%llu,\"treeInserts\":%llu,\"treeUpdates\":%llu,\"treeQueries\":%llu,\"contacts\":%llu,\"bounds\":%llu,\"allocations\":%llu,\"candidates\":%llu,\"fields\":%llu},\"memory\":{\"retained\":%llu,\"peak\":%llu,\"afterDispose\":%llu},\"phasesMs\":{",(unsigned long long)metrics.visits,(unsigned long long)metrics.builds,(unsigned long long)metrics.inserts,(unsigned long long)metrics.updates,(unsigned long long)metrics.queries,(unsigned long long)metrics.contacts,(unsigned long long)metrics.bounds,(unsigned long long)metrics.allocations,(unsigned long long)metrics.candidates,(unsigned long long)metrics.fields,(unsigned long long)retained,(unsigned long long)peak,(unsigned long long)released);
  for(std::size_t i=0;i<metrics.phases;++i) std::printf("%s\"%s\":%.6f",i?",":"",metrics.phase_names[i],metrics.phase_ms[i]);
  std::printf("},\"phaseSamplesMs\":{");
  for(std::size_t phase=0;phase<metrics.phases;++phase) {
    std::printf("%s\"%s\":[",phase?",":"",metrics.phase_names[phase]);
    for(std::size_t i=0;i<phase_samples[phase].size();++i)
      std::printf("%s%.6f",i?",":"",phase_samples[phase][i]);
    std::printf("]");
  }
  std::printf("},\"samplesMs\":[");
  for(std::size_t i=0;i<samples.size();++i) std::printf("%s%.6f",i?",":"",samples[i]);
  std::puts("]}");
}
