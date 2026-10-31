#pragma once
#include "engine/model/entity.hpp"
#include "engine/model/effect_payload.hpp"
#include <cmath>
#include <memory>
#include <vector>

namespace engine {
// The original host call fmod(angle, 2*pi); 6924 is the signature pointer,
// not a modulus.
inline constexpr double kInputTau = 0x1921fb54442d18ULL * 0x1p-50;
inline constexpr double kInputAngleModulus = kInputTau;
inline constexpr double kDirectionScale = 0x144ad13d5bfebaULL * 0x1p-47;

/** Original inputButtons direction packing. */
[[nodiscard]] inline std::uint32_t pack_direction(f32 angle) {
  const f32 normalized(static_cast<float>(std::fmod(static_cast<double>(angle.value), kInputAngleModulus)));
  const double wrapped = std::fmod(static_cast<double>(normalized.value), kInputTau);
  const double scaled = std::floor(std::fmod(wrapped + kInputTau, kInputTau) * kDirectionScale);
  if (scaled >= 0.0 && scaled < 4294967296.0) return static_cast<std::uint32_t>(scaled);
  return 0U;
}

/** One coalesced hit notification. The original merges repeated damage to the
 * same entity epoch into a single outgoing message, so the client sees one hit
 * per target per tick. */
struct HitEvent {
  EntityHandle target{};
  EntityHandle attacker{};
  f32 amount = f32(0.0F);
  f32 health_after = f32(0.0F);
  std::uint64_t tick = 0;
  std::uint32_t count = 0;
  /** Entity epoch carried by the original 4124-byte message object. */
  std::uint32_t epoch = 0;
  /** Shared-message reference count (original message+4). */
  std::uint32_t refcount = 1;
  /** False while the target is not yet in the sorted known-entity list. */
  bool known = true;
};

/** One area-effect owner. Targets share `payload`; the vector is rebuilt from
 * the spatial query each tick, matching original 271/updateAreaEffectTargets. */
struct AreaEffect {
  EntityHandle owner{};
  f32 scale = f32(0.0F);
  std::shared_ptr<EffectPayload> payload;
  std::vector<EntityHandle> targets;
};

/** Deferred Peas radial launch (original scheduler entry +1 ms). */
struct DeferredLaunch {
  double due_ms = 0.0;
  f32 phase = f32(0.0F);
  std::vector<EntityHandle> children;
  /** Insertion order, used as the stable tie-breaker for equal due times. */
  std::uint64_t sequence = 0;
};

/** Original ant-hole species component (species+136, 12-byte pool record).
 * The world keeps the same append/swap-remove order as the original dense
 * component vector; `release_index` is the next entry in the 4848/4852 table. */
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


} // namespace engine
