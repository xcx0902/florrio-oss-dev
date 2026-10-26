#pragma once
#include "engine/core/vec2.hpp"
#include "engine/model/entity.hpp"
#include <cstdint>

namespace engine {

/** Orbit bookkeeping for a spawned petal entity. */
struct PetalOrbitState {
  EntityHandle handle;
  std::uint16_t type_id = 0;
  Vec2 center;
  f32 orbit_radius;
  f32 angle;
  /** Orbit slot assigned by original function 85 (`petal +18`). The angle is
   * recomputed every tick as index*2*pi/unlockedSlots + loadout phase. */
  std::uint8_t orbit_index = 0;
  /** Full-width orbit angle used by sin/cos (the original keeps it in f64; only
   * the loadout phase is binary32). */
  double orbit_angle = 0.0;
  f32 phase = f32(0.0F);
  std::uint8_t slot = 0xFF;
  std::uint8_t instance = 0;
  std::uint8_t profile = 0;  // engine::OrbitProfile
  std::uint16_t orbit_function = 0;
  f32 extra_radius = f32(0.0F);
  std::uint8_t instance_count = 1;
  std::uint8_t behavior_state = 0;
  /** Absolute creation clock used by Rose's strict one-second gate. */
  double behavior_started_at_ms = 0.0;
};

} // namespace engine
