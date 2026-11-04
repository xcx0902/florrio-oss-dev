#pragma once
#include "engine/catalog/state_flag_bits.hpp"
#include <cstdint>
#include <type_traits>

namespace engine {

template <typename Bits, typename Flag>
[[nodiscard]] constexpr bool has_flag(Bits bits, Flag flag) {
  static_assert(std::is_enum_v<Flag>);
  return (bits & static_cast<Bits>(flag)) != 0;
}

template <typename Bits, typename Flag>
constexpr void set_flag(Bits& bits, Flag flag, bool enabled) {
  static_assert(std::is_enum_v<Flag>);
  if (enabled) {
    bits = static_cast<Bits>(bits | static_cast<Bits>(flag));
  } else {
    bits = static_cast<Bits>(bits & static_cast<Bits>(~static_cast<Bits>(flag)));
  }
}

}  // namespace engine
