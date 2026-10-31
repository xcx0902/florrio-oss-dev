#include "engine/model/world.hpp"

namespace engine {

void World::reset() {
  collision_.reset();
  destroyed_.clear();
  input_ = PlayerInput{};
  entities_.reset();
  rng_ = MinstdRng{};
  random_.seed(285456437U);
  tick_ = 0;
  petals_.clear();
  hit_events_.clear();
  last_killer_ = EntityHandle{};
  last_killer_name_.clear();
  player_ = EntityHandle{};
  player_name_.clear();
  player_speed_ = f32(0.0F);
  loadout_.clear();
  profile_.clear();
  area_effects_.clear();
  area_alive_.clear();area_candidates_.clear();area_added_.clear();area_removed_.clear();
  deferred_launches_.clear();
  deferred_sequence_ = 0;
  last_launch_order_.clear();
  clear_phase_trace();
  pickups_.clear();
  ai_order_.clear();
  ant_hole_releases_.clear();
  known_entities_.clear();
  pending_hit_events_.clear();
  deaths_.clear();
  time_ms_ = 0.0;
  last_death_score_ = f32(0.0F);
  last_death_level_ = 0;
  last_death_kept_.fill(0);
  last_death_kept_count_ = 0;
  zone_timer_ms_ = f32(0.0F);
  zone_progress_ = 0;
  zone_disabled_ = false;
  width_ = f32(50000.0F);
  height_ = f32(4000.0F);
  auto_populate_ = false;
  bounds_rebuilds_ = 0;
  quadtree_updates_ = 0;
  initialized_ = false;
}

void World::initialize() {
  reset();
  MinstdRng rng(0);
  for (std::uint32_t index = 0; index < kEntitySlotCount; ++index) {
    std::uint32_t generation = 0;
    do { generation = rng.next_generation(); } while ((generation & 262143U) == 0U);
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
  if (entity == nullptr) return false;
  detach_linked_entities(handle);
  // Original404 reparents ordinary ownership only. It must not reconnect
  // constraint links that original43/424 already detached at health death.
  const bool owned = (entity->entity_flags & 64U) != 0U;
  const std::uint32_t inherited_owner = owned ? entity->owner : kInvalidEntity;
  const EntityHandle inherited_owner_handle{
    inherited_owner == kInvalidEntity ? 0U : inherited_owner};
  for (const EntityHandle child : entity->children) {
    if (Entity* child_entity = entities_.get(child)) {
      child_entity->ai.owner = inherited_owner_handle;
      child_entity->owner = inherited_owner;
      if (Entity* parent = entities_.get(inherited_owner_handle)) {
        if (std::find(parent->children.begin(), parent->children.end(), child) == parent->children.end())
          parent->children.push_back(child);
      }
    }
  }
  entity->children.clear();
  if (entity->owner != kInvalidEntity) {
    if (Entity* parent = entities_.get(EntityHandle{entity->owner})) {
      parent->children.erase(
        std::remove(parent->children.begin(), parent->children.end(), handle),
        parent->children.end());
    }
  }
  // Release shared effect payloads immediately. The original effect slots
  // own a reference to the payload; a dead entity must not keep an area
  // effect alive until its slot is reused.
  for (auto& effect : entity->effects) {
    if (effect.payload && effect.payload->refcount > 0U) --effect.payload->refcount;
    effect = Effect{};
  }
  entity->effect_count = 0;
  entity->effect_flags = 0;
  unregister_pickup(handle);
  unregister_ai(handle);
  unregister_ant_hole(handle);
  known_entities_.erase(handle.raw);
  pending_hit_events_.erase(
    std::remove_if(pending_hit_events_.begin(), pending_hit_events_.end(),
                   [handle](const HitEvent& event) { return event.target == handle; }),
    pending_hit_events_.end());
  collision_.tree.remove(handle.index());
  destroyed_.push_back(handle);
  return entities_.release(handle);
}

void World::detach_linked_entities(EntityHandle handle) {
  for (const EntityHandle linked : ai_entities()) {
    if (Entity* segment = entities_.get(linked)) {
      if (linked == handle || segment->ai.predecessor == handle)
        segment->ai.predecessor = EntityHandle{};
    }
  }
}

void World::record_hit(EntityHandle target, EntityHandle attacker, f32 amount, f32 health_after) {
  if (!target.valid()) return;
  Entity* entity = entities_.get(target);
  const std::uint32_t epoch = entity != nullptr && entity->hit_epoch != 0U
    ? entity->hit_epoch : static_cast<std::uint32_t>(tick_ + 1U);
  auto merge = [&](std::vector<HitEvent>& events) {
    for (auto& event : events) {
      if (event.target != target || event.tick != tick_ || event.epoch != epoch) continue;
      event.amount = event.amount + amount;
      event.health_after = health_after;
      if (attacker.valid()) event.attacker = attacker;
      ++event.count;
      ++event.refcount;
      return true;
    }
    return false;
  };
  if (merge(hit_events_)) return;
  HitEvent event{target, attacker, amount, health_after, tick_, 1U, epoch, 1U, is_known(target)};
  if (event.known) {
    hit_events_.push_back(event);
  } else {
    pending_hit_events_.push_back(event);
  }
}

} // namespace engine
