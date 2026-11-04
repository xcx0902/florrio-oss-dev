#pragma once
#include <cstdint>

namespace engine {

/** Attack action selected by a mob profile. These are domain behaviors, not
 * protocol or implementation callback numbers. */
enum class AttackBehavior : std::uint8_t {
  kNone = 0,
  kHornetStinger,
};

}  // namespace engine
