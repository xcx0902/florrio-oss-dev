#pragma once
// Benchmark-only M3 pool reference: includes allocation/release cost before
// maintaining the active index. Never linked into the product engine.
#include "engine/model/entity.hpp"
#include <array>
#include <deque>
#include <memory>
#include <optional>

namespace engine {
/** Fixed-capacity entity pool with generation handles and a free list. */
class ReferenceEntityPool {
 public:
  ReferenceEntityPool() { reset(); }

  void reset() {
    entities_->fill(Entity{});
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
    return handle;
  }

  [[nodiscard]] bool release(EntityHandle handle) {
    if (!owns(handle)) return false;
    const std::uint32_t index = handle.index();
    (*entities_)[index].active = false;
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
  [[nodiscard]] std::array<Entity, kEntitySlotCount>& entities() { return *entities_; }
  [[nodiscard]] const std::array<Entity, kEntitySlotCount>& entities() const { return *entities_; }

 private:
  std::unique_ptr<std::array<Entity, kEntitySlotCount>> entities_ = std::make_unique<std::array<Entity, kEntitySlotCount>>();
  std::array<std::uint32_t, kEntitySlotCount> generations_{};
  std::deque<std::uint32_t> free_;
  std::uint32_t reserved_ = 0;
};


} // namespace engine
