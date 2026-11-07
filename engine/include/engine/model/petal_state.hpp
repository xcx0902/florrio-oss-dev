#pragma once
#include "engine/sim/petal_orbit.hpp"
#include "engine/catalog/ids.hpp"
#include "engine/core/vec2.hpp"
#include "engine/model/entity.hpp"
#include <cstdint>

namespace engine {

/** Orbit bookkeeping for a spawned petal entity. */
struct PetalOrbitState {
  EntityHandle handle;
  catalog::PetalId type_id = catalog::PetalId::kNone;
  Vec2 center;
  f32 orbit_radius;
  f32 angle;
  /** Orbit slot assigned when the petal is equipped. The angle is
   * recomputed every tick as index*2*pi/unlockedSlots + loadout phase. */
  std::uint8_t orbit_index = 0;
  /** Full-width orbit angle fed to sin/cos; only the loadout phase narrows to
   * binary32. */
  double orbit_angle = 0.0;
  f32 phase = f32(0.0F);
  std::uint8_t slot = 0xFF;
  std::uint8_t instance = 0;
  OrbitProfile profile = OrbitProfile::kDefault;
  /** Catalog behavior for this petal, taken from its catalog entry. */
  catalog::PetalBehavior behavior = catalog::PetalBehavior::kOrbit;
  /** Heal amount used only by PetalBehavior::kRoseHeal. */
  f32 heal_amount = f32(0.0F);
  f32 extra_radius = f32(0.0F);
  std::uint8_t instance_count = 1;
  std::uint8_t behavior_state = 0;
  /** Absolute creation clock used by Rose's strict one-second gate. */
  double behavior_started_at_ms = 0.0;
};

}  // namespace engine
