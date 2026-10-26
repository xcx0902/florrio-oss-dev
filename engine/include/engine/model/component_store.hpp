#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <vector>

namespace engine {

inline constexpr std::size_t kComponentTypeCount = 30;

class ComponentPoolBase {
 public:
  virtual ~ComponentPoolBase() = default;
  [[nodiscard]] virtual std::size_t capacity() const = 0;
  [[nodiscard]] virtual std::size_t free_count() const = 0;
};

/** Dense component pool. Component ids are stable indices; a released index is
 * reused FIFO, mirroring the entity pool's lifecycle discipline. */
template <typename T>
class ComponentPool : public ComponentPoolBase {
 public:
  [[nodiscard]] std::optional<std::uint32_t> attach(const T& value) {
    std::uint32_t index;
    if (free_.empty()) {
      index = static_cast<std::uint32_t>(values_.size());
      values_.push_back(value);
    } else {
      index = free_.front();
      free_.erase(free_.begin());
      values_[index] = value;
    }
    return index;
  }

  [[nodiscard]] T* get(std::uint32_t index) {
    if (index >= values_.size()) return nullptr;
    return &values_[index];
  }
  [[nodiscard]] const T* get(std::uint32_t index) const {
    if (index >= values_.size()) return nullptr;
    return &values_[index];
  }

  void release(std::uint32_t index) {
    if (index >= values_.size()) return;
    free_.push_back(index);
  }

  [[nodiscard]] std::size_t capacity() const override { return values_.size(); }
  [[nodiscard]] std::size_t free_count() const override { return free_.size(); }

 private:
  std::vector<T> values_;
  std::vector<std::uint32_t> free_;
};

/** Type-erased registry of the 30 original component ids. The caller must use
 * the same T for a given id for the lifetime of the store. */
class ComponentStore {
 public:
  template <typename T>
  [[nodiscard]] ComponentPool<T>& pool(std::uint8_t id) {
    auto& slot = pools_[id % kComponentTypeCount];
    if (!slot) slot = std::make_unique<ComponentPool<T>>();
    return static_cast<ComponentPool<T>&>(*slot);
  }

  [[nodiscard]] bool has(std::uint8_t id) const { return static_cast<bool>(pools_[id % kComponentTypeCount]); }

 private:
  std::array<std::unique_ptr<ComponentPoolBase>, kComponentTypeCount> pools_{};
};

} // namespace engine
