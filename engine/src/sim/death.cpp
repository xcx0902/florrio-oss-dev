#include "engine/sim/combat.hpp"
#include "engine/model/entity_relations.hpp"
#include "engine/model/catalog.hpp"
#include "engine/sim/ai.hpp"
#include "engine/sim/loot.hpp"
#include "engine/sim/player_loadout.hpp"
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
  if (entity == nullptr || entity->death_processed) {
    return;
  }
  const DamageSource source = incoming.entity.valid() ? incoming : entity->last_damage_source;
  const EntityHandle attacker = source.entity;
  entity->death_processed = true;
  // Constraint links detach immediately, a full second before corpse removal.
  // The ordinary owner/children stay alive, but the next segment steers
  // independently on the next AI tick instead of following the dead head.
  world.detach_linked_entities(target);
  const EntityKind kind = entity->kind;
  const Vec2 position = entity->position;
  const std::uint16_t type_id = entity->type_id;
  world.record_death(kind, type_id, position, source.kind, source.type_id);
  if (kind == EntityKind::kPlayer || kind == EntityKind::kMob) {
    entity->killer_name = source.name;
    // The killer name is a per-player local copy for the death payload only:
    // mobs keep dying (and may die with no attacker) after the player, and
    // those later deaths must not erase or replace the name the death screen is
    // about to show.
    if (auto* state = world.players().by_body(target)) {
      state->set_last_killer(attacker, entity->killer_name);
      state->death.source = source;
    }
  }

  if (kind == EntityKind::kPetal) {
    // The equipped handle clears and the recharge timer arms first; the petal
    // entity itself survives as a health-0 corpse, reaped one second later.
    (void)on_petal_destroyed(world, target);
    entity->health = f32(0.0F);
    entity->death_time_ms = world.time_ms() + 1000.0;
    return;
  }

  if (kind == EntityKind::kPlayer) {
    entity->death_flag = true;
    entity->death_time_ms = world.time_ms() + 1000.0;
    // The body retains its carried loadout throughout the corpse window. Loot
    // retention writes a separate lost-item list; it does not replace the
    // carried inventory in place.
    auto* owner = world.players().by_body(target);
    if (owner == nullptr) {
      return;
    }
    auto& state = *owner;
    state.life = PlayerLife::kCorpse;
    state.death.position = position;
    bool wide_view = false;
    for (std::size_t slot = 0; slot < state.profile().active_slots(); ++slot) {
      wide_view = wide_view || catalog::petal_id(state.loadout().slots()[slot].type_id) ==
                                   catalog::PetalId::kAntennaeLegendary;
    }
    state.death.view_scale = f32(wide_view ? 0.63F : 0.9F);
    // A corpse keeps its last input only while an offline input lease is held;
    // every other death clears it.
    if (!state.has_offline_input_lease()) {
      state.clear_input();
    }
    PlayerProfile retained_profile = state.profile();
    const LootResult loot =
        retain_player_loot(retained_profile, world.random(), world.death_shuffle_random());
    state.profile().set_lost_items(loot.lost_count, loot.lost);
    // The first three eligible petals are ground loot. The remainder (up to
    // ten) belongs to the controller and respawns.
    state.set_last_death_kept(std::span<const std::uint16_t>(loot.lost.data(), loot.lost_count));
    std::vector<std::uint16_t> retained(loot.retained.begin(),
                                        loot.retained.begin() + loot.retained_count);
    (void)spawn_loot_drops(world, retained, position, target);
    state.set_last_death(state.loadout().score(), state.profile().level());
    // Walk all 24 owned handles (8 slots x 3 instances); live children are
    // damaged to zero and children that are already dead are destroyed.
    std::array<EntityHandle, 24> children{};
    std::array<std::uint8_t, 24> child_slots{};
    std::array<std::uint8_t, 24> child_instances{};
    std::size_t child_count = 0;
    for (std::uint8_t slot = 0; slot < PlayerLoadout::kActiveSlots; ++slot) {
      for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance) {
        const EntityHandle handle = state.loadout().handle(slot, instance);
        if (!handle.valid() || child_count >= children.size()) {
          continue;
        }
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
      if (child->health.value > 0.0F) {
        (void)damage_entity_from_source(world, child->handle, child->health, source);
      } else {
        (void)world.destroy(child->handle);
      }
    }
    // The player corpse also expires one second after death. The viewer's
    // controlled-body handle and the healthless children remain live until the
    // ordinary removal sweep releases their intrusive references.
    return;
  }

  if (kind == EntityKind::kMob) {
    // Loot entries were chosen at spawn; the death path only materializes them
    // and consumes no additional RNG values.
    std::vector<std::uint16_t> petals(entity->loot_petals.begin(),
                                      entity->loot_petals.begin() + entity->loot_count);
    (void)spawn_loot_drops(world, petals, position, target);
    if (auto* player = world.players().get(source.player)) {
      const auto* definition = Catalog::instance().entity(type_id);
      if (definition != nullptr) {
        // The catalog scale is the experience reward granted to the attacker's
        // player.
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

}  // namespace engine
