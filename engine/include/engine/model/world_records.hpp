#pragma once
#include "engine/model/entity.hpp"
#include "engine/model/effect_payload.hpp"
#include <cmath>
#include <memory>
#include <vector>

namespace engine {
// Direction packing constants: one full turn as a double, and the 2*pi -> 255
// scale that maps a wrapped angle onto the direction byte range.
inline constexpr double kInputTau = 0x1921fb54442d18ULL * 0x1p-50;
inline constexpr double kInputAngleModulus = kInputTau;
inline constexpr double kDirectionScale = 0x144ad13d5bfebaULL * 0x1p-47;

/** Pack a float angle into the inputButtons direction word: take the remainder
 * in f64 and narrow it to f32, wrap the narrowed value to [0, 2*pi) in f64,
 * scale by 255/2*pi, truncate, and yield zero when the scaled value leaves the
 * u32 range. */
[[nodiscard]] inline std::uint32_t pack_direction(f32 angle) {
  const f32 normalized(
      static_cast<float>(std::fmod(static_cast<double>(angle.value), kInputAngleModulus)));
  const double wrapped = std::fmod(static_cast<double>(normalized.value), kInputTau);
  const double scaled = std::floor(std::fmod(wrapped + kInputTau, kInputTau) * kDirectionScale);
  if (scaled >= 0.0 && scaled < 4294967296.0) {
    return static_cast<std::uint32_t>(scaled);
  }
  return 0U;
}

/** One coalesced hit notification. Repeated damage to the same target in a
 * tick merges into one event; `count` records how many hits were merged. */
struct HitEvent {
  EntityHandle target{};
  EntityHandle attacker{};
  f32 amount = f32(0.0F);
  f32 health_after = f32(0.0F);
  std::uint64_t tick = 0;
  std::uint32_t count = 0;
  std::uint32_t epoch = 0;
  DamageSource source;
};

/** One area-effect owner. Targets share `payload`; the vector is rebuilt from
 * the spatial query each time the area is refreshed. */
struct AreaEffect {
  EntityHandle owner{};
  f32 scale = f32(0.0F);
  std::shared_ptr<EffectPayload> payload;
  std::vector<EntityHandle> targets;
};

/** Deferred Peas radial launch: entries become due one millisecond after they are
 * scheduled. */
struct DeferredLaunch {
  double due_ms = 0.0;
  f32 phase = f32(0.0F);
  std::vector<EntityHandle> children;
  /** Insertion order, used as the stable tie-breaker for equal due times. */
  std::uint64_t sequence = 0;
};

/** Ant-hole release cursor. `release_index` is the next entry of the 33-step
 * health-ratio table; entries are appended on registration and removed by
 * swap-with-last, so the order is stable only while nothing unregisters. */
struct AntHoleRelease {
  EntityHandle entity{};
  std::uint32_t release_index = 0;
};

/** Last decoded player input. */
struct PlayerInput {
  std::uint32_t buttons = 0;
  f32 angle;
  f32 strength;
  f32 normalized_angle;
  std::uint32_t direction = 0;
};

}  // namespace engine
