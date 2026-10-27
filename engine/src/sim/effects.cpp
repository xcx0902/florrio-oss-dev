#include "engine/sim/effects.hpp"
#include "engine/sim/combat.hpp"
#include "engine/sim/spatial.hpp"
#include <algorithm>
#include <cmath>
#include <unordered_set>

namespace engine {

namespace {

constexpr double kTau = 6.283185307179586476925286766559;

Effect* find_effect(Entity& entity, EffectType type, EntityHandle source) {
  for (std::size_t index = 0; index < kMaxEffects; ++index) {
    Effect& effect = entity.effects[index];
    if (!effect.active || effect.type != type) continue;
    if (source.valid() && effect.source != source) continue;
    return &effect;
  }
  return nullptr;
}

Effect* find_payload(Entity& entity, const EffectPayload* payload) {
  for (std::size_t index = 0; index < kMaxEffects; ++index)
    if (entity.effects[index].active && entity.effects[index].payload.get() == payload)
      return &entity.effects[index];
  return nullptr;
}

Effect* free_effect(Entity& entity) {
  for (std::size_t index = 0; index < kMaxEffects; ++index)
    if (!entity.effects[index].active) return &entity.effects[index];
  // All slots are occupied: replace the effect with the shortest remaining
  // lifetime. The original effect vector can grow without bound; a bounded
  // domain record is sufficient for the recovered poison/slow/heal families.
  Effect* shortest = &entity.effects[0];
  for (std::size_t index = 1; index < kMaxEffects; ++index)
    if (entity.effects[index].remaining_ms < shortest->remaining_ms)
      shortest = &entity.effects[index];
  return shortest;
}

void refresh_count(Entity& entity) {
  std::uint8_t count = 0;
  for (const Effect& effect : entity.effects)
    if (effect.active) ++count;
  entity.effect_count = count;
  entity.effect_flags = effect_flags(entity);
}

void sync_effect(Effect& effect) {
  if (!effect.payload) return;
  effect.type = effect.payload->type;
  effect.source = effect.payload->source;
  effect.intensity = effect.payload->intensity;
  effect.remaining_ms = effect.payload->remaining_ms;
  effect.active = effect.payload->active;
}

} // namespace

namespace {
std::uint32_t next_payload_id() {
  static std::uint32_t next = 1;
  return next++;
}
} // namespace

std::shared_ptr<EffectPayload> make_effect_payload(EffectType type, f32 intensity,
                                                   double duration_ms, EntityHandle source) {
  auto payload = std::make_shared<EffectPayload>();
  payload->id = next_payload_id();
  payload->type = type;
  payload->intensity = intensity;
  payload->remaining_ms = duration_ms;
  payload->source = source;
  payload->active = true;
  return payload;
}

bool attach_effect_payload(Entity& entity, const std::shared_ptr<EffectPayload>& payload) {
  if (!payload || !payload->active) return false;
  if (find_payload(entity, payload.get()) != nullptr) return true;
  Effect* effect = free_effect(entity);
  effect->payload = payload;
  effect->type = payload->type;
  effect->source = payload->source;
  effect->intensity = payload->intensity;
  effect->remaining_ms = payload->remaining_ms;
  effect->active = true;
  ++payload->refcount;
  refresh_count(entity);
  return true;
}

bool detach_effect_payload(Entity& entity, const std::shared_ptr<EffectPayload>& payload) {
  Effect* effect = payload ? find_payload(entity, payload.get()) : nullptr;
  if (effect == nullptr) return false;
  if (effect->payload && effect->payload->refcount > 0U) --effect->payload->refcount;
  *effect = Effect{};
  refresh_count(entity);
  return true;
}

bool apply_effect(World& world, EntityHandle target, EffectType type, f32 intensity,
                  double duration_ms, EntityHandle source) {
  Entity* entity = world.entities().get(target);
  if (entity == nullptr || entity->health.value <= 0.0F) return false;
  if (!(duration_ms > 0.0)) return false;
  if (type == EffectType::kPoison && !(intensity.value > 0.0F)) return false;
  if (type == EffectType::kSlow) {
    if (!(intensity.value > 0.0F)) return false;
    if (intensity.value > 1.0F) intensity = f32(1.0F);
  }
  const auto payload = make_effect_payload(type, intensity, duration_ms, source);
  Effect* effect = find_effect(*entity, type, source);
  if (effect == nullptr) effect = free_effect(*entity);
  if (effect->payload && effect->payload->refcount > 0U) --effect->payload->refcount;
  effect->payload = payload;
  effect->type = type;
  effect->source = source;
  effect->remaining_ms = duration_ms;
  effect->intensity = intensity;
  effect->active = true;
  refresh_count(*entity);
  return true;
}

std::size_t update_effects(World& world, double delta_milliseconds) {
  if (!(delta_milliseconds > 0.0)) return 0;
  std::size_t damaged = 0;

  // Shared payloads (area effects) are advanced exactly once per tick.
  std::vector<EffectPayload*> payloads;
  for (auto& entity : world.entities().entities()) {
    if (!entity.active) continue;
    for (const auto& effect : entity.effects) {
      if (!effect.active || !effect.payload) continue;
      if (std::find(payloads.begin(), payloads.end(), effect.payload.get()) == payloads.end())
        payloads.push_back(effect.payload.get());
    }
  }

  for (auto& entity : world.entities().entities()) {
    if (!entity.active) continue;
    // The tick applies only the strongest active damage effect; the original
    // does not stack every poison instance in the same frame.
    const Effect* strongest = nullptr;
    for (const auto& effect : entity.effects) {
      if (!effect.active || effect.type != EffectType::kPoison) continue;
      if (strongest == nullptr || effect.intensity.value > strongest->intensity.value)
        strongest = &effect;
    }
    if (strongest != nullptr && entity.health.value > 0.0F) {
      const double duration = std::min(delta_milliseconds, strongest->remaining_ms);
      const double amount = static_cast<double>(strongest->intensity.value) * duration * 0.001;
      if (amount > 0.0) {
        (void)damage_entity(world, entity.handle, f32::from_double(amount), strongest->source);
        ++damaged;
      }
    }

    bool changed = false;
    for (auto& effect : entity.effects) {
      if (!effect.active) continue;
      if (effect.payload) {
        if (!effect.payload->active || effect.payload->remaining_ms < 0.0) {
          if (effect.payload->refcount > 0U) --effect.payload->refcount;
          effect = Effect{};
          changed = true;
        } else {
          sync_effect(effect);
        }
        continue;
      }
      if (effect.remaining_ms <= delta_milliseconds) {
        effect.active = false;
        changed = true;
      } else {
        effect.remaining_ms -= delta_milliseconds;
      }
    }
    if (changed) refresh_count(entity);
  }

  for (EffectPayload* payload : payloads) {
    if (!payload->active) continue;
    payload->remaining_ms -= delta_milliseconds;
    if (payload->remaining_ms <= 0.0) {
      payload->remaining_ms = 0.0;
      payload->active = false;
    }
  }
  // Mirror the once-per-tick payload advance into every target slot.
  for (auto& entity : world.entities().entities()) {
    if (!entity.active) continue;
    for (auto& effect : entity.effects) {
      if (effect.active && effect.payload) sync_effect(effect);
    }
  }
  return damaged;
}

bool has_effect(const Entity& entity, EffectType type) {
  for (const auto& effect : entity.effects)
    if (effect.active && effect.type == type) return true;
  return false;
}

bool blocks_healing(const Entity& entity) {
  return has_effect(entity, EffectType::kHealBlock);
}

f32 slow_multiplier(const Entity& entity) {
  f32 multiplier(1.0F);
  for (const auto& effect : entity.effects) {
    if (!effect.active || effect.type != EffectType::kSlow) continue;
    if (effect.intensity.value < multiplier.value) multiplier = effect.intensity;
  }
  return multiplier;
}

std::uint8_t effect_flags(const Entity& entity) {
  std::uint8_t flags = 0;
  for (const auto& effect : entity.effects) {
    if (!effect.active) continue;
    if (effect.type == EffectType::kPoison) flags |= 1U;
    else if (effect.type == EffectType::kHealBlock) flags |= 2U;
    else if (effect.type == EffectType::kSlow) flags |= 4U;
  }
  return flags;
}

void clear_effects(Entity& entity) {
  for (auto& effect : entity.effects) effect = Effect{};
  entity.effect_count = 0;
  entity.effect_flags = 0;
}

std::shared_ptr<EffectPayload> add_area_effect(World& world, EntityHandle owner, f32 scale,
                                               EffectType type, f32 intensity,
                                               double duration_ms, EntityHandle source) {
  const auto payload = make_effect_payload(type, intensity, duration_ms, source);
  (void)world.replace_area_effect(owner, scale, payload);
  return payload;
}

std::shared_ptr<EffectPayload> World::replace_area_effect(EntityHandle owner, f32 scale,
                                                          std::shared_ptr<EffectPayload> payload) {
  AreaEffect* area = nullptr;
  for (auto& candidate : area_effects_) {
    if (candidate.owner == owner) { area = &candidate; break; }
  }
  if (area == nullptr) {
    area_effects_.push_back(AreaEffect{owner, scale, nullptr, {}});
    area = &area_effects_.back();
  }
  area->scale = scale;
  const auto previous = area->payload;
  if (payload) {
    area->payload = payload;
    for (const EntityHandle target : area->targets) {
      Entity* entity = entities_.get(target);
      if (entity == nullptr) continue;
      if (previous) (void)detach_effect_payload(*entity, previous);
      (void)attach_effect_payload(*entity, payload);
    }
    return area->payload;
  }
  for (const EntityHandle target : area->targets) {
    Entity* entity = entities_.get(target);
    if (entity != nullptr && previous) (void)detach_effect_payload(*entity, previous);
  }
  area->targets.clear();
  area->payload.reset();
  return nullptr;
}

std::size_t World::update_area_effects() {
  std::size_t updated = 0;
  for (auto& area : area_effects_) {
    if (!area.payload) continue;
    if (area.payload->remaining_ms < 0.0 || !area.payload->active) {
      (void)replace_area_effect(area.owner, area.scale, nullptr);
      continue;
    }
    Entity* owner = entities_.get(area.owner);
    if (owner == nullptr) {
      (void)replace_area_effect(area.owner, area.scale, nullptr);
      continue;
    }
    // Prune dead targets and detach the payload from them.
    std::vector<EntityHandle> previous = area.targets;
    std::vector<EntityHandle> alive;
    alive.reserve(previous.size());
    for (const EntityHandle target : previous) {
      Entity* entity = entities_.get(target);
      if (entity == nullptr || entity->health.value <= 0.0F) {
        if (entity != nullptr) (void)detach_effect_payload(*entity, area.payload);
        continue;
      }
      alive.push_back(target);
    }
    // The original query rectangle is owner centre +/- scale (a square).
    SpatialQuery query = SpatialQuery::from_world(*this);
    std::vector<EntityHandle> candidates;
    const f32 half = area.scale;
    query.query_box(Aabb{f32::from_double(static_cast<double>(owner->position.x.value)
                                          - static_cast<double>(half.value)),
                         f32::from_double(static_cast<double>(owner->position.y.value)
                                          - static_cast<double>(half.value)),
                         f32::from_double(static_cast<double>(owner->position.x.value)
                                          + static_cast<double>(half.value)),
                         f32::from_double(static_cast<double>(owner->position.y.value)
                                          + static_cast<double>(half.value))},
                    candidates);
    std::sort(candidates.begin(), candidates.end(),
              [](EntityHandle left, EntityHandle right) { return left.raw < right.raw; });
    std::sort(alive.begin(), alive.end(),
              [](EntityHandle left, EntityHandle right) { return left.raw < right.raw; });
    std::vector<EntityHandle> added;
    std::vector<EntityHandle> removed;
    for (const EntityHandle handle : candidates) {
      if (!std::binary_search(alive.begin(), alive.end(), handle,
                              [](EntityHandle left, EntityHandle right) {
                                return left.raw < right.raw;
                              })) {
        added.push_back(handle);
      }
    }
    for (const EntityHandle handle : alive) {
      if (!std::binary_search(candidates.begin(), candidates.end(), handle,
                              [](EntityHandle left, EntityHandle right) {
                                return left.raw < right.raw;
                              })) {
        removed.push_back(handle);
      }
    }
    for (const EntityHandle handle : removed) {
      Entity* entity = entities_.get(handle);
      if (entity != nullptr) (void)detach_effect_payload(*entity, area.payload);
      alive.erase(std::remove(alive.begin(), alive.end(), handle), alive.end());
    }
    for (const EntityHandle handle : added) {
      Entity* entity = entities_.get(handle);
      if (entity == nullptr) continue;
      (void)attach_effect_payload(*entity, area.payload);
      alive.push_back(handle);
    }
    std::sort(alive.begin(), alive.end(),
              [](EntityHandle left, EntityHandle right) { return left.raw < right.raw; });
    area.targets = std::move(alive);
    ++updated;
  }
  return updated;
}

std::size_t World::run_deferred_launches(double now_ms) {
  std::size_t launched = 0;
  last_launch_order_.clear();
  // Original deferred callbacks are dispatched by due time. Pull every due
  // entry first, then sort by (due_ms, insertion sequence) so multiple
  // callbacks scheduled in the same tick have a deterministic order.
  std::vector<DeferredLaunch> due;
  for (auto it = deferred_launches_.begin(); it != deferred_launches_.end();) {
    if (it->due_ms > now_ms) { ++it; continue; }
    due.push_back(std::move(*it));
    it = deferred_launches_.erase(it);
  }
  std::stable_sort(due.begin(), due.end(), [](const DeferredLaunch& left, const DeferredLaunch& right) {
    if (left.due_ms != right.due_ms) return left.due_ms < right.due_ms;
    return left.sequence < right.sequence;
  });
  for (auto& launch : due) {
    last_launch_order_.push_back(launch.sequence);
    const std::size_t count = launch.children.size();
    if (count == 0U) continue;
    const f32 step = f32(kTau / static_cast<double>(count));
    f32 angle = launch.phase;
    for (const EntityHandle handle : launch.children) {
      angle = f32(step.value + angle.value);
      Entity* child = entities_.get(handle);
      if (child == nullptr) continue;
      // Original launchPeas only adds an impulse to velocity (+40/+48) and
      // acceleration (+56/+64); the radial offset was written by splitPeas.
      const f32 impulse_x = f32(std::cos(static_cast<double>(angle.value)) * 1.4F);
      const f32 impulse_y = f32(std::sin(static_cast<double>(angle.value)) * 1.4F);
      const f32 accel_x = f32(std::cos(static_cast<double>(angle.value)) * 0.6F);
      const f32 accel_y = f32(std::sin(static_cast<double>(angle.value)) * 0.6F);
      child->velocity.x += static_cast<double>(impulse_x.value);
      child->velocity.y += static_cast<double>(impulse_y.value);
      child->acceleration.x += static_cast<double>(accel_x.value);
      child->acceleration.y += static_cast<double>(accel_y.value);
      child->bounds_dirty = true;
    }
    ++launched;
  }
  return launched;
}

} // namespace engine
