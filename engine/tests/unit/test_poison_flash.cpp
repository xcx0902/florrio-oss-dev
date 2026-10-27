#include "engine/sim/combat.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/spawn.hpp"
#include <array>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace {
void require(bool condition, const char* message) {
  if (condition) return;
  std::fprintf(stderr, "Poison feedback regression: %s\n", message);
  std::exit(1);
}
engine::EntityHandle target(engine::World& world) {
  world.initialize(); world.set_auto_populate(false);
  const auto handle=engine::spawn_entity(world,engine::EntityKind::kMob,1,
    {engine::f32(1000),engine::f32(1000)},engine::f32(10));
  auto* entity=world.entities().get(handle);
  entity->health=engine::f32(1000); entity->max_health=entity->health;
  return handle;
}
void run(bool trace) {
  engine::World world;
  auto handle=target(world);
  if (trace) std::printf("{\"options\":[");
  bool first=true;
  for (const auto options : {0U,1U,255U,256U,257U,65280U}) {
    world.advance_tick(50); world.clear_hit_events();
    const auto before=world.entities().get(handle)->health.value;
    engine::damage_entity(world,handle,engine::f32(1),{},options);
    const auto loss=before-world.entities().get(handle)->health.value;
    const bool hit=!world.hit_events().empty();
    require(loss==1,"quiet damage still subtracts health");
    require(hit==((options&255U)==0U),"only the low option byte suppresses hit feedback");
    if (trace) std::printf("%s{\"flags\":%u,\"loss\":1,\"hit\":%s}",first?"":",",options,hit?"true":"false");
    first=false;
  }
  handle=target(world);
  require(engine::apply_effect(world,handle,engine::EffectType::kPoison,engine::f32(11),2000),"install poison");
  if (trace) std::printf("],\"poison\":[");
  for (unsigned tick=1;tick<=25;tick++) {
    world.advance_tick(50); world.clear_hit_events();
    const auto before=world.entities().get(handle)->health.value;
    require(engine::update_effects(world,50)==1,"poison damages on every tick");
    require(world.entities().get(handle)->health.value<before,"health changes between flashes");
    const bool hit=!world.hit_events().empty();
    require(hit==((tick-1)%12==0),"poison feedback occurs every 600ms");
    if (trace) std::printf("%s{\"at\":%u,\"hit\":%s}",tick==1?"":",",tick*50,hit?"true":"false");
  }
  if (trace) std::puts("]}");

  handle=target(world);
  require(engine::apply_effect(world,handle,engine::EffectType::kPoison,engine::f32(1),10000),"boundary poison");
  world.set_time_ms(0); engine::update_effects(world,1); world.clear_hit_events();
  world.set_time_ms(599.999); engine::update_effects(world,1);
  require(world.hit_events().empty(),"strictly before 600ms remains quiet");
  // A stronger replacement must not restart the feedback clock.
  engine::apply_effect(world,handle,engine::EffectType::kPoison,engine::f32(2),10000);
  world.set_time_ms(600); engine::update_effects(world,1);
  require(world.hit_events().size()==1,"exact 600ms permits feedback after replacement");
  world.clear_hit_events();
  engine::damage_entity(world,handle,engine::f32(1));
  require(world.hit_events().size()==1,"ordinary contact damage is not poison-throttled");

  // Suppression never prevents attribution or death.
  handle=target(world);
  const auto source=engine::spawn_entity(world,engine::EntityKind::kMob,1,
    {engine::f32(2000),engine::f32(2000)},engine::f32(10));
  const auto result=engine::damage_entity(world,handle,engine::f32(2000),source,1);
  require(result.died && world.entities().get(handle)->death_processed,"quiet lethal damage runs death");
  require(world.entities().get(handle)->last_attacker==source,"quiet damage retains attribution");
  require(world.hit_events().empty(),"quiet lethal damage sends no flash");
}
}
int main(int argc,char** argv) {
  const bool trace=argc>1 && std::strcmp(argv[1],"--trace")==0;
  run(trace);
  if (!trace) std::puts("Poison damage and feedback checks passed");
}
