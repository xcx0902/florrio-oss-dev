#include "engine/model/world.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/spawn.hpp"
#include "engine/sim/tick.hpp"
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <string_view>
#include <vector>

namespace {
using namespace engine;
void require(bool condition, const char* message) {
  if (!condition) { std::cerr << message << '\n'; std::exit(1); }
}
Vec2 at(float x) { return Vec2(f32(x), f32(0.0F)); }
std::vector<EntityHandle> chain(World& world, EntityHandle head) {
  std::vector<EntityHandle> result{head};
  while (!world.entities().get(result.back())->children.empty())
    result.push_back(world.entities().get(result.back())->children.front());
  return result;
}

void passive_chain() {
  World world; world.initialize(); world.set_auto_populate(false); world.random().seed(787621659U);
  const auto player = spawn_player(world, "target", at(750), PlayerConfig{});
  world.random().seed(787621659U);
  const auto head = spawn_entity_from_defaults(world, EntityKind::kMob, 15, at(0));
  world.entities().get(player)->position = at(100);
  const auto segments = chain(world, head);
  require(segments.size() == 10, "ordinary ten-segment fixture");
  for (auto segment : segments) world.entities().get(segment)->position = at(0);
  update_ai(world, 50);
  // Original205 clears both gates; original423 rechecks them recursively.
  for (auto struck : {head, segments[3]}) {
    (void)damage_entity(world, struck, f32(1.0F), player);
    for (auto segment : segments) {
      const auto& ai = world.entities().get(segment)->ai;
      require(!ai.aggressive && !ai.can_alert, "ordinary centipede remains passive");
      require(!ai.target.valid(), "ordinary segment never receives attacker aggro");
    }
  }
  require(world.destroy(head), "head removal"); update_ai(world, 50);
  require(!world.entities().get(segments[1])->ai.target.valid(), "promoted ordinary head stays passive");
}

void evil_chain(bool hit) {
  World world; world.initialize(); world.set_auto_populate(false); world.random().seed(787621659U);
  const auto player = spawn_player(world, "target", at(750), PlayerConfig{});
  world.random().seed(787621659U);
  const auto head = spawn_entity_from_defaults(world, EntityKind::kMob, 17, at(0));
  world.entities().get(player)->position = at(100);
  const auto segments = chain(world, head);
  require(segments.size() == 10, "evil ten-segment fixture");
  for (auto segment : segments) world.entities().get(segment)->position = at(0);
  if (hit) {
    (void)damage_entity(world, head, f32(1.0F), player);
    for (auto segment : segments)
      require(world.entities().get(segment)->ai.target == player, "original423 alerts every evil descendant immediately");
  }
  update_ai(world, 50);
  for (auto segment : segments)
    require(world.entities().get(segment)->ai.target == player, "original654 inherits predecessor target each tick");
  // Outside the 600-unit acquisition radius, inside its 900-unit retention
  // radius. A missing inherited target cannot be hidden by reacquisition.
  world.entities().get(player)->position = at(750);
  require(world.destroy(head), "evil head removal");
  const auto promoted = segments[1];
  require(!world.entities().get(promoted)->ai.predecessor.valid(), "next segment becomes head");
  require(world.entities().get(promoted)->ai.target == player, "target survives head removal immediately");
  for (int tick = 0; tick < 8; ++tick) {
    update_ai(world, 50);
    require(world.entities().get(promoted)->ai.target == player, "promoted head keeps pursuing without a search delay");
    require((world.entities().get(promoted)->ai.activity_flags & 1U) != 0, "promoted head uses active chase branch");
  }
  require(world.destroy(segments[3]), "middle segment removal"); update_ai(world, 50);
  require(!world.entities().get(segments[4])->ai.predecessor.valid(), "original424 splits the chain at a removed segment");
  require(world.entities().get(segments[4])->ai.target == player, "relinked body retains pursuit target");
}

// Match the original43 fixture in centipede-death-evidence.mjs. Keep the
// corpse alive through its full one-second window; destroying it directly
// bypasses precisely the interval that previously stopped the chase.
void lethal_head(bool trace) {
  World world; world.initialize(); world.set_auto_populate(false); world.set_time_ms(1000);
  const auto player = spawn_player(world, "target", at(750), PlayerConfig{});
  world.random().seed(787621659U);
  const auto head = spawn_entity_from_defaults(world, EntityKind::kMob, 17, at(0));
  const auto segments = chain(world, head);
  require(segments.size() == 10, "lethal head fixture has ten segments");
  for (auto segment : segments) world.entities().get(segment)->position = at(0);
  world.entities().get(player)->position = at(100);
  (void)damage_entity(world, head, f32(1.0F), player);
  world.entities().get(player)->position = at(750);
  const auto promoted = segments[1];
  (void)damage_entity(world, head, world.entities().get(head)->health, player);
  require(world.entities().get(head)->death_processed, "real lethal damage leaves a corpse");
  require(!world.entities().get(promoted)->ai.predecessor.valid(), "original43/424 detaches next head at death, before removal");
  require(world.entities().get(promoted)->owner == head.raw, "ordinary ownership lasts through corpse lifetime");
  // Isolate steering/movement from contacts with the rest of the chain.
  for (std::size_t i = segments.size(); i-- > 2;) require(world.destroy(segments[i]), "isolate promoted head");
  float previous_x = world.entities().get(promoted)->position.x.value;
  if (trace) std::cout << std::setprecision(17);
  for (int step = 1; step <= 22; ++step) {
    tick(world, 50);
    const auto* segment = world.entities().get(promoted);
    require(segment != nullptr && segment->ai.target == player, "promoted head retains its target every tick");
    require((segment->ai.activity_flags & 1U) != 0U, "promoted head chases on the first and subsequent corpse ticks");
    require(segment->velocity.x > 0 && segment->position.x.value > previous_x, "promoted head moves toward player every tick");
    const bool corpse = world.entities().get(head) != nullptr;
    require(corpse == (step < 20), "corpse expires at death+1000ms");
    if (trace) std::cout << "{\"step\":" << step << ",\"x\":" << segment->position.x.value
      << ",\"y\":" << segment->position.y.value << ",\"vx\":" << segment->velocity.x
      << ",\"vy\":" << segment->velocity.y << ",\"activity\":" << static_cast<unsigned>(segment->ai.activity_flags)
      << ",\"corpse\":" << (corpse ? "true" : "false") << "}\n";
    previous_x = segment->position.x.value;
  }
}

void lethal_middle() {
  World world; world.initialize(); world.set_auto_populate(false);
  const auto player = spawn_player(world, "target", at(750), PlayerConfig{});
  world.random().seed(787621659U);
  const auto head = spawn_entity_from_defaults(world, EntityKind::kMob, 17, at(0));
  const auto segments = chain(world, head);
  for (auto segment : segments) world.entities().get(segment)->position = at(0);
  world.entities().get(player)->position = at(100);
  (void)damage_entity(world, head, f32(1.0F), player);
  const auto struck = segments[3], promoted = segments[4];
  (void)damage_entity(world, struck, world.entities().get(struck)->health, player);
  require(!world.entities().get(struck)->ai.predecessor.valid(), "dead middle segment leaves the constraint chain");
  require(!world.entities().get(promoted)->ai.predecessor.valid(), "next segment becomes an independent root on middle death");
  update_ai(world, 50);
  require(world.entities().get(promoted)->velocity.x > 0, "split tail starts pursuing immediately");
  const Vec2 before = world.entities().get(promoted)->position;
  constrain_linked_entities(world);
  require(world.entities().get(promoted)->position.x.value == before.x.value,
          "dead predecessor cannot pull the promoted root backward");
  require(world.destroy(struck), "middle corpse removal");
  require(!world.entities().get(promoted)->ai.predecessor.valid(), "removing corpse cannot reconnect a split tail");
}
} // namespace

int main(int argc, char** argv) {
  if (argc == 2 && std::string_view(argv[1]) == "--pursuit-trace") { lethal_head(true); return 0; }
  passive_chain(); evil_chain(true); evil_chain(false); lethal_head(false); lethal_middle();
  std::cout << "centipede parity: passive chain, inherited pursuit, lethal head/middle damage and corpse lifetime passed\n";
}
