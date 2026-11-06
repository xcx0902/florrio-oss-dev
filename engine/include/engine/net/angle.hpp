#pragma once
#include <cmath>
#include <cstdint>

namespace engine {

/** Quantize a simulation angle for snapshots: take the positive floating
 * remainder in [0, 2*pi), scale by 65535/2*pi in f64, truncate (not round) and
 * keep the low 16 bits. This quantizes replication only; the simulation angle
 * is unchanged. */
[[nodiscard]] inline std::uint16_t pack_snapshot_angle(double radians) {
  constexpr double kTau = 6.283185307179586;
  double value = std::fmod(radians, kTau);
  if (value < 0.0) {
    value += kTau;
  }
  value *= 0x1.45f1c0e995ab9p+13;
  if (!(value >= 0.0 && value < 4294967296.0)) {
    return 0U;
  }
  return static_cast<std::uint16_t>(static_cast<std::uint32_t>(value));
}

}  // namespace engine
