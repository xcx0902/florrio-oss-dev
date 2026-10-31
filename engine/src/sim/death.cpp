#include "engine/sim/combat.hpp"
#include "engine/model/entity_relations.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/petals.hpp"
#include "engine/sim/progression.hpp"
#include "engine/sim/player.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <vector>

namespace engine {

namespace {

std::string killer_name_for(const World& world, EntityHandle attacker) {
  // Original 43 copies the *destroying entity's own name string* (entity+160).
  // Petals and projectiles inherit their owner's name; mobs and flowers use
  // their catalog/player name. An entity's killer_name is the name of whoever
  // killed that entity, so it must never be reused here: a mob that the player
  // had just killed would otherwise report the player's own flower name.
  EntityHandle source = attacker;
  bool rooted = false;
  for (std::uint32_t guard = 0; guard < 16U; ++guard) {
    const Entity* entity = world.entities().get(source);
    if (entity == nullptr) return {};
    if (entity->kind == EntityKind::kPlayer) return world.player_name();
    if (entity->kind == EntityKind::kMob) { rooted = true; break; }
    if (entity->kind != EntityKind::kPetal && entity->kind != EntityKind::kProjectile) break;
    if (entity->owner == std::numeric_limits<std::uint32_t>::max()) break;
    source = EntityHandle{entity->owner};
  }
  // A petal/projectile with no owner chain is nameless in the original name
  // component; do not invent a catalog name for it.
  if (!rooted) return {};
  const Entity* entity = world.entities().get(source);
  if (entity == nullptr || entity->type_id == 0U) return {};
  const auto* definition = Catalog::instance().entity(entity->type_id);
  return definition == nullptr ? std::string{} : std::string(definition->name);
}

} // namespace

void kill_entity(World& world, EntityHandle target, EntityHandle attacker) {
  Entity* entity = world.entities().get(target);
  if (entity == nullptr || entity->death_processed) return;
  if (!attacker.valid() && entity->last_attacker.valid()) attacker = entity->last_attacker;
  entity->death_processed = true;
  // Original43 calls424 immediately, a full second before corpse removal.
  // Leave the ordinary owner/children alive, but let the next segment steer
  // independently on the next AI tick instead of following the dead head.
  world.detach_linked_entities(target);
  const EntityKind kind = entity->kind;
  const Vec2 position = entity->position;
  const std::uint16_t type_id = entity->type_id;
  const Entity* attacker_entity = world.entities().get(attacker);
  world.record_death(kind, type_id, position,
                     attacker_entity != nullptr ? attacker_entity->kind : EntityKind::kNone,
                     attacker_entity != nullptr ? attacker_entity->type_id : 0U);
  if (kind == EntityKind::kPlayer || kind == EntityKind::kMob) {
    entity->killer_name = killer_name_for(world, attacker);
    // Original updateKillerName writes the destroying entity's name into the
    // player's own replicated string field. Keep the world-level copy for the
    // local death payload only: mobs keep dying (and may die with no attacker)
    // after the player, and those later deaths must not erase or replace the
    // name the death screen is about to show.
    if (kind == EntityKind::kPlayer && target == world.player())
      world.set_last_killer(attacker, entity->killer_name);
  }

  if (kind == EntityKind::kPetal) {
    // Original 43 clears the equipped handle and arms the recharge timer first;
    // the petal entity itself survives as a health-0 corpse and is reaped one
    // second later (probed in the attack trace: hp reaches 0 at ~2.4 s and the
    // world entity count drops at 3.35 s).
    (void)on_petal_destroyed(world, target);
    entity->health = f32(0.0F);
    // The shipped attack trace dies at 2350 ms and is reaped at 3350 ms, i.e.
    // one second later regardless of the attack button; the earlier 800 ms
    // "attack-held" branch was not observable in any golden trace (R01).
    entity->death_time_ms = world.time_ms() + 1000.0;
    return;
  }

  if (kind == EntityKind::kPlayer) {
    entity->death_flag = true;
    entity->death_time_ms = world.time_ms() + 1000.0;
    // Original43 retains the body's carried loadout throughout its corpse
    // window. retainPlayerLoot writes a separate loot component and the peer's
    // lost-item list; it does not replace the carried inventory in-place.
    PlayerProfile retained_profile = world.profile();
    const LootResult loot = retain_player_loot(retained_profile, world.random(), world.death_shuffle_random());
    world.profile().set_lost_items(loot.lost_count, loot.lost);
    // The first three eligible petals are ground loot. The remainder (up to
    // ten, historically named `lost`) belongs to the controller and respawns.
    world.set_last_death_kept(std::span<const std::uint16_t>(loot.lost.data(), loot.lost_count));
    std::vector<std::uint16_t> retained(loot.retained.begin(),
                                        loot.retained.begin() + loot.retained_count);
    (void)spawn_loot_drops(world, retained, position, target);
    world.set_last_death(world.loadout().score(), world.profile().level());
    // Original 43 walks all 24 owned handles (8 slots x 3 instances), damages
    // live children to zero and queues handle-less children for removal.
    std::array<EntityHandle, 24> children{};
    std::array<std::uint8_t, 24> child_slots{};
    std::array<std::uint8_t, 24> child_instances{};
    std::size_t child_count = 0;
    for (std::uint8_t slot = 0; slot < 8U; ++slot) {
      for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance) {
        const EntityHandle handle = world.loadout().handle(slot, instance);
        if (!handle.valid() || child_count >= children.size()) continue;
        child_slots[child_count] = slot;
        child_instances[child_count] = instance;
        children[child_count++] = handle;
      }
    }
    for (std::size_t index = 0; index < child_count; ++index) {
      Entity* child = world.entities().get(children[index]);
      if (child == nullptr) {
        world.loadout().clear_handle(child_slots[index], child_instances[index]);
        continue;
      }
      if (child->health.value > 0.0F)
        (void)damage_entity(world, child->handle, child->health, attacker);
      else
        (void)world.destroy(child->handle);
    }
    // Original43 schedules health+48 = now+1000 for players too. The viewer's
    // controlled-body handle and the healthless children remain live until
    // the ordinary removal sweep releases their intrusive references.
    return;
  }

  if (kind == EntityKind::kMob) {
    // Loot entries were attached at spawn by the component draws; the death
    // path only materializes them and consumes no additional RNG values.
    std::vector<std::uint16_t> petals(entity->loot_petals.begin(),
                                      entity->loot_petals.begin() + entity->loot_count);
    (void)spawn_loot_drops(world, petals, position, target);
    const EntityHandle owner = owning_player(world, attacker);
    if (owner.valid() && world.player() == owner) {
      const auto* definition = Catalog::instance().entity(type_id);
      if (definition != nullptr) {
        // spawnEntity writes the entity definition scale into loot +4; the
        // damage path awards that value to the attacker's player.
        const f32 reward(definition->scale);
        award_player_experience(world, reward);
      }
    }
    // Mobs also persist as health-0 corpses for one second before the world
    // removes them; the population refill sees the corpse and only reacts on
    // the following tick, which is the shipped one-tick count dip.
    entity->health = f32(0.0F);
    entity->death_time_ms = world.time_ms() + 1000.0;
    return;
  }

  if (kind == EntityKind::kProjectile) {
    entity->health = f32(0.0F);
    entity->death_time_ms = world.time_ms() + 1000.0;
    return;
  }
  (void)world.destroy(target);
}

} // namespace engine
