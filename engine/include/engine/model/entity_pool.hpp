#pragma once
#include "engine/core/perf.hpp"
#include "engine/model/entity.hpp"
#include <array>
#include <bit>
#include <iterator>
#include <deque>
#include <memory>
#include <optional>

namespace engine {
/** Fixed-capacity entity pool with generation handles and a free list. */
class EntityPool {
 public:
  EntityPool() { reset(); }

  void reset() {
    entities_->fill(Entity{});
    active_.fill(0);
    active_dirty_ = false;
    generations_.fill(1);
    free_.clear();
    reserved_ = 0;
    for (std::uint32_t index = 0; index < kEntitySlotCount; ++index) free_.push_back(index);
  }

  [[nodiscard]] std::optional<EntityHandle> allocate() {
    if (free_.empty()) return std::nullopt;
    const std::uint32_t index = free_.front();
    free_.pop_front();
    const std::uint32_t generation = generations_[index];
    EntityHandle handle = EntityHandle::from_parts(index, generation);
    (*entities_)[index] = Entity{};
    (*entities_)[index].handle = handle;
    (*entities_)[index].active = true;
    if (active_dirty_ || active_count() > kEntitySlotCount / 8) active_dirty_ = true;
    else active_[index / 64] |= std::uint64_t{1} << (index % 64);
    return handle;
  }

  [[nodiscard]] bool release(EntityHandle handle) {
    if (!owns(handle)) return false;
    const std::uint32_t index = handle.index();
    (*entities_)[index].active = false;
    if (active_dirty_ || active_count() > kEntitySlotCount / 8) active_dirty_ = true;
    else active_[index / 64] &= ~(std::uint64_t{1} << (index % 64));
    generations_[index] = (generations_[index] + 1U) & 0x3FFFFU;
    if (generations_[index] == 0U) generations_[index] = 1U;
    free_.push_back(index);
    return true;
  }

  [[nodiscard]] bool owns(EntityHandle handle) const {
    if (handle.index() >= kEntitySlotCount) return false;
    const Entity& entity = (*entities_)[handle.index()];
    return entity.active && entity.handle == handle;
  }

  [[nodiscard]] Entity* get(EntityHandle handle) {
    return owns(handle) ? &(*entities_)[handle.index()] : nullptr;
  }
  [[nodiscard]] const Entity* get(EntityHandle handle) const {
    return owns(handle) ? &(*entities_)[handle.index()] : nullptr;
  }
  /** Reserve slots at the front of the free list without activating them.
   * The original world keeps three storage records in slots 0..2, so the first
   * gameplay entity is allocated from slot 3. */
  void reserve_front(std::uint32_t count) {
    while (count-- > 0U && !free_.empty()) { free_.pop_front(); ++reserved_; }
  }
  [[nodiscard]] std::size_t active_count() const {
    return kEntitySlotCount - free_.size() - reserved_;
  }
  void set_generation(std::uint32_t index, std::uint32_t generation) {
    if (index < kEntitySlotCount) generations_[index] = generation & 0x3FFFFU;
  }
  // Live ascending-slot iteration: reread words on ++, including allocations
  // in higher slots during the phase. Earlier/released slots stay unvisited.
  template <bool Constant> class ActiveRange {
    using Pool = std::conditional_t<Constant, const EntityPool, EntityPool>;
    Pool* pool_;
   public:
    struct Iterator {
      Pool* pool;
      std::uint32_t slot;
      void seek() {
        pool->ensure_active_index();
        while (slot < kEntitySlotCount) {
          auto bits = pool->active_[slot / 64] & (~std::uint64_t{0} << (slot % 64));
          if (bits) { slot = (slot / 64) * 64 + std::countr_zero(bits); return; }
          slot = (slot / 64 + 1) * 64;
        }
      }
      auto& operator*() const { return (*pool->entities_)[slot]; }
      Iterator& operator++() { ++slot; seek(); return *this; }
      bool operator!=(const Iterator& other) const { return slot != other.slot; }
    };
    explicit ActiveRange(Pool* pool) : pool_(pool) {}
    Iterator begin() const { Iterator i{pool_,0}; i.seek(); return i; }
    Iterator end() const { return {pool_, kEntitySlotCount}; }
  };
  [[nodiscard]] ActiveRange<false> active_entities() { return ActiveRange<false>(this); }
  [[nodiscard]] ActiveRange<true> active_entities() const { return ActiveRange<true>(this); }
  // Select once per phase. Dense consumers receive the original array;
  // sparse consumers receive a live bitset range. Keep the active check.
  template<class Visitor> [[gnu::always_inline]] decltype(auto) with_ordered_slots(Visitor&& visit) {
    if(active_count()>kEntitySlotCount/8) return visit(entities());
    else return visit(active_entities());
  }
  template<class Visitor> [[gnu::always_inline]] decltype(auto) with_ordered_slots(Visitor&& visit) const {
    if(active_count()>kEntitySlotCount/8) return visit(entities());
    else return visit(active_entities());
  }
  [[nodiscard]] std::array<Entity, kEntitySlotCount>& entities() { return *entities_; }
  [[nodiscard]] const std::array<Entity, kEntitySlotCount>& entities() const { return *entities_; }

 private:
  // Dense phases scan the original array, so avoid maintaining an unused
  // bitmap during their allocation churn. Every bitset read synchronizes
  // first, including ++ after a mutation inside a live dense ActiveRange.
  void ensure_active_index() const {
    if (!active_dirty_) return;
    PERF_ADD(visits, kEntitySlotCount);
    active_.fill(0);
    for (std::uint32_t index = 0; index < kEntitySlotCount; ++index)
      if ((*entities_)[index].active) active_[index / 64] |= std::uint64_t{1} << (index % 64);
    active_dirty_ = false;
  }
  std::unique_ptr<std::array<Entity, kEntitySlotCount>> entities_ = std::make_unique<std::array<Entity, kEntitySlotCount>>();
  mutable std::array<std::uint64_t, (kEntitySlotCount + 63) / 64> active_{};
  std::array<std::uint32_t, kEntitySlotCount> generations_{};
  std::deque<std::uint32_t> free_;
  std::uint32_t reserved_ = 0;
  mutable bool active_dirty_ = false;
};


} // namespace engine
