#pragma once
#include <compare>
#include <cstdint>

namespace engine {
/** Room-local persistent identity. Zero is invalid; a registry never reuses IDs. */
struct PlayerId {
  std::uint64_t raw = 0;
  [[nodiscard]] constexpr bool valid() const { return raw != 0; }
  constexpr auto operator<=>(const PlayerId&) const = default;
};
using LifeEpoch = std::uint64_t;
} // namespace engine
