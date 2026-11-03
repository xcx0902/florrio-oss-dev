#include "engine/model/world.hpp"
#include "engine/sim/petals.hpp"
#include "engine/model/catalog.hpp"
#include "engine/model/entity_relations.hpp"
#include "engine/sim/combat.hpp"

namespace engine {

void World::reset() {
  collision_.reset();
  destroyed_.clear();
  entities_.reset();
  players_.clear();
  rng_ = MinstdRng{};
  random_.seed(285456437U);
  tick_ = 0;
  hit_events_.clear();
  area_effects_.clear();
  next_effect_id_ = 1;
  area_alive_.clear();
  area_candidates_.clear();
  area_added_.clear();
  area_removed_.clear();
  deferred_launches_.clear();
  deferred_sequence_ = 0;
  last_launch_order_.clear();
  clear_phase_trace();
  pickups_.clear();
  ai_order_.clear();
  ant_hole_releases_.clear();
  deaths_.clear();
  time_ms_ = 0.0;
  width_ = f32(50000.0F);
  height_ = f32(4000.0F);
  auto_populate_ = false;
  bounds_rebuilds_ = 0;
  quadtree_updates_ = 0;
  initialized_ = false;
}

void World::initialize(std::uint64_t handle_seed) {
  reset();
  MinstdRng rng(handle_seed);
  for (std::uint32_t index = 0; index < kEntitySlotCount; ++index) {
    std::uint32_t generation = 0;
    do {
      generation = rng.next_generation();
    } while ((generation & 262143U) == 0U);
    entities_.set_generation(index, generation);
    entities_.entities()[index].handle = EntityHandle::from_parts(index, generation);
    entities_.entities()[index].active = false;
  }
  // Slots 0..2 are the original world's three storage records. They keep
  // their generated handles but are never handed out to gameplay entities.
  entities_.reserve_front(3);
  rng_.seed(rng.state());
  initialized_ = true;
}

bool World::destroy(EntityHandle handle) {
  Entity* entity = entities_.get(handle);
  if (entity == nullptr) {
    return false;
  }
  if (entity->kind == EntityKind::kPetal) {
    (void)on_petal_destroyed(*this, handle);
  }
  if (auto* equipped_owner = players_.by_body(EntityHandle{entity->owner})) {
    auto& loadout = equipped_owner->loadout();
    for (std::uint8_t slot = 0; slot < PlayerLoadout::kSlots; ++slot) {
      for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance) {
        if (loadout.handle(slot, instance) != handle) {
          continue;
        }
        loadout.clear_handle(slot, instance);
        loadout.slots()[slot].instances[instance] = {};
        if (const auto* combat = Catalog::instance().petal_combat(loadout.slots()[slot].type_id)) {
          loadout.slots()[slot].recharge_remaining_ms = combat->rechargeMilliseconds;
        }
      }
    }
  }
  if (auto* state = players_.by_body(handle)) {
    // A direct body removal must retire its live equipped occupants too.
    // Ordinary corpse sweeps keep their existing release order/timestamps.
    std::array<EntityHandle, 24> equipped{};
    for (std::uint8_t slot = 0; slot < 8; ++slot) {
      for (std::uint8_t instance = 0; instance < PlayerLoadout::kInstances; ++instance) {
        equipped[slot * PlayerLoadout::kInstances + instance] =
            state->loadout().handle(slot, instance);
      }
    }
    for (auto child : equipped) {
      if (auto* occupant = entities_.get(child);
          occupant != nullptr && occupant->health.value > 0.0F) {
        (void)damage_entity(*this, child, occupant->health, {});
      }
    }
    // Preserve the v1 Worker's orphan orbit records until respawn. Finite
    // multiplayer leases retire their input and orbit bookkeeping here.
    const bool offline_lease = state->has_offline_input_lease();
    if (!offline_lease) {
      state->clear_input();
    }
    state->loadout().clear();
    if (!offline_lease) {
      state->petals().clear();
    }
    state->life = tick_ >= state->next_spawn_tick ? PlayerLife::kRespawnable : PlayerLife::kCorpse;
    players_.unbind_body(handle);
  }
  detach_linked_entities(handle);
  // Original404 reparents ordinary ownership only. It must not reconnect
  // constraint links that original43/424 already detached at health death.
  const bool owned = (entity->entity_flags & 64U) != 0U;
  const std::uint32_t inherited_owner = owned ? entity->owner : kInvalidEntity;
  const EntityHandle inherited_owner_handle{inherited_owner == kInvalidEntity ? 0U
                                                                              : inherited_owner};
  for (const EntityHandle child : entity->children) {
    if (Entity* child_entity = entities_.get(child)) {
      child_entity->ai.owner = inherited_owner_handle;
      child_entity->owner = inherited_owner;
      if (Entity* parent = entities_.get(inherited_owner_handle)) {
        if (std::find(parent->children.begin(), parent->children.end(), child) ==
            parent->children.end()) {
          parent->children.push_back(child);
        }
      }
    }
  }
  entity->children.clear();
  if (entity->owner != kInvalidEntity) {
    if (Entity* parent = entities_.get(EntityHandle{entity->owner})) {
      parent->children.erase(std::remove(parent->children.begin(), parent->children.end(), handle),
                             parent->children.end());
    }
  }
  // Release shared effect payloads immediately. The original effect slots
  // own a reference to the payload; a dead entity must not keep an area
  // effect alive until its slot is reused.
  for (auto& effect : entity->effects) {
    if (effect.payload && effect.payload->refcount > 0U) {
      --effect.payload->refcount;
    }
    effect = Effect{};
  }
  entity->effect_count = 0;
  entity->effect_flags = 0;
  for (auto& area : area_effects_) {
    if (area.owner == handle) {
      (void)replace_area_effect(handle, area.scale, nullptr);
    }
  }
  area_effects_.erase(std::remove_if(area_effects_.begin(), area_effects_.end(),
                                     [](const AreaEffect& area) { return !area.payload; }),
                      area_effects_.end());
  for (auto& launch : deferred_launches_) {
    std::erase(launch.children, handle);
  }
  std::erase_if(deferred_launches_,
                [](const DeferredLaunch& launch) { return launch.children.empty(); });
  unregister_pickup(handle);
  unregister_ai(handle);
  unregister_ant_hole(handle);
  collision_.tree.remove(handle.index());
  destroyed_.push_back(handle);
  return entities_.release(handle);
}

