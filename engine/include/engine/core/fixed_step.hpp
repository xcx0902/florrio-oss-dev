#pragma once
#include <cstdint>

namespace engine {

inline constexpr std::uint32_t kTickHz = 20;
inline constexpr std::uint32_t kTickMilliseconds = 1000 / kTickHz;
inline constexpr double kMaxStepMilliseconds = 100.0;

/** Accumulator for a fixed 20 Hz server tick. */
class FixedStepClock {
 public:
  explicit constexpr FixedStepClock(double start_milliseconds = 0.0) : now_(start_milliseconds) {}

  /** Advance to `now_milliseconds`, returning the number of whole ticks due.
   * Deltas are clamped to kMaxStepMilliseconds, matching the original server. */
  [[nodiscard]] std::uint32_t advance(double now_milliseconds) {
    if (now_milliseconds < now_) now_ = now_milliseconds;
    double delta = now_milliseconds - now_;
    if (delta > kMaxStepMilliseconds) delta = kMaxStepMilliseconds;
    now_ += delta;
    accumulator_ += delta;
    std::uint32_t steps = 0;
    while (accumulator_ >= static_cast<double>(kTickMilliseconds)) {
      accumulator_ -= static_cast<double>(kTickMilliseconds);
      ++steps;
    }
    return steps;
  }

  [[nodiscard]] constexpr double now() const { return now_; }
  [[nodiscard]] constexpr double accumulator() const { return accumulator_; }

 private:
  double now_;
  double accumulator_ = 0.0;
};

} // namespace engine
