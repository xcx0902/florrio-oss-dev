#pragma once
#include "engine/model/entity.hpp"
#include <cstdint>

namespace engine {

/** One equipped petal slot with its catalog recharge timer. The equipped
 * instance handles live in `PlayerLoadout`; this record owns only the slot
 * type, its catalog instance count and the shared recharge window. */
struct PetalSlot {
  catalog::PetalId type_id = catalog::PetalId::kNone;
  std::uint8_t count = 0;
  double recharge_remaining_ms = 0.0;

  [[nodiscard]] bool ready() const { return count > 0 && recharge_remaining_ms <= 0.0; }

  void clear() {
    type_id = catalog::PetalId::kNone;
    count = 0;
    recharge_remaining_ms = 0.0;
  }

  /** Advance the timer; returns true when the slot became ready this step. */
  bool advance(double delta_milliseconds) {
    if (count == 0 || recharge_remaining_ms <= 0.0) {
      return false;
    }
    recharge_remaining_ms -= delta_milliseconds;
    if (recharge_remaining_ms > 0.0) {
      return false;
    }
    recharge_remaining_ms = 0.0;
    return true;
  }
};

}  // namespace engine
