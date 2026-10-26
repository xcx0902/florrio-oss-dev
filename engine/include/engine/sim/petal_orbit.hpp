#pragma once
#include "engine/core/f32.hpp"
#include <cmath>
#include <cstdint>
#include <string_view>

namespace engine {

/** Original server petal orbit tracks. Input bit 0 means outward (attack) and
 * takes priority over bit 1 (inward/defend). */
enum class OrbitProfile : std::uint8_t {
  kDefault = 0,
  kBasic,
  kFast,
  kHeavy,
  kRock,
  kIris,
  kHeaviest,
  kWing,
};

struct OrbitRadii {
  f32 rest;
  f32 outward;
  f32 inward;
};

[[nodiscard]] constexpr OrbitRadii orbit_radii(OrbitProfile profile) {
  switch (profile) {
    case OrbitProfile::kBasic: return {f32(65.0F), f32(130.0F), f32(40.0F)};
    case OrbitProfile::kFast: return {f32(65.0F), f32(145.0F), f32(40.0F)};
    case OrbitProfile::kHeavy: return {f32(65.0F), f32(120.0F), f32(50.0F)};
    case OrbitProfile::kRock: return {f32(65.0F), f32(110.0F), f32(55.0F)};
    case OrbitProfile::kIris: return {f32(65.0F), f32(140.0F), f32(40.0F)};
    case OrbitProfile::kHeaviest: return {f32(65.0F), f32(100.0F), f32(65.0F)};
    case OrbitProfile::kWing: return {f32(65.0F), f32(140.0F), f32(40.0F)};
    case OrbitProfile::kDefault: break;
  }
  return {f32(65.0F), f32(130.0F), f32(40.0F)};
}

/** Rose-family orbit functions keep their contracted 65u ring even while the
 * attack button is held; defending still pulls them in to 40u. */
[[nodiscard]] constexpr bool is_rose_orbit_function(std::uint32_t function) {
  return function == 665U || function == 682U || function == 723U;
}

[[nodiscard]] constexpr f32 rose_orbit_radius(std::uint8_t inputs) {
  return (inputs & 2U) != 0U ? f32(40.0F) : f32(65.0F);
}

[[nodiscard]] constexpr f32 orbit_radius(OrbitProfile profile, std::uint8_t inputs) {
  const OrbitRadii radii = orbit_radii(profile);
  if ((inputs & 1U) != 0U) return radii.outward;
  if ((inputs & 2U) != 0U) return radii.inward;
  return radii.rest;
}

/** Wing/Dandelion-style wave track: rest 65 + 10*wave, outward
 * 140 + 50*wave, inward 40 + 5*wave. Input bit 0 wins over bit 1. */
/** Map the generated catalog's orbit-profile name to the enum. */
[[nodiscard]] inline OrbitProfile orbit_profile_from_name(const char* name) {
  if (name == nullptr) return OrbitProfile::kDefault;
  const std::string_view value(name);
  if (value == "basic") return OrbitProfile::kBasic;
  if (value == "fast") return OrbitProfile::kFast;
  if (value == "heavy") return OrbitProfile::kHeavy;
  if (value == "rock") return OrbitProfile::kRock;
  if (value == "iris") return OrbitProfile::kIris;
  if (value == "heaviest") return OrbitProfile::kHeaviest;
  if (value == "wing") return OrbitProfile::kWing;
  return OrbitProfile::kDefault;
}

[[nodiscard]] inline f32 wing_orbit_radius(std::uint8_t inputs, f32 phase) {
  const f32 wave = f32::from_double(std::sin(static_cast<double>(phase.value)));
  if ((inputs & 1U) != 0U) return f32::from_double(140.0 + 50.0 * static_cast<double>(wave.value));
  if ((inputs & 2U) != 0U) return f32::from_double(40.0 + 5.0 * static_cast<double>(wave.value));
  return f32::from_double(65.0 + 10.0 * static_cast<double>(wave.value));
}

} // namespace engine
