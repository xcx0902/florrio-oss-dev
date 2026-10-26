#pragma once
#include "engine/core/f32.hpp"
#include <cstdint>
#include <utility>

namespace engine {

/** 64-bit LCG used by the server entity-handle initializer.
 * state = state * 6364136223846793005 + 1; generation = state >> 33. */
class MinstdRng {
 public:
  explicit constexpr MinstdRng(std::uint64_t seed = 0x6f6c6446ULL) : state_(seed) {}

  [[nodiscard]] constexpr std::uint64_t next_state() {
    state_ = state_ * 6364136223846793005ULL + 1ULL;
    return state_;
  }
  [[nodiscard]] constexpr std::uint32_t next_generation() {
    return static_cast<std::uint32_t>(next_state() >> 33U);
  }
  [[nodiscard]] constexpr std::uint64_t state() const { return state_; }
  constexpr void seed(std::uint64_t value) { state_ = value; }

 private:
  std::uint64_t state_;
};

/** Server Park-Miller variant used by spawn selection and combat:
 * state = (state % 44488) * 48271 - (state / 44488) * 3399, corrected
 * into [1, 2147483647]. */
class ServerRng {
 public:
  explicit constexpr ServerRng(std::uint32_t seed = 1U) : state_(seed) {}

  [[nodiscard]] constexpr std::uint32_t next() {
    ++draws_;
    const std::uint32_t quotient = state_ / 44488U;
    const std::uint32_t product = (state_ + quotient * static_cast<std::uint32_t>(-44488)) * 48271U;
    const std::uint32_t correction = quotient * 3399U;
    state_ = (product < correction ? 2147483647U : 0U) + product - correction;
    return state_;
  }

  [[nodiscard]] static constexpr std::uint32_t successor(std::uint32_t state) {
    const std::uint32_t quotient = state / 44488U;
    const std::uint32_t product = (state + quotient * static_cast<std::uint32_t>(-44488)) * 48271U;
    const std::uint32_t correction = quotient * 3399U;
    return (product < correction ? 2147483647U : 0U) + product - correction;
  }

  [[nodiscard]] static constexpr f32 fraction(std::uint32_t state) {
    const f32 value = f32(static_cast<float>(state - 1U));
    return value * f32(0x1p-31f);
  }

  [[nodiscard]] constexpr f32 next_fraction() {
    ++draws_;
    state_ = successor(state_);
    return fraction(state_);
  }

  /** Two draws used by one spawn position trial; the second becomes the new
   * state, matching the original peek/advance sequence. */
  [[nodiscard]] constexpr std::pair<f32, f32> next_fraction_pair() {
    draws_ += 2U;
    const std::uint32_t first = successor(state_);
    const std::uint32_t second = successor(first);
    state_ = second;
    return {fraction(first), fraction(second)};
  }

  [[nodiscard]] constexpr std::uint32_t state() const { return state_; }
  /** Diagnostic: number of values drawn since seed (phase attribution). */
  [[nodiscard]] constexpr std::uint32_t draws() const { return draws_; }
  constexpr void seed(std::uint32_t value) { state_ = value == 0U ? 1U : value; draws_ = 0U; }

 private:
  std::uint32_t state_;
  std::uint32_t draws_ = 0U;
};

/** Park-Miller minimal standard generator (client-side reference). */
class ParkMillerRng {
 public:
  explicit constexpr ParkMillerRng(std::int32_t seed = 1) : state_(seed == 0 ? 1 : seed) {}

  [[nodiscard]] constexpr std::int32_t next() {
    state_ = static_cast<std::int32_t>((static_cast<std::int64_t>(state_) * 16807) % 2147483647);
    return state_;
  }
  [[nodiscard]] constexpr std::int32_t state() const { return state_; }

 private:
  std::int32_t state_;
};

} // namespace engine
