#include "engine/sim/tick.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/effects.hpp"
#include "engine/sim/movement.hpp"
#include "engine/sim/petal_effects.hpp"
#include "engine/sim/player.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/spawn.hpp"
#include "pickups.hpp"
#include <algorithm>

namespace engine {

namespace {

/** Run the death domain for any entity whose health reached zero outside the
 * contact/damage path, then drop dead petal orbit records. */
void reap_dead(World& world) {
  auto& entities = world.entities();
  for (auto& entity : entities.entities()) {
    if (!entity.active) continue;
    // Pickups have no original health component; their 0/0 state is not death.
    if (entity.kind == EntityKind::kDrop) continue;
    if (entity.health.value > 0.0F) continue;
    kill_entity(world, entity.handle, EntityHandle{});
  }
  auto& petals = world.petals();
  petals.erase(std::remove_if(petals.begin(), petals.end(),
    [&world](const PetalOrbitState& petal) {
      return world.entities().get(petal.handle) == nullptr;
    }), petals.end());
}

/** Original pickup lifetime countdown (pickup +32, 32..62 s by rarity). */
void expire_drops(World& world) {
  auto& entities = world.entities();
  for (auto& entity : entities.entities()) {
    if (!entity.active) continue;
    if (entity.kind != EntityKind::kDrop) continue;
    if (entity.pickup_transfer_deadline_ms > 0.0
        && world.time_ms() >= entity.pickup_transfer_deadline_ms)
      (void)world.destroy(entity.handle);
  }
}

/** Original health+24 timer: expiry deals the current health as damage;
 * the zero-health body then persists for the ordinary 1000 ms death window. */
void expire_projectiles(World& world, double delta_milliseconds) {
  for (auto& entity : world.entities().entities()) {
    if (!entity.active || entity.kind != EntityKind::kProjectile
        || entity.health.value <= 0.0F || entity.lifetime_remaining_ms <= 0.0) continue;
    entity.lifetime_remaining_ms = std::max(0.0, entity.lifetime_remaining_ms - delta_milliseconds);
    if (entity.lifetime_remaining_ms == 0.0)
      (void)damage_entity(world, entity.handle, entity.health, EntityHandle{});
  }
}

} // namespace

void tick(World& world, double delta_milliseconds) {
  if (!world.initialized()) return;
  // The original tick reads the absolute clock (readClock) while simulating.
  // `time_ms()` is therefore advanced to the tick's target time before any
  // system runs; `advance_tick` at the end only bumps the tick counter.
  world.set_time_ms(world.time_ms() + delta_milliseconds);
  world.clear_phase_trace();
  // Original tick order: timed entities/AI, active damage effects, area
  // targets, equipped petals, petal orbits, movement, collisions, snapshot.
  // The trace is the domain evidence for R05's phase-level comparison.
  regenerate_players(world, delta_milliseconds);
  expire_projectiles(world, delta_milliseconds);
  world.record_phase("regenerate-players");
  (void)advance_pickups(world, delta_milliseconds);
  world.record_phase("drops");
  update_petal_behaviors(world, delta_milliseconds);
  world.record_phase("petal-behaviors");
  constrain_linked_entities(world);
  world.record_phase("linked-constraints");
  // Original advanceTimedEntitiesAndAi replenishes the population *before* the
  // AI steering/timer draws (call 400 at simulation-tick ~1416, AI loop later),
  // so spawn selection consumes RNG before any AI timer redraw in the same
  // tick. The refill also precedes the corpse sweep, so a mob whose one-second
  // corpse expires this tick is not replaced until the next tick.
  if (world.auto_populate()) {
    static const SpawnTable table = SpawnTable::from_catalog();
    (void)replenish_population(world, table);
  }
  world.record_phase("population");
  update_ai(world, delta_milliseconds);
  world.record_phase("ai");
  (void)world.run_deferred_launches(world.time_ms());
  world.record_phase("deferred-launches");
  (void)update_effects(world, delta_milliseconds);
  world.record_phase("effects");
  (void)world.update_area_effects();
  world.record_phase("area-effects");
  // Original updateEquippedPetals computes the overlevel zone countdown first.
  // At the limit it skips the ring phase, slot recharge and all spawning, then
  // damages the petals that are still equipped.
  update_zone_restriction(world, delta_milliseconds);
  if (!world.zone_petals_disabled()) {
    // Original updateEquippedPetals writes loadout+284 before updatePetalOrbits
    // reads it, so the ring phase advances first.
    advance_loadout_orbit_phase(world, delta_milliseconds);
    world.record_phase("petal-phase");
    // Original updateEquippedPetals both recharges/spawns petals and advances
    // the ring phase before updatePetalOrbits; a petal recharged this tick
    // therefore integrates in the same tick (death scenario, 8400 ms: spawn at
    // the owner plus one movement step).
    (void)refresh_loadout_petals(world, delta_milliseconds);
  } else {
    damage_zone_locked_petals(world, delta_milliseconds);
  }
  world.record_phase("loadout-petals");
  update_petal_orbits(world, delta_milliseconds);
  world.record_phase("petal-orbits");
  apply_player_controls(world, delta_milliseconds);
  world.record_phase("player-controls");
  integrate_movement(world, delta_milliseconds);
  world.record_phase("movement");
  // Original tick finishes the entity movement loop, then drains each ant
  // hole's 4848/4852 release table using the health ratio it has reached.
  // Contact damage for this tick resolves afterwards, so a hit taken in this
  // tick releases on the next one, matching the original phase order.
  release_ant_hole_ants(world);
  world.record_phase("ant-hole-release");
  world.record_phase("broadphase");
  update_contact_tree(world);
  (void)resolve_contacts(world);
  world.record_phase("contacts");
  reap_dead(world);
  world.record_phase("reap-dead");
  expire_drops(world);
  world.record_phase("expire-drops");
  for (auto& entity : world.entities().entities()) {
    if (!entity.active || !entity.death_processed) continue;
    if (entity.kind != EntityKind::kPlayer && entity.kind != EntityKind::kPetal && entity.kind != EntityKind::kMob
        && entity.kind != EntityKind::kProjectile) continue;
    if (entity.death_time_ms > world.time_ms()) continue;
    if (entity.handle == world.player()) {
      world.loadout().clear();
      world.set_player(EntityHandle{});
    }
    (void)world.destroy(entity.handle);
  }
  {
    auto& petals = world.petals();
    petals.erase(std::remove_if(petals.begin(), petals.end(),
      [&world](const PetalOrbitState& petal) {
        return world.entities().get(petal.handle) == nullptr;
      }), petals.end());
  }
  world.record_phase("corpse-sweep");
  world.flush_pending_hits();
  world.record_phase("hit-flush");
  world.advance_tick(0.0);
}

} // namespace engine
