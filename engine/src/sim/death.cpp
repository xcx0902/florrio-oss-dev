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

void kill_entity(World& world, EntityHandle target, EntityHandle attacker) {
  kill_entity_from_source(world, target, damage_source(world, attacker));
}

void kill_entity_from_source(World& world, EntityHandle target, const DamageSource& incoming) {
  Entity* entity = world.entities().get(target);
  if (entity == nullptr || entity->death_processed) return;
  const DamageSource source = incoming.entity.valid() ? incoming : entity->last_damage_source;
  const EntityHandle attacker = source.entity;
  entity->death_processed = true;
  // Original43 calls424 immediately, a full second before corpse removal.
  // Leave the ordinary owner/children alive, but let the next segment steer
  // independently on the next AI tick instead of following the dead head.
  world.detach_linked_entities(target);
  const EntityKind kind = entity->kind;
  const Vec2 position = entity->position;
  const std::uint16_t type_id = entity->type_id;
  world.record_death(kind, type_id, position,
                     source.kind, source.type_id);
  if (kind == EntityKind::kPlayer || kind == EntityKind::kMob) {
    entity->killer_name = source.name;
    // Original updateKillerName writes the destroying entity's name into the
    // player's own replicated string field. Keep the per-player copy for the
    // local death payload only: mobs keep dying (and may die with no attacker)
    // after the player, and those later deaths must not erase or replace the
    // name the death screen is about to show.
    if (auto* state = world.players().by_body(target)) {
      state->set_last_killer(attacker, entity->killer_name);
      state->death.source = source;
    }
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
    auto* owner = world.players().by_body(target);
    if (owner == nullptr) return;
    auto& state = *owner;
    state.life = PlayerLife::kCorpse;
    state.death.position = position;
    bool wide_view = false;
    for (std::size_t slot = 0; slot < state.profile().active_slots(); ++slot)
      wide_view = wide_view || state.loadout().slots()[slot].type_id == 25;
    state.death.view_scale = f32(wide_view ? 0.63F : 0.9F);
    // The frozen v1 Worker continues its orphan-petal orbit during the corpse
    // window using the last input. A new spawn always clears that lease.
    if (!state.has_offline_input_lease()) state.clear_input();
    PlayerProfile retained_profile = state.profile();
    const LootResult loot = retain_player_loot(retained_profile, world.random(), world.death_shuffle_random());
    state.profile().set_lost_items(loot.lost_count, loot.lost);
    // The first three eligible petals are ground loot. The remainder (up to
    // ten, historically named `lost`) belongs to the controller and respawns.
    state.set_last_death_kept(std::span<const std::uint16_t>(loot.lost.data(), loot.lost_count));
    std::vector<std::uint16_t> retained(loot.retained.begin(),
                                        loot.retained.begin() + loot.retained_count);
    (void)spawn_loot_drops(world, retained, position, target);
    state.set_last_death(state.loadout().score(), state.profile().level());
    // Original 43 walks all 24 owned handles (8 slots x 3 instances), damages
    // live children to zero and queues handle-less children for removal.
    std::array<EntityHandle, 24> children{};
    std::array<std::uint8_t, 24> child_slots{};
    std::array<std::uint8_t, 24> child_instances{};
    std::size_t child_count = 0;
    for (std::uint8_t slot = 0; slot < 8U; ++slot) {
      for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance) {
        const EntityHandle handle = state.loadout().handle(slot, instance);
        if (!handle.valid() || child_count >= children.size()) continue;
        child_slots[child_count] = slot;
        child_instances[child_count] = instance;
        children[child_count++] = handle;
      }
    }
    for (std::size_t index = 0; index < child_count; ++index) {
      Entity* child = world.entities().get(children[index]);
      if (child == nullptr) {
        state.loadout().clear_handle(child_slots[index], child_instances[index]);
        continue;
      }
      if (child->health.value > 0.0F)
        (void)damage_entity_from_source(world, child->handle, child->health, source);
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
    if (auto* player = world.players().get(source.player)) {
      const auto* definition = Catalog::instance().entity(type_id);
      if (definition != nullptr) {
        // spawnEntity writes the entity definition scale into loot +4; the
        // damage path awards that value to the attacker's player.
        const f32 reward(definition->scale);
        award_player_experience(world, player->id(), reward);
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
