#pragma once
#include "engine/model/entity.hpp"
#include <array>
#include <cstdint>

namespace engine {

/** One equipped petal slot with its catalog recharge timer. */
struct PetalSlot {
  std::uint16_t type_id = 0;
  std::uint8_t count = 0;
  double recharge_remaining_ms = 0.0;
  std::array<EntityHandle, 3> instances{};

  [[nodiscard]] bool ready() const { return count > 0 && recharge_remaining_ms <= 0.0; }

  /** Advance the timer; returns true when the slot became ready this step. */
  void clear() {
    type_id = 0;
    count = 0;
    recharge_remaining_ms = 0.0;
    instances.fill(EntityHandle{});
  }

  bool advance(double delta_milliseconds) {
    if (count == 0 || recharge_remaining_ms <= 0.0) return false;
    recharge_remaining_ms -= delta_milliseconds;
    if (recharge_remaining_ms > 0.0) return false;
    recharge_remaining_ms = 0.0;
    return true;
  }
};

} // namespace engine
