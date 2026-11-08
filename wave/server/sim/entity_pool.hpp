#pragma once

#include "sim/rules.hpp"

#include <limits>
#include <stdexcept>
#include <utility>

namespace wave::sim::detail {

struct Poison {
  DamageSource source;
  double amount;
  Tick remaining;
};

struct Slow {
  DamageSource source;
  double multiplier = 1;
  Tick until = 0;
};

struct Entity {
  EntityView view;
  BodyRules rules;
  Vec2 knockback;
  double orbit_offset = 0;
  Tick ready_tick = 0;
  std::vector<Poison> poisons;
  std::optional<DamageSource> fatal_hit;
  Tick born_tick = 0;
  bool projectile = false;
  bool ground_web = false;
  bool spent = false;
  double range_left = 0;
  Vec2 flight_direction;
  unsigned particle_index = 0;
  std::vector<Slow> slows;
};

// Match-local generations and a slot-ordered active set keep pair ordering stable.
class EntityPool {
 public:
  explicit EntityPool(MatchId match) : match_(match) {}

  EntityId insert(Entity entity) {
    if (free_.empty() && slots_.size() == std::numeric_limits<std::uint32_t>::max()) {
      throw std::length_error("Wave entity slots exhausted");
    }
    std::uint32_t slot;
    if (free_.empty()) {
      slot = static_cast<std::uint32_t>(slots_.size());
      slots_.emplace_back();
    } else {
      slot = free_.back();
      free_.pop_back();
    }
    const EntityId id{match_, slot, slots_[slot].generation};
    entity.view.id = id;
    slots_[slot].entity.emplace(std::move(entity));
    active_.insert(std::lower_bound(active_.begin(), active_.end(), slot), slot);
    return id;
  }

  [[nodiscard]] const Entity* get(EntityId id) const {
    if (id.match != match_ || id.slot >= slots_.size()) {
      return nullptr;
    }
    const auto& slot = slots_[id.slot];
    return slot.generation == id.generation && slot.entity ? &*slot.entity : nullptr;
  }
  [[nodiscard]] Entity* get(EntityId id) {
    return const_cast<Entity*>(std::as_const(*this).get(id));
  }
  [[nodiscard]] Entity& at(std::uint32_t slot) { return *slots_[slot].entity; }
  [[nodiscard]] const Entity& at(std::uint32_t slot) const { return *slots_[slot].entity; }
  [[nodiscard]] const std::vector<std::uint32_t>& active() const { return active_; }

  void erase(EntityId id) {
    if (!get(id)) {
      return;
    }
    auto& slot = slots_[id.slot];
    slot.entity.reset();
    active_.erase(std::lower_bound(active_.begin(), active_.end(), id.slot));
    if (slot.generation < std::numeric_limits<std::uint64_t>::max()) {
      ++slot.generation;
      free_.push_back(id.slot);
    }
  }

 private:
  struct Slot {
    std::uint64_t generation = 1;
    std::optional<Entity> entity;
  };
  MatchId match_;
  std::vector<Slot> slots_;
  std::vector<std::uint32_t> free_;
  std::vector<std::uint32_t> active_;
};

}  // namespace wave::sim::detail
