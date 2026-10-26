#pragma once
#include "engine/core/f32.hpp"
#include <array>
#include <cstdint>

namespace engine {

/** Level, experience and inventory state restored by the original spawn path.
 * Inventory slots hold petal type ids; zero means empty. */
class PlayerProfile {
 public:
  static constexpr std::size_t kMaxInventory = 16;
  static constexpr std::size_t kMaxLost = 10;
  static constexpr std::size_t kMaxBackpack = 16;

  [[nodiscard]] std::uint8_t level() const { return level_; }
  [[nodiscard]] f32 experience() const { return experience_; }
  [[nodiscard]] std::uint8_t inventory_size() const { return level_ < 15 ? 13 : level_ < 30 ? 14 : level_ < 45 ? 15 : 16; }
  [[nodiscard]] std::uint8_t active_slots() const { return level_ < 15 ? 5 : level_ < 30 ? 6 : level_ < 45 ? 7 : 8; }
  [[nodiscard]] const std::array<std::uint16_t, kMaxInventory>& inventory() const { return inventory_; }
  [[nodiscard]] std::uint16_t inventory(std::uint8_t slot) const {
    return slot < kMaxInventory ? inventory_[slot] : 0;
  }
  [[nodiscard]] std::uint8_t inventory_count() const { return inventory_count_; }
  [[nodiscard]] const std::array<std::uint16_t, kMaxLost>& lost_items() const { return lost_items_; }
  [[nodiscard]] std::uint8_t lost_count() const { return lost_count_; }
  [[nodiscard]] const std::array<std::uint16_t, kMaxBackpack>& backpack() const { return backpack_; }
  [[nodiscard]] std::uint8_t backpack_count() const { return backpack_count_; }

  void set_level(std::uint8_t level) { level_ = level; }
  void set_experience(f32 experience) { experience_ = experience; }
  void set_inventory(std::uint8_t slot, std::uint16_t type_id) {
    if (slot < kMaxInventory) inventory_[slot] = type_id;
  }
  void set_inventory_count(std::uint8_t count) { inventory_count_ = count; }
  void clear_inventory() { inventory_.fill(0); inventory_count_ = 0; }
  void clear_backpack() { backpack_.fill(0); backpack_count_ = 0; }
  void push_backpack(std::uint16_t type_id) {
    if (backpack_count_ >= kMaxBackpack) {
      for (std::size_t index = 0; index + 1 < kMaxBackpack; ++index) backpack_[index] = backpack_[index + 1];
      --backpack_count_;
    }
    backpack_[backpack_count_++] = type_id;
  }
  void set_lost_items(std::uint8_t count, const std::array<std::uint16_t, kMaxLost>& items) {
    lost_count_ = count < kMaxLost ? count : static_cast<std::uint8_t>(kMaxLost);
    lost_items_ = items;
  }

  /** Add experience and level up while the current threshold is reached.
   * Thresholds and the growth factor are the recovered original formulas. */
  void add_experience(f32 amount);
  void clear();

 private:
  std::uint8_t level_ = 0;
  f32 experience_;
  std::array<std::uint16_t, kMaxInventory> inventory_{};
  std::uint8_t inventory_count_ = 0;
  std::array<std::uint16_t, kMaxLost> lost_items_{};
  std::uint8_t lost_count_ = 0;
  std::array<std::uint16_t, kMaxBackpack> backpack_{};
  std::uint8_t backpack_count_ = 0;
};

} // namespace engine