void World::detach_linked_entities(EntityHandle handle) {
  for (const EntityHandle linked : ai_entities()) {
    if (Entity* segment = entities_.get(linked)) {
      if (linked == handle || segment->ai.predecessor == handle) {
        segment->ai.predecessor = EntityHandle{};
      }
    }
  }
}

void World::record_hit(EntityHandle target, EntityHandle attacker, f32 amount, f32 health_after,
                       const DamageSource* source) {
  if (!target.valid()) {
    return;
  }
  Entity* entity = entities_.get(target);
  const std::uint32_t epoch = entity != nullptr && entity->hit_epoch != 0U
                                  ? entity->hit_epoch
                                  : static_cast<std::uint32_t>(tick_ + 1U);
  auto merge = [&](std::vector<HitEvent>& events) {
    for (auto& event : events) {
      if (event.target != target || event.tick != tick_ || event.epoch != epoch) {
        continue;
      }
      event.amount = event.amount + amount;
      event.health_after = health_after;
      if (attacker.valid()) {
        event.attacker = attacker;
        event.source = source == nullptr ? damage_source(*this, attacker) : *source;
      }
      ++event.count;
      ++event.refcount;
      return true;
    }
    return false;
  };
  if (merge(hit_events_)) {
    return;
  }
  HitEvent event{
      target,       attacker, amount,
      health_after, tick_,    1U,
      epoch,        1U,       source == nullptr ? damage_source(*this, attacker) : *source};
  hit_events_.push_back(event);
}

}  // namespace engine
